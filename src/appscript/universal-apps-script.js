/**
 * Universal Google Apps Script Backend v2.0
 * A fully dynamic backend that serves ANY Google Sheet
 * 
 * DESIGN PRINCIPLES:
 * 1. Sheet headers ARE the schema - no hardcoded column names
 * 2. Generic CRUD operations work with any sheet structure
 * 3. Optional client-provided schema for type coercion and validation
 * 4. Optional schema sheet (second GID) for server-side type definitions
 * 5. Legacy app-specific actions route to generic functions
 * 
 * SETUP:
 * 1. Open Google Apps Script (script.google.com)
 * 2. Create new project
 * 3. Replace Code.gs with this content
 * 4. Deploy as web app with "Anyone" access
 * 
 * USAGE:
 * {
 *   action: 'getData',
 *   config: {
 *     sheetId: 'your-sheet-id',
 *     gid: '0',
 *     schemaGid: '123456',        // Optional: GID of schema definition sheet
 *     driveFolderId: 'folder-id'  // Optional: for file uploads
 *   },
 *   schema: {                      // Optional: client-provided schema
 *     'done?': { type: 'boolean', key: 'done' },
 *     'due date': { type: 'date', key: 'dueDate' }
 *   }
 * }
 */

// ==================== CONFIGURATION ====================

const DEFAULT_CONFIG = {
  sheetId: null,
  gid: '0',
  schemaGid: null,  // Optional second sheet with schema definitions
  sheetName: null,
  driveFolderId: null
};

// Optional named configs for convenience
const NAMED_CONFIGS = {
  // 'my-app': { sheetId: '...', gid: '0', driveFolderId: '...' }
};

// ==================== HTTP HANDLERS ====================

