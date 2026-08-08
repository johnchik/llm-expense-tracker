function setupSecrets() {
  PropertiesService.getScriptProperties().setProperty(
    'SHEET_ID',
    'PASTE_YOUR_SPREADSHEET_ID_HERE'
  );
}

function getSecret(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Missing script property: ${key}`);
  return value;
}
