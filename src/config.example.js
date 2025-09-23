// Example local configuration file
// Copy this file to config.local.js and fill in your real values
// config.local.js is ignored by git and will not be committed

const LOCAL_CONFIG_OVERRIDES = {
    googleSheets: {
        enabled: true, // Set to true to enable Google Sheets integration
        spreadsheetId: 'YOUR_GOOGLE_SHEETS_ID_HERE', // Replace with your Google Sheets ID
        gid: 'YOUR_SHEET_GID_HERE', // Replace with your sheet tab ID (found in URL after #gid=)
        appScriptUrl: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE' // Replace with your Google Apps Script web app URL
    },
    data: {
        audioFile: {
            defaultValue: 'YOUR_GOOGLE_DRIVE_FOLDER_URL_HERE', // Replace with your Google Drive folder URL
            options: {
                driveFolder: 'YOUR_GOOGLE_DRIVE_FOLDER_URL_HERE' // Replace with your Google Drive folder URL
            }
        }
    }
};

// Export for use in main config
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LOCAL_CONFIG_OVERRIDES;
}