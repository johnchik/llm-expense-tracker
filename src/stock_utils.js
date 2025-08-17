const FMP_API_KEY = getSecret('FMP_API_KEY');
const FMP_API_URL = getSecret('FMP_API_URL');

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Stock Utilities')
    .addItem('Refresh Prices & Summary', 'refreshAllStockData')
    .addToUi();
}

function refreshAllStockData() {
  updateCurrentStockPrices();
  updateHoldingsSummary();
}

function updateCurrentStockPrices() {
  const sheet = getOrCreateStockHoldingSheet();
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values[0];
  
  const tickerIndex = headers.indexOf('Ticker');
  const currentPriceIndex = headers.indexOf('Current Price');
  const currentValueIndex = headers.indexOf('Current Value');
  const sharesIndex = headers.indexOf('Shares');

  if (tickerIndex === -1 || currentPriceIndex === -1 || currentValueIndex === -1 || sharesIndex === -1) {
    SpreadsheetApp.getUi().alert('Could not find required columns in StockHolding sheet.');
    return;
  }

  const tickers = [...new Set(values.slice(1).map(row => row[tickerIndex]))];
  
  if (tickers.length === 0) {
    console.log('No tickers to update.');
    return;
  }

  const prices = fetchStockPrices(tickers);

  if (!prices) {
    SpreadsheetApp.getUi().alert('Failed to fetch stock prices. Check API key and logs.');
    return;
  }

  const updatedValues = values.map((row, i) => {
    if (i === 0) return row;
    const ticker = row[tickerIndex];
    if (prices[ticker]) {
      const currentPrice = prices[ticker];
      const shares = row[sharesIndex];
      row[currentPriceIndex] = currentPrice;
      row[currentValueIndex] = shares * currentPrice;
    }
    return row;
  });

  dataRange.setValues(updatedValues);
}

function fetchStockPrices(tickers) {
  if (!FMP_API_KEY) {
    console.error('FMP_API_KEY is not set.');
    return null;
  }
  
  try {
    const url = `${FMP_API_URL}${tickers.join(',')}?apikey=${FMP_API_KEY}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() !== 200) {
      console.error('FMP API Error:', data);
      return null;
    }

    const prices = {};
    data.forEach(stock => {
      prices[stock.symbol] = stock.price;
    });
    return prices;
  } catch (e) {
    console.error('Error fetching stock prices:', e);
    return null;
  }
}

function updateHoldingsSummary() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let summarySheet = spreadsheet.getSheetByName('Holdings Summary');
  if (!summarySheet) {
    summarySheet = spreadsheet.insertSheet('Holdings Summary', 0);
  }
  summarySheet.clear();
  
  const holdingSheet = getOrCreateStockHoldingSheet();
  const values = holdingSheet.getDataRange().getValues();
  const headers = values.shift();

  const tickerIndex = headers.indexOf('Ticker');
  const actionIndex = headers.indexOf('Action');
  const sharesIndex = headers.indexOf('Shares');
  const priceIndex = headers.indexOf('Price');
  const currentPriceIndex = headers.indexOf('Current Price');

  const holdings = {};

  values.forEach(row => {
    const ticker = row[tickerIndex];
    const action = row[actionIndex];
    const shares = parseFloat(row[sharesIndex]);
    const price = parseFloat(row[priceIndex]);

    if (!holdings[ticker]) {
      holdings[ticker] = { totalShares: 0, totalCost: 0, currentPrice: row[currentPriceIndex] || 0 };
    }

    if (action === 'Purchase') {
      holdings[ticker].totalShares += shares;
      holdings[ticker].totalCost += shares * price;
    } else if (action === 'Sell') {
      if (holdings[ticker].totalShares > 0) {
        const avgBuyPrice = holdings[ticker].totalCost / holdings[ticker].totalShares;
        holdings[ticker].totalCost -= shares * avgBuyPrice;
      }
      holdings[ticker].totalShares -= shares;
    }
  });

  const summaryHeaders = ['Ticker', 'Shares Held', 'Avg. Buy Price', 'Current Price', 'P/L %'];
  summarySheet.getRange(1, 1, 1, summaryHeaders.length).setValues([summaryHeaders]).setFontWeight('bold').setBackground('#f0f0f0');

  const summaryData = [];
  for (const ticker in holdings) {
    const h = holdings[ticker];
    if (h.totalShares > 0) {
      const avgBuyPrice = h.totalCost / h.totalShares;
      const plPercent = h.currentPrice && avgBuyPrice ? ((h.currentPrice - avgBuyPrice) / avgBuyPrice) : 0;
      summaryData.push([ticker, h.totalShares, avgBuyPrice, h.currentPrice, plPercent]);
    }
  }

  if (summaryData.length > 0) {
    const dataRange = summarySheet.getRange(2, 1, summaryData.length, summaryHeaders.length);
    dataRange.setValues(summaryData);
    
    summarySheet.getRange(2, 3, summaryData.length, 2).setNumberFormat('$#,##0.00');
    summarySheet.getRange(2, 5, summaryData.length, 1).setNumberFormat('0.00%');
    const ruleGreen = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground("#d9ead3")
      .setRanges([summarySheet.getRange(2, 5, summaryData.length, 1)])
      .build();
    const ruleRed = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground("#f4cccc")
      .setRanges([summarySheet.getRange(2, 5, summaryData.length, 1)])
      .build();
      
    const rules = summarySheet.getConditionalFormatRules();
    rules.push(ruleGreen, ruleRed);
    summarySheet.setConditionalFormatRules(rules);
  }
  
  summarySheet.autoResizeColumns(1, summaryHeaders.length);
}
