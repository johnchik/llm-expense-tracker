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
    const rows = notifications
      .map(notification => toInboxRow(notification, receivedAt))
      .filter(Boolean);

    if (rows.length) {
      appendRows(getOrCreateInboxSheet(), rows);
    }

    return jsonResponse({
      ok: true,
      received: notifications.length,
      queued: rows.length,
      rejected: notifications.length - rows.length
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: error.message });
  }
}

function toInboxRow(notification, receivedAt) {
  if (!notification || !notification.app || !notification.text || notification.timestamp == null) {
    return null;
  }

  const rawTimestamp = Number(notification.timestamp);
  const millis = rawTimestamp < 1e12 ? rawTimestamp * 1000 : rawTimestamp;
  const notificationDate = new Date(millis);

  if (Number.isNaN(notificationDate.getTime())) {
    return null;
  }

  return [
    Utilities.getUuid(),
    receivedAt,
    formatDate(notificationDate),
    String(notification.title || ''),
    String(notification.text),
    String(notification.app),
    String(notification._id == null ? '' : notification._id),
    'PENDING',
    '',
    '',
    ''
  ];
}

function appendRows(sheet, rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, INBOX_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
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
