# LLM Expense Tracker - GAS Receiver

This Apps Script is intentionally a dumb ingestion endpoint.

## Responsibilities

- Accept Tasker POST requests containing `notifications`.
- Validate the minimum required fields.
- Append every valid notification to the `Inbox` sheet with `Status = PENDING`.
- Do not classify, deduplicate financial transactions, create monthly transactions, call an LLM, or send Telegram messages.

## Inbox schema

1. Event ID
2. Received At
3. Datetime
4. Title
5. Raw Text
6. Source App
7. Notification ID
8. Status
9. Transaction ID
10. Processed At
11. Notes

`Event ID` is the stable identifier ChatGPT should use when updating rows.

Suggested statuses for the ChatGPT processor:

- `PENDING` - not processed yet
- `PROCESSED` - source notification used to create a transaction
- `DUPLICATE` - same financial transaction as another source notification
- `IGNORED` - not a financial transaction
- `REVIEW` - uncertain and needs manual review

For cross-channel duplicates, keep all Inbox rows. ChatGPT should link duplicate source rows to the same `Transaction ID` rather than deleting the raw evidence.

## Deployment

1. Put `Code.js` and `set_secret.js` in the Apps Script project.
2. Delete the old LLM/sync/stock/manual files if this project is now receiver-only.
3. Run `setupSecrets()` once after replacing the spreadsheet ID placeholder.
4. Deploy as a Web App and keep the existing Tasker POST format.

The receiver accepts timestamps in either Unix seconds or Unix milliseconds.
