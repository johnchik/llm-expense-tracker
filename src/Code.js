const SHEET_ID = getSecret('SHEET_ID');

const CONFIG = {
  DUPLICATE_INDEX_MAX_ENTRIES: 1000,
  GMAIL_GROUPED_NOTIFICATION_ID: 0,
  ALLOWED_ZERO_ID_APP: 'ZA Bank',
  DUPLICATE_CHECK_LIMIT: 200
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.notifications && Array.isArray(data.notifications)) {
      return processBatchNotifications(data.notifications);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        type: 'error',
        message: 'Invalid request format. Expected notifications array.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    console.error('Error in doPost:', error);
    return ContentService.createTextOutput(JSON.stringify({
      type: 'error',
      message: 'Failed to process request'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function processBatchNotifications(notifications) {
  const logsSheet = getOrCreateLogsSheet();
  const processedCount = { new: 0, duplicates: 0, errors: 0 };
  const results = [];
  const rowsToAdd = [];
  const duplicateEntries = [];
  
  console.log(`Processing batch of ${notifications.length} notifications`);
  
  for (const notification of notifications) {
    try {
      const { _id, app, title, text, timestamp } = notification;
      
      if (!app || !text || timestamp === undefined) {
        console.log(`Skipping invalid notification: missing required fields`);
        processedCount.errors++;
        continue;
      }
      
      if (_id == CONFIG.GMAIL_GROUPED_NOTIFICATION_ID && app !== CONFIG.ALLOWED_ZERO_ID_APP) {
        continue;
      }
      const duplicateKey = createDuplicateKey(_id, app, text);
      if (isDuplicateInLogs(logsSheet, duplicateKey)) {
        console.log(`Duplicate notification skipped: ${_id}`);
        processedCount.duplicates++;
        continue;
      }
      
      const formattedDatetime = formatDate(new Date(timestamp)); // Convert Unix to Date
      const llmResult = classifyAndParseLLM(text, title, app, formattedDatetime);
      
      rowsToAdd.push([
        formattedDatetime,
        title,
        text,
        app,
        _id,
        llmResult.type,
        JSON.stringify(llmResult),
        'No'
      ]);
      
      duplicateEntries.push([duplicateKey, _id, app, formattedDatetime]);
      
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
        message: 'Processing failed'
      });
    }
  }
  
  if (rowsToAdd.length > 0) {
    const startRow = logsSheet.getLastRow() + 1;
    logsSheet.getRange(startRow, 1, rowsToAdd.length, 8).setValues(rowsToAdd);
  }
  
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  if (duplicateEntries.length > 0) {
    const startRow = duplicateIndexSheet.getLastRow() + 1;
    duplicateIndexSheet.getRange(startRow, 1, duplicateEntries.length, 4).setValues(duplicateEntries);
  }
  
  const totalIndexEntries = duplicateIndexSheet.getLastRow() - 1;
  console.log(`Batch processed: ${processedCount.new} new, ${processedCount.duplicates} duplicates, ${processedCount.errors} errors`);
  console.log(`Duplicate index now contains ${totalIndexEntries} entries`);
  
  if (processedCount.new > 0) {
    cleanupDuplicateIndex();
  }
  
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


function normalizeAmount(amount) {
  const amountStr = String(amount).trim();
  return amountStr.replace(/[^\d+\-\\.]/g, '');
}

function normalizePaymentMethod(paymentMethod) {
  return String(paymentMethod).trim().toLowerCase();
}

function normalizeText(text) {
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
  return `${id}|${app}|${normalizeText(text)}`;
}

function isDuplicateInLogs(logsSheet, duplicateKey) {
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const lastRow = duplicateIndexSheet.getLastRow();
  
  if (lastRow <= 1) {
    return false;
  }
  
  const rowsToCheck = Math.min(CONFIG.DUPLICATE_CHECK_LIMIT, lastRow - 1);
  const startRow = lastRow - rowsToCheck + 1;
  const range = duplicateIndexSheet.getRange(startRow, 1, rowsToCheck, 1);
  const values = range.getValues();
  
  for (let i = 0; i < values.length; i++) {
    const existingKey = values[i][0];
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

function cleanupDuplicateIndex(maxEntries = CONFIG.DUPLICATE_INDEX_MAX_ENTRIES) {
  const duplicateIndexSheet = getOrCreateDuplicateIndexSheet();
  const lastRow = duplicateIndexSheet.getLastRow();
  
  if (lastRow <= maxEntries + 1) {
    return;
  }
  
  const excessRows = lastRow - maxEntries - 1;
  duplicateIndexSheet.deleteRows(2, excessRows);
  
  console.log(`Cleaned up DuplicateIndex: removed ${excessRows} old entries, keeping ${maxEntries} latest entries`);
}