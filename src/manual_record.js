/**
 * manual_record.gs - Handles Google Form submissions for manual transaction entries
 */

function onFormSubmit(e) {
  try {
    console.log('Form submitted, processing manual record...');
    
    // Get the form response values
    // Expected columns: Timestamp, Category, Description, Currency, Amount, Payment Method
    const responses = e.values;
    const timestamp = responses[0]; // First column is timestamp
    const category = responses[1];
    const description = responses[2];
    const currency = responses[3];
    const amount = responses[4];
    const paymentMethod = responses[5];
    
    console.log(`Manual entry: ${amount} ${currency} at ${timestamp}`);
    
    // Determine target monthly sheet based on timestamp
    const entryDate = new Date(timestamp);
    const targetSheet = getOrCreateMonthlySheet(entryDate);
    
    // Format datetime for consistency with other transactions
    const formattedDatetime = formatDate(entryDate);
    
    // Add transaction to target monthly sheet
    // Columns: Datetime, Category, Description, Currency, Amount, Payment Method, Raw Text
    targetSheet.appendRow([
      formattedDatetime,
      category,
      description,
      currency,
      amount,
      paymentMethod,
      'Manual Record' // Raw Text column
    ]);
    
    // Apply formatting to the Amount column for the newly added row
    const lastRow = targetSheet.getLastRow();
    const amountCell = targetSheet.getRange(lastRow, 5); // Column E
    amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
    
    // Mark the record as synced in the Manual Record sheet
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
    const records = values.slice(1); // Skip header row
    
    // Find column indices
    const timestampIndex = headers.indexOf('Timestamp');
    const categoryIndex = headers.indexOf('Category');
    const descriptionIndex = headers.indexOf('Description');
    const currencyIndex = headers.indexOf('Currency');
    const amountIndex = headers.indexOf('Amount');
    const paymentMethodIndex = headers.indexOf('Payment Method');
    
    let syncedCount = 0;
    const syncedRows = [];
    
    records.forEach((record, index) => {
      const rowNumber = index + 2; // +2 because we skipped header and arrays are 0-indexed
      
      // Skip empty rows
      if (!record[timestampIndex]) {
        return;
      }
      
      const timestamp = record[timestampIndex];
      const category = record[categoryIndex] || '';
      const description = record[descriptionIndex] || '';
      const currency = record[currencyIndex] || 'HKD';
      const amount = record[amountIndex] || 0;
      const paymentMethod = record[paymentMethodIndex] || '';
      
      // Determine target monthly sheet
      const entryDate = new Date(timestamp);
      const targetSheet = getOrCreateMonthlySheet(entryDate);
      const formattedDatetime = formatDate(entryDate);
      
      // Add to target sheet
      targetSheet.appendRow([
        formattedDatetime,
        category,
        description,
        currency,
        amount,
        paymentMethod,
        'Manual Record'
      ]);
      
      // Apply formatting to the Amount column
      const lastRow = targetSheet.getLastRow();
      const amountCell = targetSheet.getRange(lastRow, 5);
      amountCell.setNumberFormat('+#,##0.00;#,##0.00;#,##0.00');
      
      syncedRows.push(rowNumber);
      syncedCount++;
      
      const targetSheetName = Utilities.formatDate(entryDate, Session.getScriptTimeZone(), 'yyyyMM');
      console.log(`Synced record ${rowNumber} to ${targetSheetName}: ${amount} ${currency}`);
    });
    
    // Mark synced records or clear them
    if (syncedRows.length > 0) {
      // Option 1: Clear synced rows (recommended)
      // clearSyncedRecords(manualSheet, syncedRows);
      
      // Option 2: Mark as synced (uncomment if preferred)
      markRecordsAsSynced(manualSheet, syncedRows);
    }
    
    console.log(`Sync completed: ${syncedCount} records processed`);
    
  } catch (error) {
    console.error('Error syncing manual records:', error);
  }
}

function clearSyncedRecords(manualSheet, syncedRows) {
  // Sort in descending order to avoid row number shifts when deleting
  syncedRows.sort((a, b) => b - a);
  
  syncedRows.forEach(rowNumber => {
    manualSheet.deleteRow(rowNumber);
  });
  
  console.log(`Cleared ${syncedRows.length} synced records from Manual Record sheet`);
}

function markRecordsAsSynced(manualSheet, syncedRows) {
  // Add a "Synced" column if it doesn't exist
  const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
  let syncedColumnIndex = headers.indexOf('Synced');
  
  if (syncedColumnIndex === -1) {
    // Add Synced column
    syncedColumnIndex = headers.length;
    manualSheet.getRange(1, syncedColumnIndex + 1).setValue('Synced');
  }
  
  // Mark each synced row
  syncedRows.forEach(rowNumber => {
    manualSheet.getRange(rowNumber, syncedColumnIndex + 1).setValue('Yes');
  });
  
  console.log(`Marked ${syncedRows.length} records as synced`);
}

function setupFormTrigger() {
  // Function to manually set up the form submit trigger
  // This creates a trigger that fires when the Google Form submits to the spreadsheet
  
  try {
    // Delete existing triggers first to avoid duplicates
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(trigger);
        console.log('Deleted existing onFormSubmit trigger');
      }
    });
    
    // Get the spreadsheet and create trigger
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
  // Helper function to see what triggers are already set up
  const triggers = ScriptApp.getProjectTriggers();
  console.log('Existing triggers:');
  triggers.forEach((trigger, index) => {
    console.log(`${index + 1}. Function: ${trigger.getHandlerFunction()}, Type: ${trigger.getEventType()}, ID: ${trigger.getUniqueId()}`);
  });
}