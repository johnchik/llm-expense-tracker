# Getting Started

## Prerequisites

You need these free services, plus an Android notification automation app.

- Google account for Apps Script and Sheets.
- Google Sheet to store records.
- GitHub Models key or another OpenAI-compatible LLM API key.
- Telegram bot token and chat ID if you want confirmation messages.
- Tasker on Android to forward selected notifications to Apps Script.

## 1. Create The Google Sheet

Create a spreadsheet and copy its ID from the URL:

```text
https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
```

The script creates these sheets automatically when needed:

- `Logs`: raw notification records, LLM response, sync state, Telegram state.
- `DuplicateIndex`: recently seen notification keys.
- `yyyyMM`: monthly transaction sheets, for example `202606`.
- `StockHolding`: stock trade records.

## 2. Create The Apps Script Project

Create a Google Apps Script project and copy the files from `src/` into it.

Set these script properties in Apps Script:

| Property | Purpose |
| --- | --- |
| `SHEET_ID` | Google Sheet ID |
| `LLM_API_KEY` | LLM API key |
| `LLM_API_ENDPOINT` | OpenAI-compatible chat completions endpoint |
| `TELEGRAM_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Telegram target chat |

Deploy the Apps Script as a web app:

- Execute as: `Me`
- Who has access: `Anyone`

Copy the web app URL. This is the endpoint Tasker will call.

## 3. Configure Tasker

Create a notification event profile for the payment apps you want to track. Send a POST request to the Apps Script web app URL with JSON like this:

```json
{
  "notifications": [
    {
      "_id": "%evtprm1",
      "app": "%evtprm2",
      "title": "%evtprm3",
      "text": "%evtprm4",
      "timestamp": "%TIMEMS"
    }
  ]
}
```

The exact Tasker variable names can differ by profile/plugin. The important part is that every notification sends:

- stable notification ID
- app name
- notification title
- notification text
- timestamp in milliseconds

## 4. Test End To End

Send one known payment notification through Tasker, then check:

- `Logs` has one new row.
- The matching monthly sheet has one transaction row.
- `Telegram Status` in `Logs` is `Sent`.
- You received the Telegram message.

If Telegram failed but the transaction was recorded, run `retryFailedTelegramNotifications` from Apps Script after fixing the token/chat settings.
