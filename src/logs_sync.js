function syncLogsToSheets() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const logsSheet = spreadsheet.getSheetByName('Logs');
    
    if (!logsSheet) {
      console.log('No Logs sheet found');
      return;
    }
    
    const dataRange = logsSheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      console.log('No log records to sync');
      return;
    }
    
    const headers = values[0];
    const records = values.slice(1);
    
    const datetimeIndex = headers.indexOf('Datetime');
    const rawTextIndex = headers.indexOf('Raw Text');
    const sourceAppIndex = headers.indexOf('Source App');
    const notificationIdIndex = headers.indexOf('Notification ID');
    const typeIndex = headers.indexOf('Type');
    const llmResponseIndex = headers.indexOf('LLM Response');
    const syncedIndex = headers.indexOf('Synced');
    
    let syncedCount = 0;
    const syncedRows = [];
    const modifiedSheets = new Set();
    
    records.forEach((record, index) => {
      const rowNumber = index + 2;
      
      const synced = record[syncedIndex];
      const type = record[typeIndex];
      
      if (synced === 'Yes') {
        return;
      }
      
      if (type !== 'transaction' && type !== 'stock_trading') {
        console.log(`Skipping ${type} record (row ${rowNumber})`);
        return;
      }
      
      try {
        const llmResponse = JSON.parse(record[llmResponseIndex]);
        
        if (type === 'transaction') {
          const targetSheet = syncTransactionToMonthlySheet(record[datetimeIndex], llmResponse);
          modifiedSheets.add(targetSheet.getName());
          syncedRows.push(rowNumber);
          syncedCount++;
          console.log(`Synced transaction from row ${rowNumber}`);
          
        } else if (type === 'stock_trading') {
          syncStockTradeToSheet(llmResponse);
          syncedRows.push(rowNumber);
          syncedCount++;
          console.log(`Synced stock trade from row ${rowNumber}`);
        }
        
      } catch (error) {
        console.error(`Error syncing row ${rowNumber}:`, error);
      }
    });
    
    if (syncedRows.length > 0) {
      markLogsRecordsAsSynced(logsSheet, syncedRows);
    }
    
    if (modifiedSheets.size > 0) {
      sortSpecificSheets(modifiedSheets);
    }
    
    console.log(`Sync completed: ${syncedCount} records synced from Logs`);
    
  } catch (error) {
    console.error('Error syncing logs to sheets:', error);
  }
}

function syncTransactionToMonthlySheet(datetime, llmResponse) {
  const entryDate = new Date(datetime);
  const targetSheet = getOrCreateMonthlySheet(entryDate);
  const transactionData = {
    datetime: llmResponse.datetime || datetime,
    category: llmResponse.category || 'Other',
    description: llmResponse.description || '',
    currency: llmResponse.currency || 'HKD',
    amount: llmResponse.amount || 0,
    paymentMethod: llmResponse.paymentMethod || 'Unknown',
    rawText: llmResponse.rawText || 'From Logs'
  };
  
  targetSheet.appendRow([
    transactionData.datetime,
    transactionData.category,
    transactionData.description,
    transactionData.currency,
    transactionData.amount,
    transactionData.paymentMethod,
    transactionData.rawText
  ]);
  
  const lastRow = targetSheet.getLastRow();
  const amountCell = targetSheet.getRange(lastRow, 5);
  amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
  
  return targetSheet;
}

function syncStockTradeToSheet(llmResponse) {
  const sheet = getOrCreateStockHoldingSheet();
  
  if (llmResponse.action === 'Purchase' || llmResponse.action === 'Sell') {
    const totalValue = (llmResponse.shares || 0) * (llmResponse.price || 0);
    
    sheet.appendRow([
      llmResponse.datetime || formatDate(new Date()),
      llmResponse.action,
      llmResponse.ticker,
      llmResponse.shares,
      llmResponse.price,
      totalValue,
      '',
      '',
      llmResponse.rawText || 'From Logs'
    ]);
  }
}

function markLogsRecordsAsSynced(logsSheet, syncedRows) {
  syncedRows.forEach(rowNumber => {
    logsSheet.getRange(rowNumber, 8).setValue('Yes');
  });
  
  console.log(`Marked ${syncedRows.length} log records as synced`);
}

function manualSyncLogs() {
  console.log('Starting manual sync from Logs to sheets...');
  syncLogsToSheets();
}

function testBatchNotificationWorkflow() {
  // Test function for the new batch notification system
  const testNotifications = {
    "notifications": [
      {
        "_id": "test_001",
        "app": "Octopus",
        "text": "八達通: 在 港鐵 支付 HKD 5.9。餘額: HKD 263.6",
        "timestamp": Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      },
      {
        "_id": "test_002", 
        "app": "Mox Bank",
        "text": "💳 輕按此處以驗證你的Mox卡尾1234於2025-08-04 11:20:00HKT 在Test Merchant的網上交易HKD100.00",
        "timestamp": Math.floor(Date.now() / 1000) - 1800 // 30 minutes ago
      },
      {
        "_id": "test_003",
        "app": "PayMe",
        "text": "您收到來自John的轉賬HKD50.00",
        "timestamp": Math.floor(Date.now() / 1000) - 900 // 15 minutes ago
      }
    ]
  };
  
  console.log('Testing batch notification workflow...');
  
  // Simulate the doPost call
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testNotifications)
    }
  };
  
  try {
    const response = doPost(mockEvent);
    const result = JSON.parse(response.getContent());
    
    console.log('Batch processing result:', result);
    
    // Wait a moment, then sync logs to sheets
    Utilities.sleep(2000);
    console.log('Now syncing logs to sheets...');
    syncLogsToSheets();
    
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

function sortSpecificSheets(sheetNames) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    
    sheetNames.forEach(sheetName => {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (sheet) {
        sortSheetByDatetime(sheet);
      }
    });
    
    console.log(`Sorted ${sheetNames.size} modified sheets by date`);
    
  } catch (error) {
    console.error('Error sorting specific sheets:', error);
  }
}

function sortSheetByDatetime(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 2) {
      return; // No data to sort (header + 0-1 data rows)
    }
    
    // Get the data range (excluding header)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    
    // Sort by first column (Datetime) in ascending order
    dataRange.sort({column: 1, ascending: true});
    
    console.log(`Sorted sheet "${sheet.getName()}" by datetime`);
    
  } catch (error) {
    console.error(`Error sorting sheet ${sheet.getName()}:`, error);
  }
}