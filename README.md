# BowiePhone Todo System

## Overview

This is a powerful, Google Sheets-integrated todo system extracted from the infinite-hips project. It provides:

- **Google Sheets Integration**: Bidirectional sync with Google Sheets
- **Rich Task Management**: Priority levels, categories, timelines, assignments
- **Offline Support**: Works without internet, syncs when reconnected
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Auto-refresh and live synchronization
- **Advanced Filtering**: Filter by status, priority, timeline, category, assignee

## Features

- ✅ **Task Management**: Create, edit, complete, and delete tasks
- 📊 **Progress Tracking**: Visual progress bar and completion statistics
- 🎯 **Priority System**: 4-level priority system (Critical, High, Medium, Low)
- 📅 **Date Management**: Single dates and date ranges with Flatpickr
- 👥 **Assignment System**: Assign tasks to specific people
- 🏷️ **Categories**: Organize tasks by category
- 📱 **Mobile-First**: Responsive design for all devices
- 🔄 **Auto-Sync**: Configurable refresh intervals
- 💾 **Offline Mode**: Local storage backup when disconnected

## Quick Start

1. **Setup Google Sheets** (optional):
   - Create a Google Sheet with the required columns
   - Make it public or set up Google Apps Script for private sheets
   - Update `config.js` with your sheet ID

2. **Configure the App**:
   - Edit `config.js` with your settings
   - Set your sheet ID, refresh interval, etc.

3. **Include in Your Project**:
   ```html
   <link rel="stylesheet" href="todo-system/styles.css">
   <script src="todo-system/config.js"></script>
   <script src="todo-system/app.js"></script>
   ```

## File Structure

- `index.html` - Main todo interface
- `app.js` - Core JavaScript functionality  
- `styles.css` - Complete styling system
- `config.js` - Configuration options
- `README.md` - This documentation

## Configuration

Edit `config.js` to customize:

```javascript
window.CHECKLIST_CONFIG = {
    sheetId: 'your-google-sheet-id',
    gid: 'sheet-tab-id',
    appsScriptUrl: 'your-apps-script-url', // Optional
    refreshInterval: 60000, // 1 minute
    maxRetries: 3
};
```

## Usage Without Google Sheets

The system works great as a local-only todo app:
- Set `sheetId: null` in config.js
- All data stored in localStorage
- No external dependencies needed

## Integration

To integrate into existing projects:

1. Include the CSS and JS files
2. Copy the HTML structure you need
3. Initialize with: `new GoogleSheetsChecklist(config)`

## Customization

The system is highly customizable:
- **Styling**: Modify CSS variables for colors/fonts
- **Fields**: Add/remove task fields in the form
- **Filters**: Customize filter options and logic
- **Sync**: Adjust refresh rates and retry logic

Built with vanilla JavaScript - no frameworks required!