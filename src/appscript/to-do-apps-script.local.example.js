// Local override example for Apps Script configuration.
// COPY this file to `to-do-apps-script.local.js` and insert your real IDs.
// Ensure `.gitignore` has an entry to ignore `to-do-apps-script.local.js` so secrets are not committed.

const LOCAL_CONFIG = {
  sheetId: 'REPLACE_WITH_REAL_SHEET_ID',
  gid: 'REPLACE_WITH_REAL_GID',
  driveFolderId: 'REPLACE_WITH_REAL_DRIVE_FOLDER_ID'
  // sheetName: 'OptionalExplicitName' // Usually auto-derived from GID
};

function getLocalConfig() {
  return LOCAL_CONFIG;
}
