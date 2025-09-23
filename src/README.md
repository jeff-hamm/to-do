# Universal Todo System

A powerful, Google Sheets-integrated todo application extracted from the infinite-hips project.

## Features

- **Google Sheets Integration**: Optional bidirectional sync with Google Sheets for collaborative task management
- **Local Storage Fallback**: Works entirely offline using browser localStorage when Google Sheets is disabled
- **Advanced Filtering**: Filter by status, priority, due date, category, and more
- **Responsive Design**: Mobile-first design that works on all devices
- **Real-time Sync**: Automatic synchronization with configurable intervals (when using Google Sheets)
- **Rich Task Management**: Categories, priorities, due dates, assignments, and more
- **Date Picker Integration**: Flatpickr integration for flexible date selection including date ranges
- **Progress Tracking**: Visual progress indicators and completion statistics
- **Customizable Theming**: Easy theme customization through CSS variables
- **Highly Configurable**: Extensive configuration options through `config.js`

## Quick Start

### Option 1: Local Storage Only (Simplest)

1. **Copy the files** to your project:
   ```
   todo-system/
   ├── index.html
   ├── app.js
   ├── styles.css
   ├── config.js
   └── README.md
   ```

2. **Open `config.js`** and customize:
   ```javascript
   const TODO_CONFIG = {
       projectName: "My Todo App",
       projectId: "my-todos",
       googleSheets: { enabled: false }, // Uses localStorage only
       // ... other settings
   };
   ```

3. **Open `index.html`** in your browser - that's it! Tasks are saved locally.

### Option 2: With Google Sheets Integration

#### 1. Copy Files
Same as above - copy all files to your project.

#### 2. Set up Google Sheets

**Create your spreadsheet:**
1. Create a new Google Sheet
2. Add these column headers in row 1:
   ```
   ID | Title | Description | Category | Priority | Timeline | AssignedTo | DueDate | Status | Completed | CreatedAt | UpdatedAt
   ```

**Get the CSV export URL:**
1. File → Share → Publish to the web
2. Choose "Comma-separated values (.csv)"
3. Copy the URL - looks like: `https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0`

