const SHEET_ID = getSecret('SHEET_ID');
const INBOX_SHEET = 'Inbox';
const INBOX_HEADERS = [
  'Event ID',
  'Received At',
  'Datetime',
  'Title',
  'Raw Text',
  'Source App',
  'Notification ID',
  'Status',
  'Transaction ID',
  'Processed At',
  'Notes'
];

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    const notifications = Array.isArray(body.notifications) ? body.notifications : [];

    if (!notifications.length) {
      return jsonResponse({ ok: false, error: 'Expected a non-empty notifications array.' });
    }

    const receivedAt = formatDate(new Date());
    const records = notifications
      .map(notification => toInboxRecord(notification, receivedAt))
      .filter(Boolean);

    const result = queueNewRecords(records);

    return jsonResponse({
      ok: true,
      received: notifications.length,
      queued: result.queued,
      duplicates: result.duplicates,
      rejected: notifications.length - records.length
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message });
  }
}

function toInboxRecord(notification, receivedAt) {
  if (!notification || !notification.app || !notification.text || notification.timestamp == null) {
    return null;
  }

  const rawTimestamp = Number(notification.timestamp);
  const millis = rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp;
  const notificationDate = new Date(millis);

  if (Number.isNaN(notificationDate.getTime())) {
    return null;
  }

  const app = String(notification.app);
  const title = String(notification.title || '');
  const text = String(notification.text);
  const notificationId = String(notification._id == null ? '' : notification._id);
  const eventId = makeEventId(app, notificationId, millis, title, text);

  return {
    eventId,
    row: [
      eventId,
      receivedAt,
      formatDate(notificationDate),
      title,
      text,
      app,
      notificationId,
      'PENDING',
      '',
      '',
      ''
    ]
  };
}

function queueNewRecords(records) {
  if (!records.length) return { queued: 0, duplicates: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getOrCreateInboxSheet();
    const seen = new Set();
    const rows = [];
    let duplicates = 0;

    for (const record of records) {
      // Covers the same notification appearing twice in one Tasker batch.
      if (seen.has(record.eventId)) {
        duplicates++;
        continue;
      }
      seen.add(record.eventId);

      // Covers Tasker retrying/reposting an event already persisted in Inbox.
      if (eventExists(sheet, record.eventId)) {
        duplicates++;
        continue;
      }

      rows.push(record.row);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, INBOX_HEADERS.length).setValues(rows);
    }

    return { queued: rows.length, duplicates };
  } finally {
    lock.releaseLock();
  }
}

function eventExists(sheet, eventId) {
  if (sheet.getLastRow() < 2) return false;

  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(eventId)
    .matchEntireCell(true)
    .findNext() !== null;
}

function makeEventId(app, notificationId, millis, title, text) {
  const canonical = [app, notificationId, String(millis), title, text].join('\u001f');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonical,
    Utilities.Charset.UTF_8
  );

  const hex = digest
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0'))
    .join('');

  return `evt_${hex}`;
}

function getOrCreateInboxSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(INBOX_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(INBOX_SHEET);
    sheet.getRange(1, 1, 1, INBOX_HEADERS.length).setValues([INBOX_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, INBOX_HEADERS.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, INBOX_HEADERS.length);
    return sheet;
  }

  const headers = sheet.getRange(1, 1, 1, INBOX_HEADERS.length).getValues()[0];
  if (headers.join('|') !== INBOX_HEADERS.join('|')) {
    throw new Error(`Unexpected ${INBOX_SHEET} schema. Expected: ${INBOX_HEADERS.join(', ')}`);
  }

  return sheet;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
