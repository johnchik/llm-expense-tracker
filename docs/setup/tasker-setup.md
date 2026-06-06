# Tasker Setup

Tasker is responsible for forwarding only the notifications you care about.

## Profile

Create an event profile for notifications from selected apps, for example:

- Octopus
- PayMe
- AlipayHK
- Mox Bank
- ZA Bank
- HSBC
- Gmail or Messages, if your bank sends email/SMS alerts

Keep the app list narrow. Forwarding every notification increases LLM cost and creates noisy non-transaction logs.

## HTTP Request

Create an HTTP POST action:

- URL: your Apps Script web app deployment URL
- Method: `POST`
- Content-Type: `application/json`
- Body:

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

Adjust the `%evtprm*` variables to match your Tasker notification event. The Apps Script endpoint expects the fields `_id`, `app`, `title`, `text`, and `timestamp`.

## Duplicate Handling

The Apps Script side reserves a duplicate key using:

```text
notification id + app name + normalized notification text
```

For best results, send the most stable notification ID available from Tasker or your notification plugin. If an app frequently emits different IDs for the same transaction, the normalized text still helps catch duplicates when the ID is repeated, but it cannot catch every semantic duplicate.

## First Test

Trigger one known transaction and confirm:

- Apps Script execution log shows `batch_processed`.
- `Logs` has one new row.
- `DuplicateIndex` has one reservation row.
- A monthly sheet such as `202606` has the transaction.
- Telegram arrives or `Telegram Status` explains the failure.