#### 3. Create Google Apps Script (for writing data)

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Replace the default code with:

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const spreadsheetId = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your sheet ID
    const sheet = SpreadsheetApp.openById(spreadsheetId).getActiveSheet();
    
    if (data.action === 'add') {
      // Add new task
      const task = data.task;
      sheet.appendRow([
        task.id, task.title, task.description, task.category, 
        task.priority, task.timeline, task.assignedTo, task.dueDate,
        task.status, task.completed, task.createdAt, task.updatedAt
      ]);
    } else if (data.action === 'update') {
      // Update existing task
      const task = data.task;
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === task.id) {
          sheet.getRange(i + 1, 1, 1, 12).setValues([[
            task.id, task.title, task.description, task.category,
            task.priority, task.timeline, task.assignedTo, task.dueDate,
            task.status, task.completed, task.createdAt, task.updatedAt
          ]]);
          break;
        }
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({success: false, error: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

4. Deploy as web app:
   - Click "Deploy" → "New deployment"
   - Choose type: "Web app"
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Copy the web app URL

#### 4. Configure the App

Update your `config.js`:

```javascript
const TODO_CONFIG = {
    projectName: "My Todo App",
    projectId: "my-todos",
    googleSheets: {
        enabled: true,
        spreadsheetId: "your-spreadsheet-id-here",
        csvUrl: "https://docs.google.com/spreadsheets/d/YOUR_ID/export?format=csv&gid=0",
        appScriptUrl: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
    },
    // ... other settings
};
```

## Customization

### Themes

The app uses CSS custom properties for easy theming. Edit these in `styles.css`:

```css
:root {
    --color-bg: #0d1117;           /* Background color */
    --color-text: #f0f6fc;         /* Text color */
    --color-accent: #ff69b4;       /* Primary accent color */
    --color-pink-light: #ffb3da;   /* Secondary accent */
    /* ... more variables */
}
```

Or switch to the light theme by uncommenting the light theme section.

### Configuration Options

The `config.js` file provides extensive customization:

```javascript
const TODO_CONFIG = {
    // Basic settings
    projectName: "Your Project Name",
    projectId: "unique-project-id",
    
    // Google Sheets (optional)
    googleSheets: { enabled: false }, // or configure for sheets
    
    // UI customization
    ui: {
        defaultFilter: "all",
        showProgressBar: true,
        theme: {
            colorPrimary: "#ff69b4",
            colorBackground: "#0d1117"
        },
        form: {
            categories: [
                { value: "work", label: "Work" },
                // ... add your categories
            ]
        }
    },
    
    // Feature toggles
    features: {
        allowTaskCreation: true,
        allowTaskDeletion: false, // Set true to enable
        // ... more options
    }
};
```

### Adding Custom Categories and Priorities

Edit the form configuration in `config.js`:

```javascript
ui: {
    form: {
        categories: [
            { value: "urgent-work", label: "Urgent Work" },
            { value: "meetings", label: "Meetings" },
            { value: "research", label: "Research" }
        ],
        priorities: [
            { value: "critical", label: "Critical", icon: "🚨" },
            { value: "high", label: "High", icon: "🔴" },
            { value: "normal", label: "Normal", icon: "🟡" },
            { value: "low", label: "Low", icon: "🟢" }
        ]
    }
}
```

## File Structure

```
todo-system/
├── index.html          # Main HTML interface
├── app.js             # Core JavaScript functionality (GoogleSheetsChecklist class)
├── styles.css         # Complete CSS styling with responsive design
├── config.js          # Configuration file - customize this for your needs
└── README.md          # This documentation
```

## Browser Support

- Modern browsers with ES6 support
- Chrome, Firefox, Safari, Edge (recent versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Dependencies

- **Flatpickr**: Date picker functionality (loaded from CDN)
- **No framework dependencies**: Pure vanilla JavaScript

## Features in Detail

### Filtering System
- All Tasks, Active, Completed
- High Priority, Due Today, Overdue
- Custom filters configurable in `config.js`

### Task Management
- Create, edit, complete tasks
- Rich task details: title, description, category, priority, due date, assignment
- Bulk operations and progress tracking

### Sync Capabilities
- **Google Sheets Mode**: Bi-directional sync with automatic conflict resolution
- **Local Mode**: Browser localStorage with export/import capabilities
- **Hybrid Mode**: Local caching with periodic Google Sheets sync
- Offline support with automatic sync when connection restored

### Mobile Optimization
- Touch-friendly interface
- Responsive design that works on phones and tablets
- Optimized button sizes and spacing for mobile use

## Troubleshooting

### Google Sheets Issues
- **CORS errors**: Ensure your Apps Script is deployed as a web app with "Anyone" access
- **Data not syncing**: Check the CSV URL is publicly accessible
- **Permission errors**: Verify the spreadsheet has the correct column headers

### Local Storage Issues
- **Data not persisting**: Check if browser allows localStorage for your domain
- **Quota exceeded**: Browser localStorage has limits, consider Google Sheets for large datasets

### General Issues
- **Flatpickr not working**: Ensure CDN links are accessible
- **Styling issues**: Check CSS custom properties are supported in your browser
- **JavaScript errors**: Enable debug mode in `config.js` for detailed logging

## Examples

### Simple Personal Todo List
```javascript
const TODO_CONFIG = {
    projectName: "My Personal Tasks",
    projectId: "personal",
    googleSheets: { enabled: false },
    ui: { 
        theme: { colorPrimary: "#28a745" },
        form: { categories: [
            { value: "home", label: "Home" },
            { value: "personal", label: "Personal" }
        ]}
    }
};
```

### Team Project Management
```javascript
const TODO_CONFIG = {
    projectName: "Team Project Board",
    projectId: "team-tasks",
    googleSheets: {
        enabled: true,
        spreadsheetId: "your-team-sheet-id",
        csvUrl: "https://docs.google.com/spreadsheets/d/ID/export?format=csv",
        appScriptUrl: "https://script.google.com/macros/s/SCRIPT/exec"
    },
    features: {
        allowTaskDeletion: true,
        fields: { assignedTo: { required: true } }
    }
};
```

## Contributing

This system was extracted from the infinite-hips project and generalized for reuse. Feel free to customize and extend it for your needs!

## License

Extracted from infinite-hips project. Use freely in your projects.