function doPost(e) {
  try {
    if (!e || !e.postData) {
      throw new Error('Missing postData in request');
    }

    const requestData = JSON.parse(e.postData?.contents || '{}');
    const config = getConfig(requestData);
    const schema = getSchema(requestData, config);
    
    console.log(`POST: ${requestData.action}, sheet: ${config.sheetId}`);
    
    const result = routeAction(requestData.action, requestData, config, schema);
    return jsonResponse({ success: true, data: result });
    
  } catch (error) {
    console.error('POST error:', error);
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function doOptions(e) {
  return jsonResponse({ success: true, message: 'CORS preflight OK' });
}

function doGet(e) {
  try {
    const requestData = buildRequestFromParams(e.parameter);

    // Binary file passthrough (e.g., audio proxy) must return before JSON wrapping
    if (requestData.action === 'getFile' || requestData.action === 'getDriveFile') {
      return streamDriveFile(requestData);
    }
    
    // Firmware manifest - return raw JSON without wrapper for ESP32 compatibility
    if (requestData.action === 'getSequenceManifest' || requestData.action === 'getFirmwareManifest') {
      const config = getConfig(requestData);
      const schema = getSchema(requestData, config);
      // streaming parameter: 'true' (default) for real-time streaming URLs with OAuth tokens
      //                      'false' for direct Drive download URLs (for SD card caching)
      const streaming = e.parameter.streaming !== 'false';
      const manifest = getSequenceManifest(config, schema, streaming);
      // Return raw manifest JSON (not wrapped in {success, data})
      return ContentService.createTextOutput(JSON.stringify(manifest))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (requestData.action === 'test') {
      return jsonResponse({
        success: true,
        data: {
          message: 'Universal Backend v2.0 running',
          timestamp: new Date().toISOString(),
          actions: ['getData', 'addRow', 'updateRow', 'deleteRow', 'uploadFile', 'getSchema', 
                    'getSequenceManifest', 'streamAudio']
        }
      });
    }
    
    const config = getConfig(requestData);
    const schema = getSchema(requestData, config);
    
    const result = routeAction(requestData.action, requestData, config, schema);
    
    // JSONP support
    if (e.parameter.callback) {
      return ContentService.createTextOutput(
        e.parameter.callback + '(' + JSON.stringify({ success: true, data: result }) + ');'
      ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return jsonResponse({ success: true, data: result });
    
  } catch (error) {
    console.error('GET error:', error);
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// ==================== CONFIGURATION ====================

function getConfig(requestData = {}) {
  let config = { ...DEFAULT_CONFIG };
  
  if (requestData.app && NAMED_CONFIGS[requestData.app]) {
    Object.assign(config, NAMED_CONFIGS[requestData.app]);
  }
  
  if (requestData.config) {
    Object.assign(config, requestData.config);
  }
  
  if (!config.sheetId) {
    throw new Error('Missing config.sheetId');
  }
  
  if (!config.sheetName) {
    config.sheetName = getSheetNameFromGid(config.sheetId, config.gid || '0');
  }
  
  return config;
}

function getSheetNameFromGid(sheetId, gid) {
  try {
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheets = spreadsheet.getSheets();
    const gidNum = parseInt(gid);
    
    for (const sheet of sheets) {
      if (sheet.getSheetId() === gidNum) {
        return sheet.getName();
      }
    }
    return sheets[0]?.getName() || 'Sheet1';
  } catch (error) {
    console.error('Error getting sheet name:', error);
    return 'Sheet1';
  }
}

function buildRequestFromParams(params) {
  const requestData = {
    action: params.action || 'getData',
    app: params.app,
    config: {}
  };
  
  ['sheetId', 'gid', 'schemaGid', 'driveFolderId'].forEach(key => {
    if (params[key]) requestData.config[key] = params[key];
  });
  
  // Copy remaining params as request data
  // Parse JSON strings for complex data (rowData, updates, etc.)
  Object.keys(params).forEach(key => {
    if (!['action', 'app', 'sheetId', 'gid', 'schemaGid', 'driveFolderId', 'callback'].includes(key)) {
      let value = params[key];
      // Try to parse JSON for known object fields
      if (['rowData', 'updates', 'data', 'schema'].includes(key) && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
      requestData[key] = value;
    }
  });
  
  return requestData;
}

// ==================== SCHEMA HANDLING ====================

/**
 * Get schema from:
 * 1. Client-provided schema in request
 * 2. Schema sheet (if schemaGid provided)
 * 3. Auto-inferred from data (default)
 */
function getSchema(requestData, config) {
  // Client-provided schema takes priority
  if (requestData.schema) {
    return normalizeSchema(requestData.schema);
  }
  
  // Load from schema sheet if configured
  if (config.schemaGid) {
    return loadSchemaFromSheet(config.sheetId, config.schemaGid);
  }
  
  // Return null - will auto-infer from headers
  return null;
}

/**
 * Normalize schema to consistent format
 * Input can be:
 *   { 'Column Name': { type: 'boolean', key: 'columnName' } }
 *   { 'column name': 'boolean' }  // shorthand
 */
function normalizeSchema(schema) {
  const normalized = {};
  
  Object.entries(schema).forEach(([header, def]) => {
    const headerKey = header.toLowerCase().trim();
    
    if (typeof def === 'string') {
      // Shorthand: { 'done?': 'boolean' }
      normalized[headerKey] = { type: def, key: toKey(header) };
    } else {
      // Full definition
      normalized[headerKey] = {
        type: def.type || 'string',
        key: def.key || toKey(header),
        ...def
      };
    }
  });
  
  return normalized;
}

/**
 * Load schema from a separate sheet tab
 * Expected format:
 *   Column | Type | Key | Options
 *   Done?  | boolean | done |
 *   Name   | string  | name |
 *   Date   | date    | dueDate |
 */
function loadSchemaFromSheet(sheetId, schemaGid) {
  try {
    const schemaSheetName = getSheetNameFromGid(sheetId, schemaGid);
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(schemaSheetName);
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) return null;
    
    const headers = data[0].map(h => h.toString().toLowerCase().trim());
    const colIdx = headers.indexOf('column');
    const typeIdx = headers.indexOf('type');
    const keyIdx = headers.indexOf('key');
    
    if (colIdx < 0) return null;
    
    const schema = {};
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const column = row[colIdx]?.toString().toLowerCase().trim();
      if (!column) continue;
      
      schema[column] = {
        type: typeIdx >= 0 ? row[typeIdx]?.toString().toLowerCase().trim() || 'string' : 'string',
        key: keyIdx >= 0 ? row[keyIdx]?.toString().trim() || toKey(column) : toKey(column)
      };
    }
    
    return schema;
    
  } catch (error) {
    console.error('Error loading schema sheet:', error);
    return null;
  }
}

/**
 * Convert header to camelCase key
 * "Due Date" -> "dueDate"
 * "Done?" -> "done"
 * "Who Can Help" -> "whoCanHelp"
 */
function toKey(header) {
  return header
    .toLowerCase()
    .replace(/[?!]/g, '')  // Remove punctuation
    .trim()
    .split(/[\s_-]+/)      // Split on whitespace, underscore, hyphen
    .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert value based on schema type
 */
function coerceValue(value, typeDef) {
  if (value === null || value === undefined || value === '') {
    return typeDef?.type === 'boolean' ? false : '';
  }
  
  const type = typeDef?.type || 'string';
  const strValue = value.toString().trim();
  
  switch (type) {
    case 'boolean':
      const lower = strValue.toLowerCase();
      return ['true', 'yes', '1', 'x', '✓', 'done'].includes(lower);
    
    case 'number':
    case 'integer':
      const num = parseFloat(strValue);
      return isNaN(num) ? 0 : (type === 'integer' ? Math.floor(num) : num);
    
    case 'date':
      if (value instanceof Date) return value.toISOString();
      try {
        return new Date(value).toISOString();
      } catch {
        return strValue;
      }
    
    case 'json':
      try {
        return JSON.parse(strValue);
      } catch {
        return strValue;
      }
    
    default:
      return strValue;
  }
}

/**
 * Convert value for writing to sheet
 */
function toSheetValue(value, typeDef) {
  if (value === null || value === undefined) return '';
  
  const type = typeDef?.type || 'string';
  
  switch (type) {
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
    
    case 'date':
      if (value instanceof Date) return value;
      if (typeof value === 'string' && value) {
        try {
          return new Date(value);
        } catch {
          return value;
        }
      }
      return value;
    
    case 'json':
      return typeof value === 'object' ? JSON.stringify(value) : value;
    
    default:
      return value;
  }
}

// ==================== ACTION ROUTING ====================

function routeAction(action, requestData, config, schema) {
  switch (action) {
        case 'getFile':
        case 'getDriveFile':
          return streamDriveFile(requestData); // For POST usage; GET is handled earlier

    // ===== PRIMARY CRUD =====
    case 'getData':
    case 'getRows':
      return getData(config, schema);
    
    case 'addRow':
      return addRow(requestData.rowData || requestData.data || requestData, config, schema);
    
    case 'updateRow':
      return updateRow(
        requestData.rowId || requestData.id,
        requestData.updates || requestData.data || requestData,
        config,
        schema
      );
    
    case 'deleteRow':
      return deleteRow(requestData.rowId || requestData.id, config);
    
    // ===== SCHEMA =====
    case 'getSchema':
      return getSchemaInfo(config, schema);
    
    // ===== FILE OPERATIONS =====
    case 'uploadFile':
      return uploadFile(requestData, config);
    
    case 'getFiles':
    case 'getGalleryImages':
      return getFiles(config);
    
    // ===== UTILITY =====
    case 'getSheetInfo':
      return getSheetInfo(config);
    
    case 'getLastModified':
      return { lastModified: getLastModified(config) };
    
    case 'exportAsJSON':
      return exportAsJSON(config, schema, requestData.keyField);
    
    // ===== LEGACY ALIASES (map to generic CRUD) =====
    // These maintain backward compatibility but use generic functions
    
    // To-do
    case 'getTasks':
      return getData(config, schema);
    case 'addTask':
      return addRow(requestData.task || requestData, config, schema);
    case 'updateTask':
      // Special case: toggle completion
      const taskUpdates = { 'done?': requestData.completed };
      return updateRow(requestData.taskId, taskUpdates, config, schema);
    case 'updateTaskDetails':
      return updateRow(requestData.taskId, requestData.updates, config, schema);
    case 'deleteTask':
      return deleteRow(requestData.taskId, config);
    
    // Bowie Phone
    case 'getSequences':
      return getData(config, schema);
    case 'addSequence':
      return addRow(requestData, config, schema);
    case 'updateSequence':
      return updateRow(requestData.sequenceId, requestData, config, schema);
    case 'deleteSequence':
      return deleteRow(requestData.sequenceId, config);
    case 'exportSequencesAsJSON':
      return exportAsJSON(config, schema, 'number');
    
    // Bowie Phone - Firmware Manifest (returns JSON for ESP32 audio_file_manager)
    case 'getSequenceManifest':
    case 'getFirmwareManifest':
      return getSequenceManifest(config, schema);
    
    // Bowie Phone - Audio Streaming (returns streamable URL with auth token)
    case 'streamAudio':
    case 'getStreamUrl':
      return getStreamableAudioUrl(requestData, config);
    
    // Pumpkinfest
    case 'getRSVPs':
      return getData(config, schema);
    case 'addRSVP':
      return addRow(requestData.rsvp || requestData, config, schema);
    case 'updateRSVP':
      // Find by name and update
      return updateRowByField(
        'name',
        (requestData.rsvp || requestData).name,
        requestData.rsvp || requestData,
        config,
        schema
      );
    
    // Files
    case 'getFile':
    case 'getDriveFile':
      return streamDriveFile(requestData);

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ==================== CORE CRUD OPERATIONS ====================

/**
 * Get all data from sheet
 * Returns rows with properties derived from headers
 */
function getData(config, schema = null) {
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  const data = sheet.getDataRange().getValues();
  
  if (data.length === 0) {
    return { rows: [], headers: [], schema: {} };
  }
  
  // Get raw headers from first row
  const rawHeaders = data[0].map(h => h.toString().trim());
  const headerKeys = rawHeaders.map(h => h.toLowerCase().trim());
  
  // Build effective schema (merge provided schema with auto-inferred)
  const effectiveSchema = {};
  rawHeaders.forEach((header, idx) => {
    const headerKey = headerKeys[idx];
    if (schema && schema[headerKey]) {
      effectiveSchema[headerKey] = schema[headerKey];
    } else {
      // Auto-infer: use header as-is, convert to camelCase key
      effectiveSchema[headerKey] = {
        type: 'string',
        key: toKey(header),
        header: header  // Preserve original header
      };
    }
  });
  
  // Parse rows
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const rowData = data[i];
    
    // Skip empty rows
    if (rowData.every(cell => !cell || cell.toString().trim() === '')) continue;
    
    const row = {
      id: `row-${i + 1}`,
      rowIndex: i + 1
    };
    
    // Map each column value using schema
    headerKeys.forEach((headerKey, colIdx) => {
      const schemaDef = effectiveSchema[headerKey];
      const rawValue = rowData[colIdx];
      const key = schemaDef?.key || toKey(rawHeaders[colIdx]);
      
      row[key] = coerceValue(rawValue, schemaDef);
    });
    
    rows.push(row);
  }
  
  return {
    rows: rows,
    headers: rawHeaders,
    schema: effectiveSchema,
    lastModified: getLastModified(config)
  };
}

/**
 * Add a new row
 * Accepts data with either original header names or schema keys
 */
function addRow(rowData, config, schema = null) {
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  
  // Get current headers
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    throw new Error('Sheet has no headers');
  }
  
  const rawHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerKeys = rawHeaders.map(h => h.toString().toLowerCase().trim());
  
  // Build reverse lookup: key -> column index
  const keyToCol = {};
  const headerToCol = {};
  
  rawHeaders.forEach((header, idx) => {
    const headerKey = headerKeys[idx];
    headerToCol[headerKey] = idx;
    
    // Also map by schema key if available
    const schemaDef = schema?.[headerKey];
    const key = schemaDef?.key || toKey(header);
    keyToCol[key] = idx;
    keyToCol[key.toLowerCase()] = idx;
  });
  
  // Build new row array
  const newRow = new Array(rawHeaders.length).fill('');
  
  // Map input data to columns
  Object.entries(rowData).forEach(([field, value]) => {
    // Skip metadata fields
    if (['id', 'rowIndex', 'action', 'config', 'schema', 'rowId', 'sequenceId', 'taskId'].includes(field)) {
      return;
    }
    
    // Find column by: exact header match, lowercase header, or schema key
    let colIdx = headerToCol[field.toLowerCase()];
    if (colIdx === undefined) colIdx = keyToCol[field];
    if (colIdx === undefined) colIdx = keyToCol[field.toLowerCase()];
    
    if (colIdx !== undefined) {
      const headerKey = headerKeys[colIdx];
      const schemaDef = schema?.[headerKey];
      newRow[colIdx] = toSheetValue(value, schemaDef);
    }
  });
  
  // Append row
  const newRowIndex = sheet.getLastRow() + 1;
  sheet.getRange(newRowIndex, 1, 1, newRow.length).setValues([newRow]);
  
  return {
    success: true,
    id: `row-${newRowIndex}`,
    rowIndex: newRowIndex
  };
}

/**
 * Update an existing row by ID
 */
function updateRow(rowId, updates, config, schema = null) {
  const rowIndex = parseInt(String(rowId).replace('row-', ''));
  if (isNaN(rowIndex) || rowIndex < 2) {
    throw new Error(`Invalid row ID: ${rowId}`);
  }
  
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  
  // Get headers
  const lastCol = sheet.getLastColumn();
  const rawHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headerKeys = rawHeaders.map(h => h.toString().toLowerCase().trim());
  
  // Build lookups
  const keyToCol = {};
  const headerToCol = {};
  
  rawHeaders.forEach((header, idx) => {
    const headerKey = headerKeys[idx];
    headerToCol[headerKey] = idx;
    
    const schemaDef = schema?.[headerKey];
    const key = schemaDef?.key || toKey(header);
    keyToCol[key] = idx;
    keyToCol[key.toLowerCase()] = idx;
  });
  
  // Apply updates
  Object.entries(updates).forEach(([field, value]) => {
    // Skip metadata
    if (['id', 'rowIndex', 'action', 'config', 'schema', 'rowId', 'sequenceId', 'taskId'].includes(field)) {
      return;
    }
    
    let colIdx = headerToCol[field.toLowerCase()];
    if (colIdx === undefined) colIdx = keyToCol[field];
    if (colIdx === undefined) colIdx = keyToCol[field.toLowerCase()];
    
    if (colIdx !== undefined) {
      const headerKey = headerKeys[colIdx];
      const schemaDef = schema?.[headerKey];
      const sheetValue = toSheetValue(value, schemaDef);
      sheet.getRange(rowIndex, colIdx + 1).setValue(sheetValue);
    }
  });
  
  return {
    success: true,
    id: rowId,
    rowIndex: rowIndex
  };
}

/**
 * Update row by finding a matching field value (e.g., by name)
 */
function updateRowByField(matchField, matchValue, updates, config, schema = null) {
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    throw new Error('No data rows to update');
  }
  
  const rawHeaders = data[0].map(h => h.toString().trim());
  const headerKeys = rawHeaders.map(h => h.toLowerCase().trim());
  
  // Find the match column
  let matchColIdx = headerKeys.indexOf(matchField.toLowerCase());
  if (matchColIdx < 0) {
    // Try schema key
    rawHeaders.forEach((header, idx) => {
      const key = schema?.[headerKeys[idx]]?.key || toKey(header);
      if (key.toLowerCase() === matchField.toLowerCase()) {
        matchColIdx = idx;
      }
    });
  }
  
  if (matchColIdx < 0) {
    throw new Error(`Field not found: ${matchField}`);
  }
  
  // Find matching row
  for (let i = 1; i < data.length; i++) {
    if (data[i][matchColIdx]?.toString().trim() === matchValue) {
      return updateRow(`row-${i + 1}`, updates, config, schema);
    }
  }
  
  throw new Error(`No row found with ${matchField} = ${matchValue}`);
}

/**
 * Delete a row
 */
function deleteRow(rowId, config) {
  const rowIndex = parseInt(String(rowId).replace('row-', ''));
  if (isNaN(rowIndex) || rowIndex < 2) {
    throw new Error(`Invalid row ID: ${rowId}`);
  }
  
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  sheet.deleteRow(rowIndex);
  
  return {
    success: true,
    deletedId: rowId
  };
}

// ==================== SCHEMA INFO ====================

function getSchemaInfo(config, providedSchema) {
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  const lastCol = sheet.getLastColumn();
  
  if (lastCol === 0) {
    return { headers: [], schema: {} };
  }
  
  const rawHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const schema = {};
  
  rawHeaders.forEach(header => {
    const headerKey = header.toString().toLowerCase().trim();
    if (providedSchema && providedSchema[headerKey]) {
      schema[headerKey] = providedSchema[headerKey];
    } else {
      schema[headerKey] = {
        type: 'string',
        key: toKey(header),
        header: header.toString().trim()
      };
    }
  });
  
  return {
    headers: rawHeaders.map(h => h.toString().trim()),
    schema: schema
  };
}

// ==================== FILE OPERATIONS ====================

function uploadFile(data, config) {
  try {
    const { fileName, fileData, mimeType, driveFolder } = data;
    
    if (!fileName || !fileData || !mimeType) {
      throw new Error('Missing: fileName, fileData, or mimeType');
    }
    
    let folderId = config.driveFolderId;
    if (driveFolder?.includes('folders/')) {
      folderId = driveFolder.match(/folders\/([a-zA-Z0-9-_]+)/)?.[1] || folderId;
    }
    
    if (!folderId) {
      throw new Error('No driveFolderId configured');
    }
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileData),
      mimeType,
      fileName
    );
    
    const folder = DriveApp.getFolderById(folderId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueName = `${timestamp}_${fileName}`;
    
    const file = folder.createFile(blob.setName(uniqueName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileUrl: file.getUrl(),
      fileName: uniqueName,
      fileId: file.getId(),
      directUrl: `https://drive.google.com/uc?id=${file.getId()}`
    };
    
  } catch (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.toString() };
  }
}

function streamDriveFile(requestData) {
  const fileId = requestData.fileId || requestData.id;
  if (!fileId) {
    return jsonResponse({ success: false, error: 'Missing fileId or id' });
  }

  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    
    // Apps Script cannot return raw binary - return base64 encoded data
    // Frontend must decode this to create a playable blob URL
    const base64Data = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    
    return jsonResponse({
      success: true,
      data: {
        base64: base64Data,
        mimeType: mimeType,
        fileName: file.getName(),
        size: blob.getBytes().length
      }
    });
  } catch (error) {
    console.error('streamDriveFile error:', error);
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function getFiles(config) {
  try {
    if (!config.driveFolderId) {
      throw new Error('No driveFolderId configured');
    }
    
    const folder = DriveApp.getFolderById(config.driveFolderId);
    const files = folder.getFiles();
    const items = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      const fileId = file.getId();
      
      items.push({
        id: fileId,
        name: file.getName(),
        mimeType: mimeType,
        size: file.getSize(),
        url: file.getUrl(),
        directUrl: `https://drive.google.com/uc?id=${fileId}`,
        thumbnailUrl: mimeType.startsWith('image/') 
          ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w400` 
          : null,
        lastModified: file.getLastUpdated().toISOString()
      });
    }
    
    items.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    return {
      files: items,
      count: items.length,
      folderUrl: `https://drive.google.com/drive/folders/${config.driveFolderId}`
    };
    
  } catch (error) {
    console.error('getFiles error:', error);
    throw error;
  }
}

// ==================== UTILITY ====================

function getLastModified(config) {
  try {
    return DriveApp.getFileById(config.sheetId).getLastUpdated().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function getSheetInfo(config) {
  const spreadsheet = SpreadsheetApp.openById(config.sheetId);
  const sheets = spreadsheet.getSheets();
  
  return {
    name: spreadsheet.getName(),
    sheets: sheets.map(s => ({
      name: s.getName(),
      gid: s.getSheetId(),
      rows: s.getLastRow(),
      columns: s.getLastColumn()
    })),
    activeSheet: config.sheetName
  };
}

/**
 * Export sheet data as JSON object keyed by a specific field
 * Useful for bowie-phone firmware format
 */
function exportAsJSON(config, schema, keyField = null) {
  const result = getData(config, schema);
  
  if (!keyField) {
    return result.rows;
  }
  
  const output = {};
  result.rows.forEach(row => {
    const key = row[keyField];
    if (key) {
      const entry = { ...row };
      delete entry.id;
      delete entry.rowIndex;
      delete entry[keyField];
      output[key] = entry;
    }
  });
  
  return output;
}

// ==================== BOWIE PHONE - FIRMWARE AUDIO STREAMING ====================

/**
 * Generate a manifest for Bowie Phone firmware
 * Returns JSON in the exact format expected by audio_file_manager.cpp
 * 
 * Expected sheet columns: Name, Number, Link
 * Output format:
 * {
 *   "911": { "description": "Emergency", "type": "audio", "path": "https://..." },
 *   "dialtone": { "description": "Dial Tone", "type": "audio", "path": "https://..." }
 * }
 * 
 * Parameters:
 * - streaming: If true, returns authenticated API URLs for real-time streaming
 *              If false, returns direct Drive download URLs (for SD card caching)
 */
function getSequenceManifest(config, schema = null, streaming = true) {
  const result = getData(config, schema);
  const manifest = {};
  
  // Get OAuth token for authenticated Drive URLs (only needed for streaming mode)
  const accessToken = streaming ? ScriptApp.getOAuthToken() : null;
  
  result.rows.forEach(row => {
    // Get the number/key - try common field names
    const key = row.number || row.Number || row.key || row.Key || row.sequence || row.Sequence;
    if (!key) return;
    
    // Get description - try common field names
    const description = row.name || row.Name || row.description || row.Description || key;
    
    // Get the link/path - try common field names
    let path = row.link || row.Link || row.path || row.Path || row.url || row.Url || row.audio || row.Audio || '';
    
    // Determine type
    let type = row.type || row.Type || 'audio';
    
    // Convert Drive URLs based on streaming mode
    if (path) {
      path = convertToStreamableUrl(path, accessToken, streaming);
    }
    
    manifest[key.toString()] = {
      description: description.toString(),
      type: type.toString(),
      path: path.toString()
    };
  });
  
  return manifest;
}

/**
 * Convert various URL formats to appropriate download/streaming URLs
 * 
 * Parameters:
 * - url: The original URL (Drive link, file ID, or external URL)
 * - accessToken: OAuth token (only used when streaming=true)
 * - streaming: If true, returns authenticated API URL for real-time streaming
 *              If false, returns direct download URL for caching to SD card
 * 
 * Handles:
 * - Google Drive viewer URLs -> API or direct URLs
 * - Google Drive file IDs -> API or direct URLs  
 * - Already-direct URLs -> pass through unchanged
 */
function convertToStreamableUrl(url, accessToken, streaming = true) {
  if (!url) return '';
  
  url = url.toString().trim();
  
  // Extract Drive file ID from various URL formats
  let fileId = null;
  
  // Format: https://drive.google.com/file/d/FILE_ID/view...
  let match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    fileId = match[1];
  }
  
  // Format: https://drive.google.com/open?id=FILE_ID
  if (!fileId) {
    match = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];
  }
  
  // Format: https://drive.google.com/uc?id=FILE_ID
  if (!fileId) {
    match = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if (match) fileId = match[1];
  }
  
  // Format: Just a file ID (no URL)
  if (!fileId && /^[a-zA-Z0-9_-]{20,}$/.test(url)) {
    fileId = url;
  }
  
  // If we found a Drive file ID, return the public download URL
  // IMPORTANT: Files must be shared publicly ("Anyone with the link can view")
  // The googleapis.com URLs with OAuth tokens get blocked by Google's bot detection
  // when ESP32 requests them directly, so we use the public download URL instead
  if (fileId) {
    // Use export=download URL - works for publicly shared files
    // This URL follows redirects but eventually serves the file content
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  
  // Otherwise return URL as-is (might be an external URL like GitHub)
  return url;
}

/**
 * Get a streamable URL for an audio file
 * Accepts file ID, file name, or sequence number to look up
 * 
 * Parameters:
 * - fileId: Direct Drive file ID
 * - fileName: File name to search for in the drive folder
 * - number: Sequence number to look up in the sheet and get its link
 * - name: Sequence name to look up in the sheet
 */
function getStreamableAudioUrl(requestData, config) {
  const accessToken = ScriptApp.getOAuthToken();
  
  // Direct file ID provided
  if (requestData.fileId || requestData.id) {
    const fileId = requestData.fileId || requestData.id;
    return {
      fileId: fileId,
      streamUrl: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`,
      note: 'Authenticated URL valid for ~1 hour'
    };
  }
  
  // Look up by sequence number in the sheet
  if (requestData.number) {
    return lookupSequenceAudio(requestData.number, 'number', config, accessToken);
  }
  
  // Look up by sequence name in the sheet
  if (requestData.name) {
    return lookupSequenceAudio(requestData.name, 'name', config, accessToken);
  }
  
  // Search for file by name in Drive folder
  if (requestData.fileName && config.driveFolderId) {
    return findFileInFolder(requestData.fileName, config.driveFolderId, accessToken);
  }
  
  throw new Error('Provide fileId, number, name, or fileName parameter');
}

/**
 * Look up a sequence in the sheet and return its audio URL
 */
function lookupSequenceAudio(value, field, config, accessToken) {
  const sheet = SpreadsheetApp.openById(config.sheetId).getSheetByName(config.sheetName);
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    throw new Error('Sheet is empty');
  }
  
  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  
  // Find the lookup column
  let lookupCol = -1;
  const searchFields = field === 'number' 
    ? ['number', 'key', 'sequence'] 
    : ['name', 'description', 'title'];
  
  for (const f of searchFields) {
    const idx = headers.indexOf(f);
    if (idx >= 0) {
      lookupCol = idx;
      break;
    }
  }
  
  if (lookupCol < 0) {
    throw new Error(`Column '${field}' not found in sheet`);
  }
  
  // Find the link column
  let linkCol = -1;
  for (const f of ['link', 'path', 'url', 'audio']) {
    const idx = headers.indexOf(f);
    if (idx >= 0) {
      linkCol = idx;
      break;
    }
  }
  
  if (linkCol < 0) {
    throw new Error('No link/path column found in sheet');
  }
  
  // Search for matching row
  for (let i = 1; i < data.length; i++) {
    const cellValue = data[i][lookupCol]?.toString().toLowerCase().trim();
    if (cellValue === value.toString().toLowerCase().trim()) {
      const link = data[i][linkCol];
      if (!link) {
        throw new Error(`Found '${value}' but no audio link configured`);
      }
      
      const streamUrl = convertToStreamableUrl(link, accessToken);
      
      // Get name for response
      const nameCol = headers.indexOf('name');
      const name = nameCol >= 0 ? data[i][nameCol] : value;
      
      return {
        found: true,
        [field]: value,
        name: name,
        originalUrl: link,
        streamUrl: streamUrl,
        note: 'Authenticated URL valid for ~1 hour'
      };
    }
  }
  
  throw new Error(`Sequence not found: ${value}`);
}

/**
 * Find a file by name in a Drive folder
 */
function findFileInFolder(fileName, folderId, accessToken) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(fileName);
    
    if (!files.hasNext()) {
      // Try partial match
      const allFiles = folder.getFiles();
      while (allFiles.hasNext()) {
        const file = allFiles.next();
        if (file.getName().toLowerCase().includes(fileName.toLowerCase())) {
          const fileId = file.getId();
          return {
            found: true,
            fileName: file.getName(),
            fileId: fileId,
            mimeType: file.getMimeType(),
            size: file.getSize(),
            streamUrl: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`,
            note: 'Partial match - authenticated URL valid for ~1 hour'
          };
        }
      }
      throw new Error(`File not found: ${fileName}`);
    }
    
    const file = files.next();
    const fileId = file.getId();
    
    return {
      found: true,
      fileName: file.getName(),
      fileId: fileId,
      mimeType: file.getMimeType(),
      size: file.getSize(),
      streamUrl: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`,
      note: 'Authenticated URL valid for ~1 hour'
    };
    
  } catch (error) {
    throw new Error(`Error finding file: ${error.toString()}`);
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ==================== TEST ====================

function testScript() {
  console.log('Universal Backend v2.0');
  console.log('======================');
  console.log('This backend dynamically reads headers from any sheet.');
  console.log('Schema can be: auto-inferred, client-provided, or loaded from schema sheet.');
  return { success: true, version: '2.0' };
}

// Lightweight self-test suite for pure helpers (safe to run without Sheets)
function selfTest() {
  const results = [];

  function record(name, passed, detail) {
    results.push({ name, passed, detail });
  }

  // toKey
  try {
    record('toKey basic', toKey('Done?') === 'done');
    record('toKey spacing', toKey('Due Date') === 'dueDate');
    record('toKey punctuation', toKey('Who-Can_Help?') === 'whoCanHelp');
  } catch (err) {
    record('toKey error', false, err.toString());
  }

  // normalizeSchema shorthand and explicit
  try {
    const normalized = normalizeSchema({ 'Done?': 'boolean', 'Due Date': { type: 'date', key: 'dueDate' } });
    record('normalizeSchema boolean', normalized['done?']?.type === 'boolean' && normalized['done?']?.key === 'done');
    record('normalizeSchema date', normalized['due date']?.type === 'date' && normalized['due date']?.key === 'dueDate');
  } catch (err) {
    record('normalizeSchema error', false, err.toString());
  }

  // coerceValue
  try {
    record('coerce boolean yes', coerceValue('Yes', { type: 'boolean' }) === true);
    record('coerce boolean empty', coerceValue('', { type: 'boolean' }) === false);
    record('coerce number', coerceValue('42.5', { type: 'number' }) === 42.5);
    const iso = coerceValue('2025-12-25', { type: 'date' });
    record('coerce date iso', typeof iso === 'string' && iso.includes('2025'));
    const obj = coerceValue('{"a":1}', { type: 'json' });
    record('coerce json', obj && obj.a === 1);
  } catch (err) {
    record('coerceValue error', false, err.toString());
  }

  return { success: results.every(r => r.passed), results };
}

// Integration test that spins up a temp sheet, exercises CRUD, then cleans up
function integrationTest() {
  const results = [];
  let tempFile = null;
  let tempSheet = null;

  function record(name, passed, detail) {
    results.push({ name, passed, detail });
  }

  try {
    // Create temp spreadsheet
    const ss = SpreadsheetApp.create(`universal-backend-test-${Date.now()}`);
    tempFile = DriveApp.getFileById(ss.getId());
    tempSheet = ss.getSheets()[0];

    // Seed headers
    tempSheet.getRange(1, 1, 1, 3).setValues([['Name', 'Done?', 'Due Date']]);

    const config = {
      sheetId: ss.getId(),
      gid: String(tempSheet.getSheetId()),
      sheetName: tempSheet.getName()
    };

    // Initial read (should be empty rows)
    const initial = getData(config, null);
    record('initial rows empty', Array.isArray(initial.rows) && initial.rows.length === 0);

    // Add a row using camelCase keys
    const addResult = addRow({ name: 'Alice', done: true, dueDate: '2025-12-25' }, config, null);
    record('addRow success', addResult?.success === true || !!addResult?.id);

    // Verify data
    const afterAdd = getData(config, null);
    const row = afterAdd.rows[0];
    record('getData returns row', !!row);
    record('row.name', row?.name === 'Alice');
    record('row.done', row?.done === true);
    record('row.dueDate', typeof row?.dueDate === 'string' && row.dueDate.includes('2025'));

    // Update row (toggle done to false using header name)
    const updateRes = updateRow('row-2', { 'Done?': false }, config, null);
    record('updateRow success', updateRes?.success === true);
    const afterUpdate = getData(config, null);
    record('update applied', afterUpdate.rows[0]?.done === false);

    // Delete row
    const delRes = deleteRow('row-2', config);
    record('deleteRow success', delRes?.success === true);
    const afterDelete = getData(config, null);
    record('rows empty after delete', afterDelete.rows.length === 0);

  } catch (err) {
    record('integration error', false, err.toString());
  } finally {
    // Clean up temp file
    try {
      if (tempFile) tempFile.setTrashed(true);
    } catch (cleanupErr) {
      record('cleanup error', false, cleanupErr.toString());
    }
  }

  return { success: results.every(r => r.passed), results };
}

// Upload test: creates a tiny audio file, uploads to Drive, verifies link, then trashes the file
function uploadAudioTest(driveFolderId) {
  const results = [];
  let file = null;

  function record(name, passed, detail) {
    results.push({ name, passed, detail });
  }

  try {
    const folderId = driveFolderId || '1t4y0PTRbGdw0N69ApWigMgM0j9uOhxlZ';
    const folder = DriveApp.getFolderById(folderId);

    // Minimal 1-second silent WAV (44-byte header + silence)
    const base64Wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Wav), 'audio/wav', `test-audio-${Date.now()}.wav`);

    file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    record('file created', !!file && !!file.getId());
    record('file size > 0', file.getSize() > 0);
    record('file mime audio/wav', file.getMimeType() === 'audio/wav');

    const directUrl = `https://drive.google.com/uc?id=${file.getId()}`;
    record('directUrl present', !!directUrl);

  } catch (err) {
    record('upload error', false, err.toString());
  } finally {
    try {
      if (file) file.setTrashed(true);
    } catch (cleanupErr) {
      record('cleanup error', false, cleanupErr.toString());
    }
  }

  return { success: results.every(r => r.passed), results };
}

// Run both helper and integration tests; callable from Apps Script UI
function runAllTests() {
  const helper = selfTest();
  const integration = integrationTest();
  const upload = uploadAudioTest();
  const success = helper.success && integration.success && upload.success;
  console.log('Helper tests:', JSON.stringify(helper.results, null, 2));
  console.log('Integration tests:', JSON.stringify(integration.results, null, 2));
  console.log('Upload tests:', JSON.stringify(upload.results, null, 2));
  return { success, helper, integration, upload };
}
