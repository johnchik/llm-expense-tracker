function onFormSubmit(e) {
  try {
    console.log('Form submitted, processing manual record...');
    
    const responses = e.values;
    const timestamp = responses[0];
    const category = responses[1];
    const description = responses[2];
    const currency = responses[3];
    const amount = responses[4];
    const paymentMethod = responses[5];
    
    console.log(`Manual entry: ${amount} ${currency} at ${timestamp}`);
    
    const entryDate = new Date(timestamp);
    const targetSheet = getOrCreateMonthlySheet(entryDate);
    
    const formattedDatetime = formatDate(entryDate);
    
    targetSheet.appendRow([
      formattedDatetime,
      category,
      description,
      currency,
      amount,
      paymentMethod,
      'Manual Record'
    ]);
    
    const lastRow = targetSheet.getLastRow();
    const amountCell = targetSheet.getRange(lastRow, 5);
    amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const manualSheet = spreadsheet.getSheetByName('Manual Record');
    markRecordsAsSynced(manualSheet, [e.range.getRow()]);
    
    const targetSheetName = Utilities.formatDate(entryDate, Session.getScriptTimeZone(), 'yyyyMM');
    console.log(`Manual record synced to sheet: ${targetSheetName}`);
    
  } catch (error) {
    console.error('Error processing form submission:', error);
  }
}


function syncManualRecords() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const manualSheet = spreadsheet.getSheetByName('Manual Record');
    
    if (!manualSheet) {
      console.log('Manual Record sheet not found');
      return;
    }
    
    const dataRange = manualSheet.getDataRange();
    const values = dataRange.getValues();
    
    if (values.length <= 1) {
      console.log('No manual records to sync');
      return;
    }
    
    const headers = values[0];
    const records = values.slice(1);
    
    const timestampIndex = headers.indexOf('Timestamp');
    const categoryIndex = headers.indexOf('Category');
    const descriptionIndex = headers.indexOf('Description');
    const currencyIndex = headers.indexOf('Currency');
    const amountIndex = headers.indexOf('Amount');
    const paymentMethodIndex = headers.indexOf('Payment Method');
    
    let syncedCount = 0;
    const syncedRows = [];
    
    records.forEach((record, index) => {
      const rowNumber = index + 2;
      if (!record[timestampIndex]) {
        return;
      }
      
      const timestamp = record[timestampIndex];
      const category = record[categoryIndex] || '';
      const description = record[descriptionIndex] || '';
      const currency = record[currencyIndex] || 'HKD';
      const amount = record[amountIndex] || 0;
      const paymentMethod = record[paymentMethodIndex] || '';
      
      const entryDate = new Date(timestamp);
      const targetSheet = getOrCreateMonthlySheet(entryDate);
      const formattedDatetime = formatDate(entryDate);
      
      targetSheet.appendRow([
        formattedDatetime,
        category,
        description,
        currency,
        amount,
        paymentMethod,
        'Manual Record'
      ]);
      
      const lastRow = targetSheet.getLastRow();
      const amountCell = targetSheet.getRange(lastRow, 5);
      amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
      
      syncedRows.push(rowNumber);
      syncedCount++;
      
      const targetSheetName = Utilities.formatDate(entryDate, Session.getScriptTimeZone(), 'yyyyMM');
      console.log(`Synced record ${rowNumber} to ${targetSheetName}: ${amount} ${currency}`);
    });
    
    if (syncedRows.length > 0) {
      markRecordsAsSynced(manualSheet, syncedRows);
    }
    
    console.log(`Sync completed: ${syncedCount} records processed`);
    
  } catch (error) {
    console.error('Error syncing manual records:', error);
  }
}

function clearSyncedRecords(manualSheet, syncedRows) {
  syncedRows.sort((a, b) => b - a);
  
  syncedRows.forEach(rowNumber => {
    manualSheet.deleteRow(rowNumber);
  });
  
  console.log(`Cleared ${syncedRows.length} synced records from Manual Record sheet`);
}

function markRecordsAsSynced(manualSheet, syncedRows) {
  const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
  let syncedColumnIndex = headers.indexOf('Synced');
  
  if (syncedColumnIndex === -1) {
    syncedColumnIndex = headers.length;
    manualSheet.getRange(1, syncedColumnIndex + 1).setValue('Synced');
  }
  
  syncedRows.forEach(rowNumber => {
    manualSheet.getRange(rowNumber, syncedColumnIndex + 1).setValue('Yes');
  });
  
  console.log(`Marked ${syncedRows.length} records as synced`);
}

function setupFormTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(trigger);
        console.log('Deleted existing onFormSubmit trigger');
      }
    });
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const trigger = ScriptApp.newTrigger('onFormSubmit')
      .forSpreadsheet(spreadsheet)
      .onFormSubmit()
      .create();
    
    console.log('Form submit trigger created successfully');
    console.log('Trigger ID:', trigger.getUniqueId());
    
  } catch (error) {
    console.error('Error setting up form trigger:', error);
    console.log('Manual setup: Go to Triggers in Apps Script editor and add onFormSubmit trigger manually');
  }
}

function listExistingTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  console.log('Existing triggers:');
  triggers.forEach((trigger, index) => {
    console.log(`${index + 1}. Function: ${trigger.getHandlerFunction()}, Type: ${trigger.getEventType()}, ID: ${trigger.getUniqueId()}`);
  });
}