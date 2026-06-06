# Google Apps Script Setup

## Create The Project

1. Open Apps Script from your Google account.
2. Create a new project.
3. Add each file from `src/` to the Apps Script project.
4. Make sure `appsscript.json` is copied into the project manifest.

## Script Properties

Open **Project Settings > Script properties** and add:

| Property | Example |
| --- | --- |
| `SHEET_ID` | `1abc...xyz` |
| `LLM_API_KEY` | your GitHub Models or LLM key |
| `LLM_API_ENDPOINT` | `https://models.github.ai/inference/chat/completions` |
| `TELEGRAM_TOKEN` | `123456:ABC...` |
| `TELEGRAM_CHAT_ID` | `123456789` |

`SHEET_ID`, `LLM_API_KEY`, and `LLM_API_ENDPOINT` are required for transaction processing. Telegram properties are optional, but without them the record is still saved and `Telegram Status` will show a configuration failure.

## Deploy Web App

Deploy as a web app:

- Execute as: `Me`
- Who has access: `Anyone`

Copy the deployment URL and use it as the Tasker HTTP endpoint.

## Useful Functions To Run Manually

- `syncLogsToSheets`: retry syncing unsynced log rows into monthly sheets.
- `retryFailedTelegramNotifications`: retry Telegram messages for rows with `Telegram Status = Failed`.
- `cleanupDuplicateIndex`: trim old duplicate keys.
- `testDoPost`: local Apps Script smoke test with sample payload.
