# Google Sheets Setup

The spreadsheet is the source of truth. Apps Script creates most tabs automatically, so the minimum setup is creating one blank spreadsheet and storing its ID in `SHEET_ID`.

## Generated Sheets

| Sheet | Purpose |
| --- | --- |
| `Logs` | Raw notification, parsed LLM result, sync state, Telegram state |
| `DuplicateIndex` | Recent duplicate keys reserved before LLM processing |
| `yyyyMM` | Monthly transaction records |
| `StockHolding` | Stock purchase and sell records |
| `Manual Record` | Optional Google Forms responses |

## Recommended Sheet Views

For a better experience inside Google Sheets:

- Freeze the header row on `Logs` and monthly sheets.
- Add filters to monthly sheets.
- Format `Amount` with positive and negative colors.
- Create a pivot table grouped by `Category` and month.
- Create a pivot table grouped by `Payment Method`.
- Hide `Raw Text` and `LLM Response` columns unless debugging.

## Dashboard Roadmap

A standalone dashboard should read exported spreadsheet data rather than replace Sheets immediately.

Recommended first version:

- User selects or drops an Excel/CSV file.
- Dashboard normalizes all `yyyyMM` sheets into one transaction table.
- Charts show monthly spending, category breakdown, merchant ranking, payment method usage, and income versus expense.
- No server is required; everything can run in the browser.

This keeps setup free and avoids asking users for additional cloud services.
