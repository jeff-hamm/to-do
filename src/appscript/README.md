# Google Apps Script Backend

This directory contains Google Apps Script files that provide a universal backend for Google Sheets-based applications.

## Files

- **universal-apps-script.js** - Universal backend that works with any Google Sheet structure. Dynamically reads headers and provides generic CRUD operations.
- **to-do-apps-script.js** - Legacy to-do specific implementation (maintained for backward compatibility)
- **to-do-apps-script.local.js** / **to-do-apps-script.local.example.js** - Local configuration files (not deployed)

## Quick Start

1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Copy the contents of `universal-apps-script.js` into `Code.gs`
4. Deploy as web app with "Anyone" access
5. Use the deployed URL in your client applications

## Usage

The universal backend works with any Google Sheet by reading its headers dynamically:

```javascript
// Get all data
{
  action: 'getData',
  config: {
    sheetId: 'your-sheet-id',
    gid: '0'
  }
}

// Add a row
{
  action: 'addRow',
  config: { sheetId: 'your-sheet-id', gid: '0' },
  rowData: { name: 'New Item', done: false }
}

// Update a row
{
  action: 'updateRow',
  config: { sheetId: 'your-sheet-id', gid: '0' },
  rowId: 'row-5',
  updates: { done: true }
}

// Delete a row
{
  action: 'deleteRow',
  config: { sheetId: 'your-sheet-id', gid: '0' },
  rowId: 'row-5'
}
```

## Schema Support

The backend supports three ways to define data types:

1. **Auto-inferred** (default) - Infers types from data
2. **Client-provided** - Pass schema in request
3. **Schema sheet** - Define schema in a separate sheet tab

Example with schema:
```javascript
{
  action: 'getData',
  config: { sheetId: 'your-sheet-id', gid: '0' },
  schema: {
    'done?': { type: 'boolean', key: 'done' },
    'due date': { type: 'date', key: 'dueDate' }
  }
}
```

## File Upload Support

For applications that need file uploads to Google Drive:

```javascript
{
  action: 'uploadFile',
  config: { 
    sheetId: 'your-sheet-id',
    driveFolderId: 'your-folder-id'
  },
  fileName: 'audio.ogg',
  fileData: 'base64-encoded-data',
  mimeType: 'audio/ogg'
}
```

## Bowie Phone Integration

The backend includes special support for the Bowie Phone firmware, which requires audio file streaming:

- **getSequenceManifest** - Returns firmware-compatible JSON manifest
- **streamAudio** / **getStreamableAudioUrl** - Returns authenticated Google Drive URLs for direct ESP32 streaming

See `universal-apps-script.js` documentation for details.

## Development

When making changes to the Apps Script files:

1. Edit files in this directory
2. Copy updated content to your Apps Script project
3. Test thoroughly before deploying
4. Create a new version/deployment in Apps Script
5. Update client applications to use the new deployment URL

## Notes

- This is a **submodule** of the bowie-phone repository
- Changes here should be committed and pushed to the to-do repository
- The parent bowie-phone repo tracks specific commits from this submodule
