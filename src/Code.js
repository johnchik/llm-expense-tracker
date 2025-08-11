/**
 * Code.gs - Main application logic for Google Sheets transaction tracking
 */

const SHEET_ID = getSecret('SHEET_ID');

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Handle new batch notification format
    if (data.notifications && Array.isArray(data.notifications)) {
      return processBatchNotifications(data.notifications);
    } else {
      // Legacy format - single notification (for backward compatibility)
      return processLegacySingleNotification(data);
    }
    
  } catch (error) {
    console.error('Error in doPost:', error);
    return ContentService.createTextOutput(JSON.stringify({
      type: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function processBatchNotifications(notifications) {
  const logsSheet = getOrCreateLogsSheet();
  const processedCount = { new: 0, duplicates: 0, errors: 0 };
  const results = [];
  
  console.log(`Processing batch of ${notifications.length} notifications`);
  
  for (const notification of notifications) {
    try {
      const { _id, app, title, text, timestamp } = notification;
      
      // Skip Gmail grouped notifications
      if (_id == 0 && app !== 'ZA Bank') {
        continue;
      }
      // Check for duplicates using composite key
      const duplicateKey = createDuplicateKey(_id, app, text);
      if (isDuplicateInLogs(logsSheet, duplicateKey)) {
        console.log(`Duplicate notification skipped: ${_id}`);
        processedCount.duplicates++;
        continue;
      }
      
      // Classify with LLM
      const formattedDatetime = formatDate(new Date(timestamp)); // Convert Unix to Date
      const llmResult = classifyAndParseLLM(text, title, app, formattedDatetime);
      
      // Store in Logs sheet
      logsSheet.appendRow([
        formattedDatetime,    // Datetime
        title,                // Title
        text,                 // Raw Text
        app,                  // Source App
        _id,                  // Notification ID
        llmResult.type,       // Type
        JSON.stringify(llmResult), // LLM Response
        'No'                  // Synced
      ]);
      
      // Add to duplicate index to prevent future duplicates
      addToDuplicateIndex(duplicateKey, _id, app);
      
      results.push({
        id: _id,
        type: llmResult.type,
        status: 'logged'
      });
      
      processedCount.new++;
      
    } catch (error) {
      console.error(`Error processing notification ${notification._id}:`, error);
      processedCount.errors++;
      results.push({
        id: notification._id,
        status: 'error',
        message: error.toString()
      });
    }
  }
  
  // Log detailed statistics
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const totalIndexEntries = duplicateIndexSheet.getLastRow() - 1; // Subtract header
  console.log(`Batch processed: ${processedCount.new} new, ${processedCount.duplicates} duplicates, ${processedCount.errors} errors`);
  console.log(`Duplicate index now contains ${totalIndexEntries} entries`);
  
  // Clean up duplicate index to prevent it from growing too large
  if (processedCount.new > 0) {
    cleanupDuplicateIndex();
  }
  
  // Auto-sync new records to appropriate sheets
  if (processedCount.new > 0) {
    console.log('Auto-syncing new records to monthly/stock sheets...');
    syncLogsToSheets();
  }

  sortSheetByDatetime(logsSheet);
  
  return ContentService.createTextOutput(JSON.stringify({
    type: 'batch_processed',
    summary: processedCount,
    results: results
  })).setMimeType(ContentService.MimeType.JSON);
}

function processLegacySingleNotification(data) {
  // Keep original single notification logic for backward compatibility
  const result = classifyAndParseLLM(data.text, data.title, data.fromApp, data.timestamp);
  
  if (result.type === 'transaction') {
    const sheet = getOrCreateMonthlySheet();
    const isDuplicate = checkForDuplicate(sheet, result);
    
    if (isDuplicate) {
      return ContentService.createTextOutput(JSON.stringify({
        type: 'duplicate',
        message: 'Transaction already recorded'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    sheet.appendRow([
      result.datetime, result.category, result.description,
      result.currency, result.amount, result.paymentMethod, result.rawText
    ]);
    
    const lastRow = sheet.getLastRow();
    const amountCell = sheet.getRange(lastRow, 5);
    amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
    
    return ContentService.createTextOutput(JSON.stringify({
      type: 'transaction',
      parsed: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } else if (result.type === 'stock_trading') {
    recordStockTrade(result);
    return ContentService.createTextOutput(JSON.stringify({
      type: 'stock_trading',
      parsed: result
    })).setMimeType(ContentService.MimeType.JSON);
  } else {
    return ContentService.createTextOutput(JSON.stringify({
      type: result.type,
      message: result.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function recordStockTrade(tradeData) {
  if (tradeData.action === 'Purchase' || tradeData.action === 'Sell') {
    const sheet = getOrCreateStockHoldingSheet();
    const totalValue = tradeData.shares * tradeData.price;
    sheet.appendRow([
      tradeData.datetime,
      tradeData.action,
      tradeData.ticker,
      tradeData.shares,
      tradeData.price,
      totalValue,
      '', // Placeholder for Current Price
      '', // Placeholder for Current Value
      tradeData.rawText
    ]);
  }
}

function getOrCreateStockHoldingSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = 'StockHolding';
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headers = ['Date', 'Action', 'Ticker', 'Shares', 'Price', 'Total Value', 'Current Price', 'Current Value', 'Raw Text'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    sheet.autoResizeColumns(1, headers.length);
  } else {
    // Ensure new columns are present if the sheet already exists
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Current Price') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('Current Price');
    }
    if (headers.indexOf('Current Value') === -1) {
      sheet.getRange(1, headers.length + 2).setValue('Current Value');
    }
  }

  return sheet;
}

function getOrCreateLogsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = 'Logs';
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headers = ['Datetime', 'Title', 'Raw Text', 'Source App', 'Notification ID', 'Type', 'LLM Response', 'Synced'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    
    sheet.autoResizeColumns(1, headers.length);
    console.log('Created new Logs sheet');
  }

  return sheet;
}

function getOrCreateDuplicateIndexSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheetName = 'DuplicateIndex';
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headers = ['Duplicate Key', 'Notification ID', 'Source App', 'Processed Date'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    
    sheet.autoResizeColumns(1, headers.length);
    console.log('Created new DuplicateIndex sheet');
  }

  return sheet;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function getOrCreateMonthlySheet(targetDate = null) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const dateToUse = targetDate || new Date();
  const sheetName = Utilities.formatDate(dateToUse, Session.getScriptTimeZone(), 'yyyyMM');
  
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    // Create new monthly sheet
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Add headers
    const headers = ['Datetime', 'Category', 'Description', 'Currency', 'Amount', 'Payment Method', 'Raw Text'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format headers
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    
    // Format the entire Amount column (column E) with the custom number format
    const amountColumn = sheet.getRange(1, 5, 1000, 1); // Format 1000 rows in column E
    amountColumn.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
    
    // Auto-resize columns
    sheet.autoResizeColumns(1, headers.length);
    
    console.log('Created new sheet: ' + sheetName);
  }
  
  return sheet;
}

function checkForDuplicate(sheet, amount, paymentMethod, rawText) {
  const lastRow = sheet.getLastRow();
  
  // If there are no data rows (only header), no duplicates possible
  if (lastRow <= 1) {
    return false;
  }
  
  // Check last 5 records (or all records if less than 5)
  const recordsToCheck = Math.min(5, lastRow - 1); // Subtract 1 for header row
  const startRow = lastRow - recordsToCheck + 1;
  
  // Get the data for the last 5 records
  // Columns: Datetime(1), Category(2), Description(3), Currency(4), Amount(5), Payment Method(6), Raw Text(7)
  const range = sheet.getRange(startRow, 1, recordsToCheck, 7);
  const values = range.getValues();
  
  console.log(`Checking for duplicates - Amount: ${amount}, Payment Method: ${paymentMethod}`);
  console.log(`Checking last ${recordsToCheck} records from row ${startRow} to ${lastRow}`);
  
  // Check each record for matching amount and payment method
  for (let i = 0; i < values.length; i++) {
    const existingAmount = values[i][4]; // Column E (Amount) - index 4
    const existingPaymentMethod = values[i][5]; // Column F (Payment Method) - index 5
    const existingRawText = values[i][6];
    
    console.log(`Record ${i + 1}: Amount = ${existingAmount}, Payment Method = ${existingPaymentMethod}`);
    
    // Convert amounts to strings for comparison to handle different formats
    const normalizedNewAmount = normalizeAmount(amount);
    const normalizedExistingAmount = normalizeAmount(existingAmount);
    
    // Check if both amount and payment method match
    if (normalizedNewAmount === normalizedExistingAmount && 
        normalizePaymentMethod(paymentMethod) === normalizePaymentMethod(existingPaymentMethod) &&
        normalizePaymentMethod(rawText) === normalizePaymentMethod(existingRawText)) {
      console.log(`Duplicate found! Existing: ${existingAmount} ${existingPaymentMethod}, New: ${amount} ${paymentMethod}`);
      return true;
    }
  }
  
  console.log('No duplicate found');
  return false;
}

function normalizeAmount(amount) {
  // Convert amount to string and remove any whitespace
  const amountStr = String(amount).trim();
  
  // Handle cases where amount might be stored as number or string
  // Remove any currency symbols and normalize the format
  return amountStr.replace(/[^\d+\-\\.]/g, '');
}

function normalizePaymentMethod(paymentMethod) {
  // Convert to string, trim whitespace, and convert to lowercase for case-insensitive comparison
  return String(paymentMethod).trim().toLowerCase();
}

function normalizeText(text) {
  // Convert to string, trim whitespace, and convert to lowercase for comparison
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Test function
function testParsing() {
  const testCases = [
    // Transaction case
    // {
    //   text: "八達通: 在 九巴/龍運 支付 HKD 3.5。餘額: HKD 328.5",
    //   title: "Android版八達通",
    //   fromApp: "Octopus",
    //   timestamp: "2025-07-01 14:30:25"
    // },
    // // Non-transaction case
    // {
    //   text: "您收到來自John的轉賬HKD200.00",
    //   title: "Payme",
    //   fromApp: "PayMe",
    //   timestamp: "2025-07-01 14:30:25"
    // },
    {
      text: "💳 輕按此處以驗證你的Mox卡尾XXXX於2025-07-04 11:20:00HKT 在Driving Test Book的網上交易HKD510.00。如懷疑電28888228或經Mox App聯絡我們。",
      title: "Mox Bank",
      fromApp: "Mox Bank",
      timestamp: "2025-07-04 11:20:02"
    }
  ];
  
  testCases.forEach((testCase, index) => {
    const result = classifyAndParseLLM(testCase.text, testCase.title, testCase.fromApp, testCase.timestamp);
    console.log(`Test ${index + 1}:`, result);
  });
}

function testDoPost() {
  // Test with a non-transaction notification
  data = {
    text: "你好,你已於2025-07-02 02:42:23 將HKD 594.00轉賬至\"+852-1234***5\".交易類 型:轉數快轉賬。你可查看動態以了解款項入賬 情況。如你沒有遞交以上指示,可致電+8523665 3665",
    title: "你已轉賬HKD 594",
    fromApp: "ZA Bank",
    timestamp: "2025-07-02 02:42:23"
  }

  const mockPromoEvent = {
    postData: {
      contents: JSON.stringify(data)
    }
  };
  
  const promoResponse = doPost(mockPromoEvent);
  const promoResponseData = JSON.parse(promoResponse.getContent());
  
  console.log('Promo Response:', promoResponseData);
}

function createDuplicateKey(id, app, text) {
  // Create composite key for duplicate detection
  return `${id}|${app}|${normalizeText(text)}`;
}

function isDuplicateInLogs(logsSheet, duplicateKey) {
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const lastRow = duplicateIndexSheet.getLastRow();
  
  if (lastRow <= 1) {
    return false; // No data rows (only header)
  }
  
  // Get all duplicate keys from the index (column A)
  const range = duplicateIndexSheet.getRange(2, 1, lastRow - 1, 1);
  const values = range.getValues();
  
  // Check if the duplicate key exists in the index
  for (let i = 0; i < values.length; i++) {
    const existingKey = values[i][0]; // Duplicate Key (column A)
    if (duplicateKey === existingKey) {
      console.log(`Duplicate found in index: ${duplicateKey}`);
      return true;
    }
  }
  
  console.log(`No duplicate found for: ${duplicateKey}`);
  return false;
}

function addToDuplicateIndex(duplicateKey, notificationId, sourceApp) {
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const processedDate = formatDate(new Date());
  
  duplicateIndexSheet.appendRow([
    duplicateKey,
    notificationId,
    sourceApp,
    processedDate
  ]);
  
  console.log(`Added to duplicate index: ${duplicateKey}`);
}

function cleanupDuplicateIndex(maxEntries = 1000) {
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const lastRow = duplicateIndexSheet.getLastRow();
  
  if (lastRow <= maxEntries + 1) {
    return; // No cleanup needed (header + data rows <= maxEntries + 1)
  }
  
  const excessRows = lastRow - maxEntries - 1; // Subtract 1 for header
  
  // Delete the oldest entries (rows 2 to 2+excessRows-1)
  duplicateIndexSheet.deleteRows(2, excessRows);
  
  console.log(`Cleaned up DuplicateIndex: removed ${excessRows} old entries, keeping ${maxEntries} latest entries`);
}