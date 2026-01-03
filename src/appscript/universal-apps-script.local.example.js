/**
 * Local Configuration for Universal Apps Script Backend
 * 
 * INSTRUCTIONS:
 * 1. Copy this file to 'universal-apps-script.local.js'
 * 2. Fill in your actual Google Sheet IDs and Drive folder IDs
 * 3. When deploying to Apps Script, concatenate both files or paste
 *    these values into the NAMED_CONFIGS object
 * 
 * NOTE: This file should be in .gitignore to protect your IDs
 */

// Override the NAMED_CONFIGS in universal-apps-script.js with your real values
const NAMED_CONFIGS = {
  'todo': {
    sheetId: 'YOUR_TODO_SHEET_ID',
    gid: '0',
    driveFolderId: 'YOUR_TODO_DRIVE_FOLDER_ID'
  },
  'bowie-phone': {
    sheetId: 'YOUR_BOWIE_PHONE_SHEET_ID',
    gid: '0',
    driveFolderId: 'YOUR_BOWIE_PHONE_DRIVE_FOLDER_ID'
  },
  'pumpkinfest': {
    sheetId: 'YOUR_PUMPKINFEST_SHEET_ID',
    gid: '0',
    driveFolderId: 'YOUR_PUMPKINFEST_DRIVE_FOLDER_ID'
  }
};

/**
 * Called by universal-apps-script.js to get local overrides
 * You can also return a default config if you want one app
 * to work without passing config in requests
 */
function getLocalConfig() {
  // Return empty object - require clients to pass config
  return {};
  
  // OR return a default config:
  // return NAMED_CONFIGS['todo'];
}
