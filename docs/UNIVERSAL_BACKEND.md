# Universal Apps Script Backend v2.0

A fully dynamic Google Apps Script backend that serves **any** Google Sheet without hardcoded column names.

## Key Concepts

### Headers ARE the Schema

The backend reads your sheet's header row and automatically:
1. Converts headers to camelCase property names
2. Returns data with those properties
3. Accepts updates using either header names or camelCase keys

**Examples:**
| Header | Property Key |
|--------|-------------|
| `Name` | `name` |
| `Done?` | `done` |
| `Due Date` | `dueDate` |
| `Who Can Help` | `whoCanHelp` |
| `Pumpkin Patch` | `pumpkinPatch` |

### No App-Specific Code Required

The same backend serves:
- **to-do**: `Done? | Task | Category | How | Timeline | Priority | Who Can Help | Notes | Due Date`
- **bowie-phone**: `Name | Number | Link`
- **pumpkinfest**: `Name | Attendance | Need Pumpkin | Bringing | Pumpkin Patch | Patch Dates | Timestamp | Email`
- **ANY other sheet** with any headers

## Setup

### 1. Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Copy `universal-apps-script.js` into Code.gs
4. Deploy → New deployment → Web app
5. Execute as: "Me", Access: "Anyone"
6. Copy the deployment URL

### 2. Use in Your Frontend

```javascript
// Basic usage - headers auto-convert to camelCase
const api = new UniversalSheetAPI('https://script.google.com/.../exec', {
  sheetId: 'your-sheet-id',
  gid: '0'
});

const { rows } = await api.getData();
// rows[0].done, rows[0].task, rows[0].dueDate, etc.
```

## API Reference

### Core CRUD Operations

```javascript
// GET all rows
const { rows, headers, schema } = await api.getData();

// ADD a row (use header names or camelCase keys)
await api.addRow({ name: 'Test', number: '123' });
await api.addRow({ 'Due Date': '2025-12-25', Task: 'Holiday prep' });

// UPDATE a row
await api.updateRow('row-5', { done: true });
await api.updateRow('row-5', { 'Who Can Help': 'Alice, Bob' });

// DELETE a row
await api.deleteRow('row-5');
```

### Response Format

```javascript
{
  success: true,
  data: {
    rows: [
      {
        id: 'row-2',
        rowIndex: 2,
        name: 'John',
        attendance: 'Yes',
        needPumpkin: 'No',
        bringing: 'Cider',
        pumpkinPatch: 'Yes',
        patchDates: 'Sat 10/25',
        timestamp: '2025-10-20T...',
        email: 'john@example.com'
      },
      // ...
    ],
    headers: ['Name', 'Attendance', 'Need Pumpkin', ...],
    schema: {
      'name': { type: 'string', key: 'name', header: 'Name' },
      'attendance': { type: 'string', key: 'attendance', header: 'Attendance' },
      // ...
    },
    lastModified: '2025-12-09T...'
  }
}
```

## Optional: Type Coercion with Schema

By default, all values are strings. Provide a schema for type conversion:

### Client-Provided Schema

```javascript
const api = new UniversalSheetAPI(url, {
  sheetId: 'xxx',
  schema: {
    'done?': { type: 'boolean', key: 'done' },
    'due date': { type: 'date', key: 'dueDate' },
    'priority': { type: 'number' }
  }
});
```

### Schema Sheet (Second GID)

Create a second sheet tab with schema definitions:

| Column | Type | Key |
|--------|------|-----|
| Done? | boolean | done |
| Due Date | date | dueDate |
| Priority | number | priority |

Then reference it:

```javascript
const api = new UniversalSheetAPI(url, {
  sheetId: 'xxx',
  gid: '0',           // Data sheet
  schemaGid: '123456' // Schema sheet
});
```

### Supported Types

| Type | Input Examples | Output |
|------|---------------|--------|
| `string` (default) | any | trimmed string |
| `boolean` | `TRUE`, `Yes`, `1`, `x`, `✓` | `true` / `false` |
| `number` | `42`, `3.14` | number |
| `integer` | `42.9` | `42` |
| `date` | Date, ISO string | ISO string |
| `json` | `{"a":1}` | parsed object |

## File Uploads

```javascript
const api = new UniversalSheetAPI(url, {
  sheetId: 'xxx',
  driveFolderId: 'your-folder-id'
});

// Upload file
const result = await api.uploadFile('photo.jpg', base64Data, 'image/jpeg');
// result.fileUrl, result.directUrl, result.fileId

// List files
const { files } = await api.getFiles();
```

## Legacy Compatibility

The backend still supports legacy action names that map to generic CRUD:

| Legacy Action | Maps To |
|--------------|---------|
| `getTasks` | `getData` |
| `addTask` | `addRow` |
| `updateTask` | `updateRow` (updates `done?` field) |
| `getSequences` | `getData` |
| `addSequence` | `addRow` |
| `getRSVPs` | `getData` |
| `addRSVP` | `addRow` |

## Migration from v1.0

### Changes Required

1. **Property names changed** - Properties now match camelCase of headers:
   - `completed` → `done` (from "Done?" header)
   - `text` → `task` (from "Task" header)

2. **Response structure** - Data is in `result.data.rows` instead of app-specific keys

3. **Schema is returned** - Use `result.data.schema` to understand the structure

### Example Migration (to-do)

**Before (v1.0):**
```javascript
const { tasks } = await api.getTasks();
tasks.forEach(t => console.log(t.completed, t.text));
```

**After (v2.0):**
```javascript
const { rows } = await api.getData();
rows.forEach(r => console.log(r.done, r.task));
```

Or use the legacy alias with updated property names:
```javascript
const { rows } = await api.getTasks();
rows.forEach(r => console.log(r.done, r.task));
```

## Predefined Schemas

The client includes predefined schemas for convenience:

```javascript
// Use predefined schema
const api = new UniversalSheetAPI(url, {
  sheetId: 'xxx',
  schema: UniversalSheetAPI.createSchema.todo
});

// Available: .todo, .bowiePhone, .pumpkinfest
```

## Best Practices

1. **Let headers define structure** - Don't fight the system, use meaningful headers
2. **Use schema for booleans/dates** - Auto-inference treats everything as strings
3. **Use camelCase in code** - The API normalizes headers to camelCase
4. **Check returned schema** - The response includes the effective schema used

## Export as JSON

For firmware or config files:

```javascript
// Export keyed by a specific field
const json = await api.exportAsJSON('number');
// { "123": { name: "Greeting", link: "..." }, ... }
```
