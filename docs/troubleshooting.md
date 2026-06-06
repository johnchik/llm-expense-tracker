# Troubleshooting

## Duplicate Transactions

Check the `DuplicateIndex` sheet.

Expected behavior:

- A key is written before the LLM call starts.
- A second Apps Script execution with the same key should skip the notification.
- The sheet keeps only the latest `DUPLICATE_INDEX_MAX_ENTRIES` entries after cleanup.

If duplicates still happen:

- Confirm Tasker sends a stable `_id`.
- Compare the duplicated `Raw Text` values. Some apps include changing balance or timestamp text, which makes the duplicate key different.
- Increase `DUPLICATE_CHECK_LIMIT` if duplicates can arrive after many other notifications.
- Narrow the Tasker app filter so unrelated notifications do not push useful duplicate keys out of the recent index.

## Transaction Recorded But No Telegram Message

Check the `Logs` row:

- `Synced = Yes` means the transaction was written to the monthly sheet.
- `Target Sheet` and `Target Row` identify where it was written.
- `Telegram Status = Sent` means Telegram accepted the message.
- `Telegram Status = Failed` means the row was recorded but Telegram returned an error or could not be reached.
- `Telegram Error` stores the HTTP response or exception.

After fixing the Telegram bot token, chat ID, or bot permissions, run:

```text
retryFailedTelegramNotifications
```

from the Apps Script editor.

## Telegram Chat ID Problems

Common causes:

- The bot has not been started by the target user.
- The bot was added to a group but cannot post there.
- `TELEGRAM_CHAT_ID` points to the wrong user or group.

Use Telegram's `getUpdates` endpoint after messaging the bot once to discover the correct chat ID.

## LLM Returns Bad JSON

The code strips common Markdown fences and parses the response as JSON. If parsing fails, the script records a fallback transaction with category `Other` and amount `0`.

To improve this:

- Add examples for your local banks or wallets in `src/llm.js`.
- Keep notification body text in the Tasker payload.
- Use a low-temperature model setting.

## Monthly Sheet Missing Rows

Run:

```text
syncLogsToSheets
```

Rows with `Synced = No` and `Type = transaction` or `Type = stock_trading` will be synced.
