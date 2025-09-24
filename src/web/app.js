/**
 * Universal Todo System - Google Sheets Integration
 * Extracted from infinite-hips for reuse in any project
 * Handles bidirectional sync between web UI and Google Sheets
 */

// Helper function to convert camelCase to kebab-case
const toKebabCase = (str) => {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};



class GoogleSheetsChecklist {
    constructor(config = {}) {
        // Get configuration from window.CHECKLIST_CONFIG or use defaults
        const defaultConfig = {
            projectName: "Universal Todo System",
            projectId: "universal-todo",
            googleSheets: {
                enabled: false,
                spreadsheetId: null,
                gid: '0',
                csvUrl: null,
                appScriptUrl: null
            },
            dataSource: {
                localStorageKey: 'todo-system-tasks',
                syncInterval: 60000,
                enableOfflineMode: true
            },
            ui: {
                defaultFilter: 'all',
                theme: { colorPrimary: '#ff69b4' }
            },
            features: {
                allowTaskCreation: true,
                allowTaskEditing: true,
                allowTaskDeletion: false
            }
        };

        // Merge configurations with proper deep merge
        function deepMerge(target, ...sources) {
            if (!sources.length) return target;
            const source = sources.shift();
            
            if (source && typeof source === 'object' && !Array.isArray(source)) {
                for (const key in source) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key]) target[key] = {};
                        deepMerge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
            
            return deepMerge(target, ...sources);
        }
        
        const finalConfig = deepMerge(
            {},
            defaultConfig,
            window.CHECKLIST_CONFIG || {},
            config
        );

        // Store the full configuration for access throughout the class
        this.config = finalConfig;

        // Apply Google Sheets configuration
        this.sheetId = finalConfig.googleSheets?.spreadsheetId || null;
        this.gid = finalConfig.googleSheets?.gid || '0';
        this.appsScriptUrl = finalConfig.googleSheets?.appScriptUrl || null;
        this.useGoogleSheets = finalConfig.googleSheets?.enabled && this.sheetId;
        
        // Apply other configuration
        this.refreshInterval = finalConfig.dataSource?.syncInterval || 60000;
        this.maxRetries = 3;
        this.localStorageKey = finalConfig.dataSource?.localStorageKey || 'todo-system-tasks';
        this.enableLocalStorage = finalConfig.dataSource?.enableLocalStorage !== false; // Default to true
        this.theme = finalConfig.ui?.theme?.colorPrimary || '#ff69b4';
        this.flatpickrConfig = finalConfig.ui?.flatpickr || {};

        // Initialize other properties
        this.tasks = [];
        this.lastSync = null;
        this.lastModified = null;
        this.isOnline = navigator.onLine;
        // Temporarily use CSV instead of Apps Script to test around browser extension blocking
        this.useAppsScript = false; // this.appsScriptUrl && this.appsScriptUrl !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
        // Keep the enabled check for useGoogleSheets (don't overwrite with just sheetId check)
        this.retryCount = 0;
        this.isInitialLoad = true;
        this.currentFilter = 'all';
        this.currentFilterField = null;
        this.currentFilterValue = null;
        this.showCompleted = false;
        this.fieldConfigCache = new Map();
        this.allFieldConfigsCache = null;
        // Don't call init() here - let the HTML call it explicitly after config is ready
    }

    getSavedFilter() {
        try {
            return localStorage.getItem('todo-system-current-filter');
        } catch (error) {
            console.error('Error loading saved filter:', error);
            return null;
        }
    }

    saveCurrentFilter() {
        try {
            localStorage.setItem('todo-system-current-filter', this.currentFilter);
        } catch (error) {
            console.error('Error saving current filter:', error);
        }
    }

    init() {
        console.log('🚀 TodoApp initialization started...');
        try {
            // Event listeners for add task form
            const addItemBtn = document.getElementById('add-task-btn');
            const taskForm = document.getElementById('add-task-form');
            
            console.log('🔍 Add task button found:', !!addItemBtn);
            console.log('🔍 Task form found:', !!taskForm);

            if (addItemBtn) addItemBtn.addEventListener('click', () => this.toggleAddTaskForm());
            if (taskForm) taskForm.addEventListener('submit', (e) => this.handleAddTask(e));

            // Handle "Other" option dropdowns
            this.setupOtherDropdowns();
            console.log('✅ Other dropdowns set up');

            // Initialize date picker if flatpickr is available
            if (typeof flatpickr !== 'undefined') {
                this.initializeDatePicker();
                console.log('✅ Date picker initialized');
            }

            // Initialize audio field handlers
            this.initializeAudioField();
            console.log('✅ Audio field initialized');

            // Auto-refresh if Google Sheets is enabled
            if (this.useGoogleSheets) {
                setInterval(() => this.loadFromSheet(), this.refreshInterval);
                console.log('✅ Auto-refresh enabled');
            }

            // Network status monitoring
            window.addEventListener('online', () => {
                this.isOnline = true;
                this.hideOfflineNotice();
                if (this.useGoogleSheets) {
                    this.loadFromSheet();
                }
            });

            window.addEventListener('offline', () => {
                this.isOnline = false;
                this.showOfflineNotice();
            });
            console.log('✅ Network monitoring set up');

            // Initial load
            this.loadData();
            console.log('✅ Data loading initiated');
            
            // Initialize generic multiselect fields
            this.initializeMultiSelectFields();
            console.log('✅ Multiselect fields initialized');
            
            console.log('🎉 TodoApp initialization completed successfully!');
        } catch (error) {
            console.error('💥 Error during TodoApp initialization:', error);
        }
    }

    setupOtherDropdowns() {
        // Get data field configuration with safety check
        const dataFields = this.getFieldConfigs();
        
        // Generate dropdown mappings dynamically from configuration
        const dropdownMappings = [];
        const dateModeFields = [];
        
        Object.entries(dataFields).forEach(([fieldName, fieldConfig]) => {
            // Handle select fields that support "Other" option
            if (fieldConfig.type === 'select' && 
                fieldConfig.options?.preserveOtherOption !== false) {
                
                // Generate or use configured element IDs
                const selectId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
                const otherId = `${selectId}-other`;
                
                dropdownMappings.push({
                    select: selectId,
                    other: otherId,
                    fieldName: fieldName
                });
            }
            
            // Handle date fields that may have mode toggles
            if (fieldConfig.type === 'date') {
                const fieldId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
                dateModeFields.push({
                    fieldName: fieldName,
                    fieldId: fieldId,
                    config: fieldConfig
                });
            }
        });

        // Set up event listeners for each dropdown that supports "Other"
        dropdownMappings.forEach(({ select, other, fieldName }) => {
            const selectEl = document.getElementById(select);
            if (selectEl) {
                selectEl.addEventListener('change', (e) => this.handleOtherOption(e, other));
            }
        });

        // Set up date mode toggle buttons for date fields
        dateModeFields.forEach(({ fieldName, fieldId, config }) => {
            this.setupDateModeToggles(fieldName, fieldId, config);
        });

    // Initialize multiselect fields (generic)
    this.initializeMultiSelectFields();
    }

    setupDateModeToggles(fieldName, fieldId, fieldConfig) {
        // Find the date-type-toggle container for this field
        const toggleContainer = document.querySelector(`#${fieldId}`).closest('.form-group')?.querySelector('.date-type-toggle');
        if (!toggleContainer) return;
        
        const modeOptions = fieldConfig.options?.mode;
        
        // If mode is specified as a single value, create one button
        if (typeof modeOptions === 'string') {
            const mode = modeOptions; // 'single' or 'range'
            toggleContainer.innerHTML = `
                <button type="button" class="date-toggle-btn active" data-mode="${mode}">
                    ${mode === 'single' ? 'Single Date' : 'Date Range'}
                </button>
            `;
            
            // Set up event listener for the single button
            const button = toggleContainer.querySelector('.date-toggle-btn');
            if (button) {
                button.addEventListener('click', () => this.setDatePickerMode(mode, fieldId));
            }
        } 
        // If mode is an array or not specified, show both options (default behavior)
        else {
            toggleContainer.innerHTML = `
                <button type="button" class="date-toggle-btn active" data-mode="single">Single Date</button>
                <button type="button" class="date-toggle-btn" data-mode="range">Date Range</button>
            `;
            
            // Set up event listeners for both buttons
            const buttons = toggleContainer.querySelectorAll('.date-toggle-btn');
            buttons.forEach(button => {
                button.addEventListener('click', (e) => {
                    // Update active state
                    buttons.forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    // Set the date picker mode
                    const mode = e.target.getAttribute('data-mode');
                    this.setDatePickerMode(mode, fieldId);
                });
            });
        }
    }

    // Generic multiselect initialization (form side)
    initializeMultiSelectFields() {
        try {
            const multiselectFields = Object.entries(this.getFieldConfigs()).filter(([_, cfg]) => cfg.type === 'multiselect');
            multiselectFields.forEach(([fieldName, cfg]) => {
                const containerId = `${toKebabCase(fieldName)}-container`;
                const container = document.getElementById(containerId);
                if (!container) return;
                // Delegate change events
                container.addEventListener('change', (e) => {
                    if (e.target.classList.contains(`multi-select-${fieldName}`)) {
                        this.handleGenericMultiSelectChange(fieldName, e.target);
                        const allSelects = container.querySelectorAll(`.multi-select-${fieldName}`);
                        const lastSelect = allSelects[allSelects.length - 1];
                        if (e.target === lastSelect && e.target.value) {
                            this.addEmptyGenericMultiSelect(fieldName);
                        }
                    }
                });
                this.populateGenericMultiSelect(fieldName);
            });
        } catch (err) {
            console.error('❌ Error initializing multiselect fields:', err);
        }
    }

    /**
     * Dynamically append a new empty helper dropdown (legacy behavior: once you choose a helper,
     * a new blank appears so you can keep adding). Prevents unbounded duplicates of trailing blanks.
     */
    addEmptyGenericMultiSelect(fieldName) {
        const container = document.getElementById(`${toKebabCase(fieldName)}-container`);
        if (!container) return;
        const selects = container.querySelectorAll(`.multi-select-${fieldName}`);
        const last = selects[selects.length - 1];
        if (last && (last.value === '' || last.value === 'Other')) return;
    const select = document.createElement('select');
    select.className = `multi-select-${fieldName} editable-dropdown helper-dropdown editing-dropdown`;
        select.innerHTML = `<option value=""></option><option value="Other">Other</option>`;
        container.appendChild(select);
        this.populateGenericMultiSelect(fieldName);
    }

    // Helper methods removed - using simple always-visible dropdowns instead

    handleGenericMultiSelectChange(fieldName, select) {
        try {
            const otherId = `task-${toKebabCase(fieldName)}-other`;
            if (select.value === 'Other') {
                this.handleOtherOption({ target: select }, otherId);
            }
        } catch (error) {
            console.error('❌ Error handling multiselect change:', error);
        }
    }

    // Method to get all selected helpers as comma-separated string
    getSelectedMultiValues(fieldName) {
        const container = document.getElementById(`${toKebabCase(fieldName)}-container`);
        if (!container) return '';
        const selects = container.querySelectorAll(`.multi-select-${fieldName}`);
        const values = Array.from(selects)
            .map(select => select.value)
            .filter(value => value && value !== '' && value !== 'Other');
        const otherInput = document.getElementById(`task-${toKebabCase(fieldName)}-other`);
        if (otherInput && otherInput.style.display !== 'none' && otherInput.value.trim()) {
            values.push(otherInput.value.trim());
        }
        const unique = [];
        values.forEach(v => { if (!unique.includes(v)) unique.push(v); });
        return unique.join(', ');
    }

    async loadData() {
        console.log('🔄 loadData() called');
        console.log('🔧 useGoogleSheets:', this.useGoogleSheets);
        console.log('🌐 isOnline:', this.isOnline);
        console.log('� enableLocalStorage:', this.enableLocalStorage);
        console.log('�🗝️ sheetId:', this.sheetId);
        console.log('📱 appsScriptUrl:', this.appsScriptUrl ? 'configured' : 'not configured');
        
        if (!this.useGoogleSheets) {
            console.error('❌ Google Sheets is disabled - local storage fallback disabled by user request');
            this.showError('Google Sheets must be configured to use this app. Local storage is disabled.');
            return;
        }
        
        if (!this.isOnline) {
            console.error('❌ Offline - local storage fallback disabled by user request');
            this.showError('You must be online to use this app. Local storage fallback is disabled.');
            return;
        }
                console.log('📊 Loading from Google Sheets only (local storage disabled)...');
        await this.loadFromSheet();
    }

    async loadFromSheet() {
        if (!this.isOnline || !this.useGoogleSheets) {
            this.showOfflineNotice();
            return;
        }

        try {
            this.showLoading(true);
            this.hideOfflineNotice();

            if (this.useAppsScript) {
                await this.loadFromAppsScript();
            } else {
                await this.loadFromCSV();
            }

            this.lastSync = new Date();
            this.updateLastSyncDisplay();
            this.renderTasks();
            this.updateProgress();
            this.updateSyncStatus('✅ Synced');

        } catch (error) {
            console.error('❌ Error loading from Google Sheets details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            console.log('🔧 Config details:', {
                useGoogleSheets: this.useGoogleSheets,
                useAppsScript: this.useAppsScript,
                appsScriptUrl: this.appsScriptUrl ? 'configured' : 'not configured',
                sheetId: this.sheetId ? 'configured' : 'not configured'
            });
            
            this.showError(`Failed to sync with Google Sheets: ${error.message}`);
            this.showOfflineNotice();

            if (!this.loadCachedData()) {
                console.log('📦 Loading sample data as fallback');
                this.loadSampleData();
            }
        } finally {
            this.showLoading(false);
            this.isInitialLoad = false;
        }
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.localStorageKey);
            if (stored) {
                this.tasks = JSON.parse(stored);
            } else {
                this.loadSampleData();
            }
            this.renderTasks();
            this.updateProgress();
            this.updateSyncStatus('💾 Local Storage');
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            this.loadSampleData();
        }
    }

    // Alias for loadData() - provides backward compatibility with infinite-hips naming
    async syncData() {
        return await this.loadData();
    }

    saveToLocalStorage() {
        if (!this.enableLocalStorage) {
            console.log('💾 Local storage saving disabled via config - using Google Sheets only');
            return;
        }
        
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(this.tasks));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    async loadFromAppsScript() {
        console.log('🔗 Loading from Apps Script:', this.appsScriptUrl);
        
        if (!this.appsScriptUrl) {
            throw new Error('Apps Script URL not configured');
        }
        
        const url = `${this.appsScriptUrl}?action=getTasks&t=${Date.now()}`;
        console.log('📡 Fetching from URL:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json',
                }
            });

            console.log('📥 Apps Script response status:', response.status);
            console.log('📥 Apps Script response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                // Get response text for more details
                const responseText = await response.text();
                console.log('📄 Apps Script response body:', responseText);
                throw new Error(`Apps Script HTTP error: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 200)}`);
            }

            const result = await response.json();
            console.log('📋 Apps Script result:', result);

            if (!result.success) {
                throw new Error(result.data?.error || result.error || 'Apps Script returned error');
            }

            this.tasks = result.data?.tasks || [];
            this.lastModified = result.data?.lastModified;
            console.log(`✅ Loaded ${this.tasks.length} tasks from Apps Script`);
            this.saveToCache();
            
        } catch (fetchError) {
            console.error('🚫 Apps Script fetch error details:', {
                message: fetchError.message,
                name: fetchError.name,
                stack: fetchError.stack
            });
            
            // If it's a CORS error, try alternative approach
            if (fetchError.message.includes('CORS') || fetchError.message.includes('Network')) {
                console.log('🔄 Trying alternative fetch approach...');
                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        mode: 'no-cors'
                    });
                    console.log('📥 No-CORS response status:', response.status);
                } catch (altError) {
                    console.error('🚫 Alternative fetch also failed:', altError.message);
                }
            }
            
            // Re-throw with more context
            throw new Error(`Apps Script connection failed: ${fetchError.message}`);
        }
    }

    async loadFromCSV() {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv&gid=${this.gid}&headers=1`;
        const response = await fetch(csvUrl, {
            mode: 'cors',
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Sheet may not be public`);
        }

        const csvText = await response.text();

        if (csvText.includes('<HTML>') || csvText.includes('<!DOCTYPE')) {
            throw new Error('Sheet is not publicly accessible. Please make it viewable to anyone with the link.');
        }

        this.parseCsvData(csvText);
        this.saveToCache();
    }

    parseCsvData(csvText) {
        const lines = csvText.trim().split('\n');
        const tasks = [];

        if (lines.length < 2) return;

        const headers = this.parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        const columnMap = {
            done: headers.indexOf('done?') !== -1 ? headers.indexOf('done?') : 0,
            task: headers.indexOf('task') !== -1 ? headers.indexOf('task') : 1,
            timeline: headers.indexOf('timeline') !== -1 ? headers.indexOf('timeline') : -1,
            priority: headers.indexOf('priority') !== -1 ? headers.indexOf('priority') : -1,
            category: headers.indexOf('category') !== -1 ? headers.indexOf('category') : -1,
            how: headers.indexOf('how') !== -1 ? headers.indexOf('how') : -1,
            notes: headers.indexOf('notes') !== -1 ? headers.indexOf('notes') : -1,
            whoCanHelp: headers.indexOf('who can help') !== -1 ? headers.indexOf('who can help') :
                headers.indexOf('whocanhelp') !== -1 ? headers.indexOf('whocanhelp') : -1,
            date: headers.indexOf('date') !== -1 ? headers.indexOf('date') : -1
        };

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const columns = this.parseCSVLine(line);

            if (columns.length > columnMap.task && columns[columnMap.task]?.trim()) {
                const completed = columns[columnMap.done]?.toLowerCase().trim();
                const taskText = columns[columnMap.task]?.trim();

                if (taskText) {
                    tasks.push({
                        id: `sheet-${i}`,
                        text: taskText,
                        completed: this.isCompleted(completed),
                        timeline: columnMap.timeline >= 0 ? columns[columnMap.timeline]?.trim() || 'General' : 'General',
                        priority: columnMap.priority >= 0 ?
                            (columns[columnMap.priority]?.toLowerCase().replace(/^\d+\s*-\s*/, '').trim() || 'medium') : 'medium',
                        category: columnMap.category >= 0 ? columns[columnMap.category]?.trim() || '' : '',
                        how: columnMap.how >= 0 ? columns[columnMap.how]?.trim() || '' : '',
                        notes: columnMap.notes >= 0 ? columns[columnMap.notes]?.trim() || '' : '',
                        whoCanHelp: columnMap.whoCanHelp >= 0 ? 
                            this.formatMultiValueField(this.parseMultiValueField(columns[columnMap.whoCanHelp]?.trim() || '')) : '',
                        date: columnMap.date >= 0 ? columns[columnMap.date]?.trim() || '' : '',
                        source: 'google-sheets',
                        rowIndex: i + 1
                    });
                }
            }
        }

        this.tasks = tasks;
        this.saveToLocalStorage();
    }
    

    // Generic helper functions for multi-value (comma/space/semicolon separated) fields
    parseMultiValueField(rawStr) {
        if (!rawStr || !rawStr.trim()) return [];
        return rawStr.split(/[;,\s]+/).filter(v => v.trim() !== '').map(v => v.trim());
    }

    formatMultiValueField(valuesArray) {
        if (!valuesArray || valuesArray.length === 0) return '';
        return valuesArray.filter(v => v && v.trim() !== '').join(', ');
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.replace(/^"|"$/g, ''));
        return result;
    }

    loadCachedData() {
        try {
            const cached = localStorage.getItem('todo-system-cache');
            if (cached) {
                const data = JSON.parse(cached);
                this.tasks = data.tasks || [];
                this.lastSync = data.lastSync ? new Date(data.lastSync) : null;
                this.updateLastSyncDisplay();
                this.renderTasks();
                this.updateProgress();

                const age = Date.now() - (data.timestamp || 0);
                const ageMinutes = Math.floor(age / 60000);
                this.updateSyncStatus(`💾 Cached (${ageMinutes}m old)`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error loading cached data:', error);
            return false;
        }
    }

    loadSampleData() {
        // Use sample data from config, with fallback to basic sample if not available
        this.tasks = this.config?.sampleData || [];
        this.renderTasks();
        this.updateProgress();
        this.updateSyncStatus('📋 Sample Data');
        
        const sampleNotice = document.getElementById('sample-notice');
        if (sampleNotice) {
            sampleNotice.style.display = 'block';
        }
    }

    async addTask(taskData) {
        // Generate unique ID
        const newId = this.useGoogleSheets ? `temp-${Date.now()}` : `local-${Date.now()}`;
        taskData.id = newId;
        taskData.completed = false;
        taskData.source = this.useGoogleSheets ? 'web-ui' : 'local';

        // Add to local tasks array
        this.tasks.push(taskData);
        
        // Save locally
        this.saveToLocalStorage();
        
        // Re-render
        this.renderTasks();
        this.updateProgress();

        // If using Google Sheets, try to sync
        if (this.useAppsScript) {
            try {
                const params = new URLSearchParams({
                    action: 'addTask',
                    text: taskData.text || '',
                    timeline: taskData.timeline || '',
                    priority: taskData.priority || '',
                    category: taskData.category || '',
                    how: taskData.how || '',
                    notes: taskData.notes || '',
                    whoCanHelp: taskData.whoCanHelp || '',
                    date: taskData.date || '',
                    completed: 'FALSE'
                });

                const response = await fetch(`${this.appsScriptUrl}?${params.toString()}`, {
                    method: 'GET'
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        // Update the task with the real ID from the server
                        const task = this.tasks.find(t => t.id === newId);
                        if (task && result.data?.taskId) {
                            task.id = result.data.taskId;
                        }
                        this.updateSyncStatus('✅ Task Added to Sheet');
                    }
                }
            } catch (error) {
                console.error('Failed to sync task to Google Sheets:', error);
                this.updateSyncStatus('⚠️ Added Locally (Sync Failed)');
            }
        } else if (this.useGoogleSheets) {
            this.updateSyncStatus('✅ Added Locally (Manual Sync to Sheet Required)');
        } else {
            this.updateSyncStatus('✅ Task Added');
        }
    }

    async updateTaskInSheet(taskId, field, checked) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            console.error('Task not found:', taskId);
            return;
        }

        // Update locally first
        task[field] = checked;
        this.saveToLocalStorage();
        this.renderTasks();
        this.updateProgress();

        // If using Apps Script, try to sync 
        if (this.useAppsScript) {
            try {
                const params = new URLSearchParams({
                    action: 'updateTask',
                    taskId: taskId,
                    [field]: checked.toString(),
                    updatedBy: 'Web UI',
                    t: Date.now()
                });

                const response = await fetch(`${this.appsScriptUrl}?${params}`, {
                    method: 'GET',
                    mode: 'cors'
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        this.updateSyncStatus('✅ Task Updated');
                        return;
                    }
                }

                throw new Error('Apps Script update failed');

            } catch (error) {
                console.error('Error updating task:', error);
                this.showError(`Failed to update task: ${error.message}`);
            }
        }

        this.updateSyncStatus(this.useGoogleSheets ? '✅ Updated Locally' : '✅ Task Updated');
    }

    renderTasks(tasks = null) {
        // Use provided tasks or fall back to class field
        let tasksToRender = tasks || this.tasks;        
        const todoList = document.getElementById('todo-list');
        if (!todoList) return;

        if (tasksToRender.length === 0) {
            todoList.innerHTML = `<p style="text-align: center; color: var(--color-accent, #ff69b4); padding: 40px;">
                No tasks found.<br>
                ${this.useGoogleSheets ? '<a href="#" onclick="todoApp.loadSampleData()" style="color: var(--color-accent, #ff69b4);">Load sample data</a> or ' : ''}
                <a href="#" onclick="document.getElementById(\'add-task-btn\').click()" style="color: var(--color-accent, #ff69b4);">add your first task</a>
            </p>`;
            this.hideFilterButtons();
            return;
        }

        this.generateFilterButtons(tasksToRender);

        // Get grouping configuration
        const groupsConfig = this.config?.groups || [];
        
        
        // Process each group configuration
        const allGroups = {};
        
        groupsConfig.forEach(groupConfig => {
            const fieldName = groupConfig.field;
            const titleFunction = groupConfig.title;
            
            // Group tasks by this field
            tasksToRender.forEach(task => {
                let groupKey;
                
                if (typeof titleFunction === 'function') {
                    // Use custom title function
                    groupKey = titleFunction(task);
                } else if (typeof titleFunction === 'string' && titleFunction === fieldName) {
                    // Use field value directly, but apply any filter mapping if available
                    const filtersConfig = this.config?.filters || {};
                    const fieldFilter = Object.values(filtersConfig).find(f => f.field === fieldName);
                    if (fieldFilter && fieldFilter.title) {
                        groupKey = fieldFilter.title(task);
                    } else {
                        groupKey = task[fieldName] || 'Other';
                    }
                } else if(fieldName && task[fieldName] !== undefined) {
                    // Default: use field value
                    groupKey = task[fieldName] || 'Other';
                }
                else {
                    groupKey = '';
                }
                
                if (!allGroups[groupKey]) {
                    allGroups[groupKey] = [];
                }
                
                // Insert task in sorted position using config.sort
                const tasks = allGroups[groupKey];
                const sortConfig = this.config?.sort || [];
                this.addSortedTask(tasks, task, sortConfig);
            });
        });
        
        // Sort groups using the field's sort function from data config
        const primaryGroupField = groupsConfig[0]?.field || '';
        const groupKeys = Object.keys(allGroups).sort(this.getFieldConfig(primaryGroupField).sort);
        let html = '';

        // Get field configurations
        const fields = this.getFieldConfigs();
        
        // Find the primary field
        const primaryFieldEntry = Object.entries(fields).find(([fieldName, config]) => config.primary === true);
        const primaryFieldName = primaryFieldEntry ? primaryFieldEntry[0] : 'completed';
        const primaryFieldConfig = primaryFieldEntry ? primaryFieldEntry[1] : this.getFieldConfig('completed');
        
        groupKeys.forEach(groupKey => {
            const tasks = allGroups[groupKey];

            html += `<div class="section todo-group">`;
            html += `<h2 class="timeline-title">${this.escapeHtml(groupKey)}</h2>`;
            

            // Add simple category value in top right corner (no label) - now using 'how' field as category

            tasks.forEach(task => {

                // Generate data attributes dynamically from config.data
                let dataAttributes = `data-task-id="${this.escapeHtml(task.id)}"`;
                let detailHtml = '';
                let topRightItems = '';
                Object.entries(fields).forEach(([fieldName, config]) => {
                    const fieldValue = this.escapeHtml(config.toValue(task[fieldName]));
                    dataAttributes += ` data-${toKebabCase(fieldName)}="${fieldValue}"`;

                     // Only show fields marked for detail display with values
                    if (config.location === "detail" || config.location === "top-right") {
                        const displayValue = task[fieldName] ? this.getHtmlValue(fieldName, task) : '';
                        const icon = config.icon || '';
                        const label = config.label;
                        
                        // Determine the editing method based on field type/config
                        let editingMethod = 'startEditingText'; // default
                        let clearButton = '';
                        
                        if (config.type === 'select' || fieldName === 'priority' || fieldName === 'category') {
                            editingMethod = 'startEditingDropdown';
                        } else if (config.type === 'date' || fieldName === 'date' || fieldName === 'dueDate') {
                            editingMethod = 'startEditingDate';
                            // Add clear button for date fields
                            if (displayValue) {
                                clearButton = `<span class="clear-icon" onclick="event.stopPropagation(); todoApp.clearDateField('${task.id}')" title="Clear date">✕</span>`;
                            }
                        }
                        const editSpan = `<span class="${config.location}-value editable-text" data-task-id="${task.id}" data-field="${fieldName}" onclick="todoApp.${editingMethod}(this)">${displayValue || `<span class="empty-field">Click to set ${label.toLowerCase()}...</span>`}<span class="edit-icon">✏️</span>${clearButton}</span>`;
                        if(config.location === "top-right") {
                            topRightItems += editSpan;
                        }
                        else {
                            detailHtml += `<div class="detail-item">
                                    <span class="detail-icon">${icon}</span>
                                    <span class="detail-label">${label}:</span> 
                                    ${editSpan}
                                </div>`;
                        }
                    }
                });

                html += `<div class="todo-item" ${dataAttributes}>`;

                
                
                if (topRightItems) {
                    html += `<div class="priority-corner-section">${topRightItems}</div>`;
                }

                html += `<div class="todo-main-content">`;
                
                // Determine if primary field indicates completion/true state
                const isCompleted = primaryFieldName && task[primaryFieldName];
                
                html += `<div class="todo-text-row ${isCompleted ? 'todo-completed' : ''}">`;
                html += `<div class="todo-left-column">`;
                
                // Render checkbox based on primary field type
                if (primaryFieldConfig.type === 'checkbox') {
                    // Render as checkbox for boolean fields
                    const isChecked = isCompleted ? 'checked' : '';
                    html += `<input type="checkbox" class="todo-checkbox" ${isChecked} 
                               onchange="todoApp.updateTaskInSheet('${task.id}', '${primaryFieldName}', this.checked)">`;
                } else {
                    // Render the primary field value for non-boolean fields
                    const primaryValue = this.getHtmlValue(primaryFieldName, task);
                    html += `<div class="primary-field-display">${primaryValue}</div>`;
                }
                
                html += `</div>`;

                html += `<div class="todo-right-column">`;

                let taskText = this.getHtmlValue('text', task);
                html += `<div class="todo-text">`;
                html += `<h3 class="editable-text" data-task-id="${task.id}" data-field="text" onclick="todoApp.startEditingText(this)">${taskText}<span class="edit-icon">✏️</span></h3>`;
                html += `</div>`;

                // Only show priority section if priority field is configured
                if (fields['priority']) {
                    const priorityValue = task.priority;
                    html += `<div class="priority-right-section editable-text" data-task-id="${task.id}" data-field="priority" onclick="todoApp.startEditingDropdown(this)" title="Click to change priority">`;
                    html += `<div class="priority-top-icon">${fields['priority'].toIcon(priorityValue) || ''}</div>`;
                    if (priorityValue) {
                        html += `<div class="priority-text-label">${this.getHtmlValue('priority', task)}</div>`;
                    } else {
                        html += `<div class="priority-text-label empty-field">—</div>`;
                    }
                    html += `<span class="edit-icon">✏️</span>`;
                    html += `</div>`;
                    html += `</div>`;
                }

                html += `</div>`;
                html += `</div>`;

                // Task details
                html += `<div class="task-details">`;
                html += `<div class="todo-left-column-spacer"></div>`;
                html += `<div class="task-details-content">`;
                html += detailHtml;
                html += `</div>`;
                html += `</div>`;
                html += `</div>`;
                html += `</div>`;
            });

            html += `</div>`;
        });

        todoList.innerHTML = html;
        this.applyFilter(this.currentFilter, this.currentFilterField, this.currentFilterValue, tasksToRender);
        this.populateFormDropdowns(tasksToRender);
        // Initialize dynamic multi-helper selects inside each task detail (legacy behavior)
        try { this.initializeDetailMultiSelects(tasksToRender); } catch(e){ console.warn('Failed initializing detail multiselects:', e); }
    }


    // Helper method to add a task to an array in sorted order
    addSortedTask(tasks, newTask, sortConfig) {
        if (sortConfig.length === 0) {
            tasks.push(newTask);
            return;
        }
        
        const insertIndex = tasks.findIndex(existingTask => 
            this.compareTasks(newTask, existingTask, sortConfig) < 0
        );
        
        tasks.splice(insertIndex === -1 ? tasks.length : insertIndex, 0, newTask);
    }
    // Helper method to compare two tasks based on config.sort rules
    compareTasks(taskA, taskB, sortConfig) {
        for (const { field, direction = 'asc' } of sortConfig) {
            const comparison = this.getFieldConfig(field).sort(taskA[field], taskB[field]);
            if (comparison !== 0) {
                return direction === 'desc' ? -comparison : comparison;
            }
        }
        return 0;
    }

    // Generic detail multiselect initializer (replaces whoCanHelp-specific version)
    initializeDetailMultiSelects(tasks) {
        const multiselectFields = Object.entries(this.getFieldConfigs()).filter(([_, cfg]) => cfg.type === 'multiselect');
        multiselectFields.forEach(([fieldName, cfg]) => {
            // Collect unique values across tasks for this field
            const valueSet = new Set();
            tasks.forEach(t => (t[fieldName]||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(v=>valueSet.add(v)));
            const options = Array.from(valueSet).sort((a,b)=>a.localeCompare(b));
            // Find detail items with this field
            const detailSelectors = document.querySelectorAll(`.todo-item .detail-item .editable-text[data-field="${fieldName}"]`);
            detailSelectors.forEach(valueSpan => {
                const container = valueSpan.closest('.detail-item');
                if (!container) return;
                const taskId = valueSpan.getAttribute('data-task-id');
                const task = tasks.find(t => t.id === taskId);
                if (!task) return;
                const dynamicId = `detail-${toKebabCase(fieldName)}-${taskId}`;
                let dynamicWrapper = container.querySelector(`#${dynamicId}`);
                if (!dynamicWrapper) {
                    dynamicWrapper = document.createElement('div');
                    dynamicWrapper.id = dynamicId;
                    dynamicWrapper.className = 'who-can-help-dynamic-container'; // reuse styling
                    valueSpan.style.display = 'none';
                    container.appendChild(dynamicWrapper);
                } else { dynamicWrapper.innerHTML=''; }
                const existingValues = (task[fieldName]||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
                const buildSelect = (selectedValue='') => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'who-helper-row';
                    const select = document.createElement('select');
                    select.className = `detail-multiselect-select multi-select-${fieldName} editable-dropdown helper-dropdown editing-dropdown`;
                    const blankOpt = document.createElement('option'); blankOpt.value=''; blankOpt.textContent='';
                    select.appendChild(blankOpt);
                    options.forEach(o => { const opt = document.createElement('option'); opt.value=o; opt.textContent=o; if(o===selectedValue) opt.selected=true; select.appendChild(opt); });
                    select.addEventListener('change', ()=> {
                        const all = Array.from(dynamicWrapper.querySelectorAll('select.multi-select-'+fieldName));
                        const last = all[all.length-1];
                        // Auto-append a new blank if last got a value
                        if (last && last.value && all.every(s => s !== last || s.value)) {
                            dynamicWrapper.appendChild(buildSelect(''));
                        }
                        // Persist changes
                        this.persistDetailMultiSelectChange(taskId, fieldName, dynamicWrapper);
                        // Remove any intermediate blank selects (keep only trailing blank)
                        const selects = Array.from(dynamicWrapper.querySelectorAll('select.multi-select-'+fieldName));
                        selects.forEach((s, idx) => {
                            if (!s.value && idx < selects.length - 1) {
                                const row = s.closest('.who-helper-row');
                                if (row) row.remove();
                            }
                        });
                    });
                    wrapper.appendChild(select);
                    return wrapper;
                };
                existingValues.forEach(v=>dynamicWrapper.appendChild(buildSelect(v)));
                dynamicWrapper.appendChild(buildSelect(''));
            });
        });
    }

    persistDetailMultiSelectChange(taskId, fieldName, wrapperEl) {
        const selects = Array.from(wrapperEl.querySelectorAll(`select.multi-select-${fieldName}`));
        const values = selects.map(s=>s.value.trim()).filter(Boolean);
        const unique=[]; values.forEach(v=>{ if(!unique.includes(v)) unique.push(v); });
        const joined = unique.join(', ');
        const task = this.tasks.find(t=>t.id===taskId);
        if(task){ task[fieldName]=joined; this.debouncedGenericMultiPersist(taskId, fieldName, joined); }
    }

    // Debounce persistence for multiselect fields (per task+field)
    debouncedGenericMultiPersist = (() => {
        const timers = new Map();
        const delay = 600;
        return (taskId, fieldName, value) => {
            const key = `${taskId}:${fieldName}`;
            if (timers.has(key)) clearTimeout(timers.get(key));
            const t = setTimeout(()=>{
                this.updateTaskInSheet(taskId, fieldName, value);
                timers.delete(key);
            }, delay);
            timers.set(key, t);
        };
    })();

    populateFormDropdowns(tasks = null) {
        // Use provided tasks or fall back to class field
        const tasksToProcess = tasks || this.tasks;
        // Get data field configuration with safety check
        const dataFields = this.getFieldConfigs();
        
        // If no data configuration exists, exit gracefully
        if (Object.keys(dataFields).length === 0) {
            console.warn('No data field configuration found in config.data');
            return;
        }
        
        // Default options for select fields
        const defaultSelectOptions = {
            preserveEmptyOption: true,
            preserveOtherOption: true
        };
        
        // Process each field that is dynamic and a select type
        Object.entries(dataFields).forEach(([fieldName, fieldConfig]) => {
            // Check if field should be dynamically populated (default: false)
            const isDynamic = fieldConfig.dynamic === true;
            if (!isDynamic || fieldConfig.type !== 'select') return;
            
            // Extract unique values from tasks for this field
            const uniqueValues = [...new Set(
                tasksToProcess
                    .map(task => task[fieldName])
                    .filter(Boolean) // Remove empty/null/undefined values
            )].sort();
            
            // Merge default options with field-specific options
            const options = {
                ...defaultSelectOptions,
                ...(fieldConfig.options || {})
            };
            
            // Generate default elementId or use provided one
            const elementId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
            
            // Populate the dropdown
            this.populateDropdown(elementId, uniqueValues, options);
        });
    }

    populateDropdown(elementId, values, config = {}) {
        // Special handling: generic multiselect fields use container-based dynamic selects
        const fieldNameFromId = elementId.replace(/^task-/, '').replace(/-([a-z])/g, (_,c)=>c.toUpperCase());
        const fieldCfg = this.getFieldConfig(fieldNameFromId);
        if (fieldCfg && fieldCfg.type === 'multiselect') {
            this.populateGenericMultiSelect(fieldNameFromId, values, config);
            return;
        }
        
        const select = document.getElementById(elementId);
        if (!select) return;

        // Preserve current selection
        const currentValue = select.value;
        
        // Remove existing dynamic options, but preserve configured static options
        const existingOptions = Array.from(select.options);
        existingOptions.forEach(option => {
            const isEmptyOption = option.value === '' && config.preserveEmptyOption;
            const isOtherOption = option.value === 'Other' && config.preserveOtherOption;
            
            if (!isEmptyOption && !isOtherOption) {
                option.remove();
            }
        });

        // Add dynamic options
        const otherOption = config.preserveOtherOption ? select.querySelector('option[value="Other"]') : null;
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            if (otherOption) {
                select.insertBefore(option, otherOption);
            } else {
                select.appendChild(option);
            }
        });

        // Restore selection
        select.value = currentValue;
    }

    populateGenericMultiSelect(fieldName, values=null, config={}) {
        const container = document.getElementById(`${toKebabCase(fieldName)}-container`);
        if (!container) return;
        if (!values) {
            const valSet = new Set();
            (this.tasks||[]).forEach(task => {
                const raw = task[fieldName];
                if (!raw) return;
                raw.split(/[;,]/).map(v=>v.trim()).filter(v=>v).forEach(v=>valSet.add(v));
            });
            values = Array.from(valSet).sort((a,b)=>a.localeCompare(b));
        }
        const selects = container.querySelectorAll(`.multi-select-${fieldName}`);
        selects.forEach(select => {
            const currentValue = select.value;
            Array.from(select.options).forEach(opt => {
                if (opt.value && opt.value !== 'Other' && !values.includes(opt.value)) {
                    // allow removal of values not in current list? keep for now
                }
            });
            const otherOption = select.querySelector('option[value="Other"]');
            values.forEach(val => {
                if (Array.from(select.options).some(o => o.value === val)) return;
                const opt = document.createElement('option');
                opt.value = val; opt.textContent = val;
                if (otherOption) select.insertBefore(opt, otherOption); else select.appendChild(opt);
            });
            if (currentValue) select.value = currentValue;
        });
        const currentSelects = container.querySelectorAll(`.multi-select-${fieldName}`);
        const last = currentSelects[currentSelects.length-1];
        if (last && last.value) this.addEmptyGenericMultiSelect(fieldName);
    }

    getFilterValue(fieldName, fieldValue) {
        return this.getFieldConfig(fieldName).toValue(fieldValue) || 'Other';
    }

    getHtmlValue(fieldName, task) {
        return this.getFieldConfig(fieldName)?.toHtml(task[fieldName]) || '';
    }

    capitalizeWords(str) {
        return str.replace(/([A-Z])/g, ' $1')
                 .replace(/^./, s => s.toUpperCase())
                 .trim();
    }

    getFieldConfigs() {
        if(this.config?.data === null || this.config?.data === undefined) return {};
        
        // Return cached result if available
        if (this.allFieldConfigsCache !== null) {
            return this.allFieldConfigsCache;
        }
        
        const fieldConfigs = {};
        Object.keys(this.config.data).forEach(fieldName => {
            fieldConfigs[fieldName] = this.getFieldConfig(fieldName);
        });
        
        // Cache the result
        this.allFieldConfigsCache = fieldConfigs;
        return fieldConfigs;
    }
    getFieldConfig(fieldName) {
        // Check cache first
        if (this.fieldConfigCache.has(fieldName)) {
            return this.fieldConfigCache.get(fieldName);
        }
        
        const dataFields = this.config?.data || {};
        const fieldConfig = dataFields[fieldName] || {};
        // Default field configuration values
        const defaultFieldConfig = {
            type: 'text',
            required: false,
            dynamic: false,
            location: null,
            primary: false,
            icon: null,
            label: null,
            toValue: null,
            toText: null,
            toHtml: null,
            sort: null,
            options: {
                preserveEmptyOption: true,
                preserveOtherOption: true,
                mode: null
            }
        };
        // Merge defaults with field-specific configuration
        const mergedConfig = {
            ...defaultFieldConfig,
            ...fieldConfig,
            options: {
                ...defaultFieldConfig.options,
                ...(fieldConfig.options || {})
            }
        };
        const toValueType = typeof mergedConfig.toValue;
        if(toValueType === 'string')
            mergedConfig.toValue = (_) => mergedConfig.toValue;

        if(toValueType !== 'function') {
            if(mergedConfig.toValue !== null && mergedConfig.toValue !== undefined)
                console.warn(`Invalid toValue for field "${fieldName}", must be function or string. Using identity function.`);
            if(mergedConfig.type === 'checkbox') {
                mergedConfig.toValue = (v) => {
                    const value = v?.toString().toLowerCase() || '';
                    return value === 'true' || value === 'yes' || value === '1' || value === 'checked' ? 'checked' : '';
                }
            }
            else {
                mergedConfig.toValue = (v) => v;
            }
        }
        const toTextType = typeof mergedConfig.toText;
        if(toTextType === 'string')
            mergedConfig.toText = (_) => mergedConfig.toText;
        
        if(toTextType !== 'function') {
            if(mergedConfig.toText !== null && mergedConfig.toText !== undefined)
                console.warn(`Invalid toText for field "${fieldName}", must be function or string. Using default toString function.`);
            mergedConfig.toText = v => mergedConfig.toValue(v)?.toString() || '';
        }
        const toHtmlType = typeof mergedConfig.toHtml;
        if(toHtmlType === 'string')
            mergedConfig.toHtml = (_) => mergedConfig.toHtml;

        if(toHtmlType !== 'function') {
            if(mergedConfig.toHtml !== null && mergedConfig.toHtml !== undefined)
                console.warn(`Invalid toHtml for field "${fieldName}", must be function or string. Using default toString function.`);
            if(mergedConfig.type === 'text' || mergedConfig.type === 'textarea')
                mergedConfig.toHtml = v => this.linkifyUrls(mergedConfig.toValue(v)) || '';
            else if(mergedConfig.type === 'audio')
                mergedConfig.toHtml = v => {
                    const value = mergedConfig.toValue(v);
                    if (!value) return '';
                    
                    // If it's a Google Drive link, format it nicely
                    if (value.includes('drive.google.com')) {
                        return `<a href="${value}" target="_blank" class="audio-link" title="Open audio file">🎵 Audio File</a>`;
                    }
                    
                    // For other links, show the full URL
                    return `<a href="${value}" target="_blank" class="audio-link" title="Open audio file">${this.escapeHtml(value)}</a>`;
                };
            else
                mergedConfig.toHtml = v => this.escapeHtml(mergedConfig.toText(v));
        }
        if(!mergedConfig.label) {
            mergedConfig.label = this.capitalizeWords(fieldName);
        }
        const defaultSort = (a, b) => {
            if (typeof a === 'boolean' && typeof b === 'boolean') {
                return a === b ? 0 : a ? 1 : -1; // false comes before true
            }
            if (typeof a === 'string' && typeof b === 'string') {
                return a.localeCompare(b);
            }
            return a == null ? (b == null ? 0 : 1) : (b == null ? -1 : String(a).localeCompare(String(b)));
        };
        if(Array.isArray(mergedConfig.sort)) {
            const sortArray = mergedConfig.sort;
            mergedConfig.sort = (a, b) => {
                const aIndex = sortArray.indexOf(a);
                const bIndex = sortArray.indexOf(b);
                return aIndex !== -1 && bIndex !== -1 ? aIndex - bIndex :
                    aIndex !== -1 ? -1 :
                    bIndex !== -1 ? 1 :
                    defaultSort(a, b);
            };
        }
        if(typeof mergedConfig.sort !== 'function') {
            if(mergedConfig.sort !== null && mergedConfig.sort !== undefined) 
                console.warn(`Invalid sort for field "${fieldName}", must be function or array. Using default alphabetical sort.`);
            mergedConfig.sort = (a, b) => defaultSort(mergedConfig.toValue(a), mergedConfig.toValue(b));
        }
        // Cache the result
        this.fieldConfigCache.set(fieldName, mergedConfig);
        return mergedConfig;
    }
    
    generateFilterButtons(tasks = null) {
        // Use provided tasks or fall back to class field
        const tasksToProcess = tasks || this.tasks;
        const filterContainer = document.getElementById('filter-buttons');
        if (!filterContainer) return;

        const filtersConfig = this.config?.filters || {};
        const dataFields = this.getFieldConfigs();
        
        // Generate buttons for all filter types
        let allFilterButtons = [];
        
        Object.entries(filtersConfig).forEach(([filterKey, filterConfig]) => {
            if (filterConfig.apply) {
                // Fixed filter with apply function (all, incomplete, completed, etc.)
                const matchingTasks = tasksToProcess.filter(task => {
                    if (filterKey === 'all') return true; // 'all' always shows count
                    return filterConfig.apply(task);
                });
                
                // Only add button if it has matching tasks or is the 'all' filter
                if (matchingTasks.length > 0 || filterKey === 'all') {
                    allFilterButtons.push({
                        id: filterKey,
                        label: filterConfig.title,
                        type: 'fixed',
                        config: filterConfig,
                        count: matchingTasks.length
                    });
                }
            } else if (filterConfig.field) {
                // Field-based filter (timeline, category, etc.)
                const fieldName = filterConfig.field;
                const titleFunction = filterConfig.title;
                
                // Get unique values for this field after applying title mapping
                const fieldValues = [...new Set(tasksToProcess.map(task => {
                    const rawValue = task[fieldName];
                    return titleFunction ? titleFunction(task) : (rawValue || 'Other');
                }))];
                
                // Sort the values using the field's sort function from data config or default
                const fieldDataConfig = dataFields[fieldName];
                const sortFunction = fieldDataConfig?.sort || ((a, b) => a.localeCompare(b));
                const sortedValues = fieldValues.sort(sortFunction);
                
                // Create filter buttons for this field
                sortedValues.forEach(value => {
                    // Count tasks that match this field value
                    const matchingTasks = tasksToProcess.filter(task => {
                        const mappedValue = titleFunction ? titleFunction(task) : (task[fieldName] || 'Other');
                        return mappedValue === value;
                    });
                    
                    // Only add button if it has matching tasks
                    if (matchingTasks.length > 0) {
                        const safeValue = value.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
                        const buttonId = `${fieldName}-${safeValue}`;
                        allFilterButtons.push({
                            id: buttonId,
                            label: value,
                            type: 'field',
                            fieldName: fieldName,
                            fieldValue: value,
                            config: filterConfig,
                            count: matchingTasks.length
                        });
                    }
                });
            }
        });

        // Generate HTML for all buttons
        let buttonsHtml = '';
        
        // Add fixed filter buttons first
        const fixedButtons = allFilterButtons.filter(btn => btn.type === 'fixed');
        fixedButtons.forEach(button => {
            buttonsHtml += `<button class="filter-btn" data-filter="${button.id}">${this.escapeHtml(button.label)}</button>`;
        });

        // Add field-based filter buttons
        const fieldButtons = allFilterButtons.filter(btn => btn.type === 'field');
        if (fieldButtons.length > 0) {
            buttonsHtml += '<div style="flex-basis: 100%; height: 0;"></div>';
            fieldButtons.forEach(button => {
                buttonsHtml += `<button class="filter-btn" data-filter="${button.id}" data-field="${button.fieldName}" data-value="${this.escapeHtml(button.fieldValue)}">${this.escapeHtml(button.label)}</button>`;
            });
        }

                // Add completed items checkbox and refresh button at the bottom
        buttonsHtml += '<div style="flex-basis: 100%; height: 0;"></div>';
        buttonsHtml += '<div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">';
        buttonsHtml += '<label style="color: var(--color-text); font-size: 14px; cursor: pointer;" class="show-completed-label"><input type="checkbox" id="show-completed-checkbox" style="margin-right: 8px;"> Show Completed Items</label>';
        buttonsHtml += '<div style="display: flex; align-items: center; gap: 12px;">';
        buttonsHtml += '<button id="refresh-btn" class="refresh-btn-inline" style="display: flex; align-items: center; gap: 6px; background: none; border: none; color: var(--color-text); cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 4px; transition: all 0.3s ease;"><span style="font-size: 16px;">↻</span>Refresh from sheet</button>';
        buttonsHtml += '<div id="last-sync" style="color: #7d8590; font-size: 12px;">Never synced</div>';
        buttonsHtml += '</div>';
        buttonsHtml += '</div>';

        filterContainer.innerHTML = buttonsHtml;
        filterContainer.style.display = 'flex';

        // Set active button
        let activeButton = filterContainer.querySelector(`[data-filter="${this.currentFilter}"]`);
        if (!activeButton) {
            activeButton = filterContainer.querySelector('[data-filter="all"]');
            this.currentFilter = 'all';
        }
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // Add event listeners
        filterContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                this.handleFilterClick(e.target);
            }
        });

        // Add event listener for the completed items checkbox
        const showCompletedCheckbox = filterContainer.querySelector('#show-completed-checkbox');
        if (showCompletedCheckbox) {
            // Initialize the checkbox state (default unchecked)
            this.showCompleted = this.showCompleted || false;
            showCompletedCheckbox.checked = this.showCompleted;

            showCompletedCheckbox.addEventListener('change', (e) => {
                this.showCompleted = e.target.checked;
                this.applyFilter(this.currentFilter);
            });
        }

        // Add event listener for the refresh button
        const refreshBtn = filterContainer.querySelector('#refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadFromSheet());
        }
    }

    handleFilterClick(button) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.currentFilter = button.dataset.filter;
        this.currentFilterField = button.dataset.field;
        this.currentFilterValue = button.dataset.value;
        this.saveCurrentFilter();
        this.applyFilter(this.currentFilter, this.currentFilterField, this.currentFilterValue);
    }

    applyFilter(filterType, filterField = null, filterValue = null, tasks = null) {
        // Use provided tasks or fall back to class field
        const tasksToFilter = tasks || this.tasks;
        const todoItems = document.querySelectorAll('.todo-item');
        const todoGroups = document.querySelectorAll('.todo-group');

        const filtersConfig = this.config?.filters || {};
        const fixedFilter = filtersConfig[filterType];
        const fieldFilter = filterField ? Object.values(filtersConfig).find(f => f.field === filterField) : null;
        todoItems.forEach(item => {
            let show = false;
            if(!this.showCompleted && this.isCompleted(item.dataset.completed)) {
                show = false;
            }
            // Check if this is a fixed filter with an apply function
            else if (fixedFilter && fixedFilter.apply) {
                // Get the task data for this item
                const taskId = item.dataset.taskId;
                const task = tasksToFilter.find(t => t.id === taskId);
                if (task) {
                    show = fixedFilter.apply(task);
                } else {
                    console.error('Task not found for filtering:', taskId);
                }
            } else if (filterField && filterValue) {
                // Field-based filtering
                if (fieldFilter && fieldFilter.title) {
                    // Get the raw field value from the task
                    const taskId = item.dataset.taskId;
                    const task = tasksToFilter.find(t => t.id === taskId);
                    if (task) {
                        const mappedValue = fieldFilter.title(task);
                        show = mappedValue === filterValue;
                    } else {
                        // Fallback to dataset attribute
                        const rawFieldValue = item.dataset[filterField] || '';
                        const displayValue = this.getFilterValue(filterField, rawFieldValue);
                        show = displayValue === filterValue;
                    }
                } else {
                    // Fallback to old logic
                    const rawFieldValue = item.dataset[filterField] || '';
                    const displayValue = this.getFilterValue(filterField, rawFieldValue);
                    show = displayValue === filterValue;
                }
            } else {
                // Fallback logic for any unhandled cases
                show = filterType === 'all';
            }

            item.style.display = show ? '' : 'none';
        });

        // Hide empty groups
        todoGroups.forEach(group => {
            const visibleItems = group.querySelectorAll('.todo-item:not([style*="display: none"])');
            group.style.display = visibleItems.length === 0 ? 'none' : '';
        });
    }

    hideFilterButtons() {
        const filterContainer = document.getElementById('filter-buttons');
        if (filterContainer) {
            filterContainer.style.display = 'none';
        }
    }

    updateProgress() {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(task => this.isCompleted(task.completed)).length;
        const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `${completedTasks} of ${totalTasks} completed (${Math.round(percentage)}%)`;
        }
    }

    updateLastSyncDisplay() {
        const lastSyncEl = document.getElementById('last-sync');
        if (lastSyncEl && this.lastSync) {
            const timeAgo = this.getTimeAgo(this.lastSync);
            lastSyncEl.textContent = `Last synced: ${timeAgo}`;
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    // Form handling
    showAddTaskForm() {
        this.showAddTaskModal();
    }
    
    toggleAddTaskForm() {
        console.log('🔄 Toggle add task form called');
        try {
            const addTaskForm = document.getElementById('add-task-form');
            console.log('🔍 Add task form element found:', !!addTaskForm);
            
            if (!addTaskForm) {
                console.error('❌ Add task form not found!');
                return;
            }
            
            if (addTaskForm.style.display === 'block') {
                console.log('📤 Hiding form');
                this.hideAddTaskForm();
            } else {
                console.log('📥 Showing modal');
                this.showAddTaskModal();
            }
        } catch (error) {
            console.error('💥 Error in toggleAddTaskForm:', error);
        }
    }

    showAddTaskModal() {
        console.log('🎭 showAddTaskModal called');
        try {
            let backdrop = document.getElementById('modal-backdrop');
            console.log('🔍 Backdrop found:', !!backdrop);
            
            if (!backdrop) {
                console.log('🆕 Creating new backdrop');
                backdrop = document.createElement('div');
                backdrop.id = 'modal-backdrop';
                backdrop.className = 'modal-backdrop';
                backdrop.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 1000;
                    display: none;
                `;
                document.body.appendChild(backdrop);
            } else {
                console.log('🔄 Using existing backdrop');
            }
            
            console.log('👁️ Setting backdrop display to block and adding show class');
            backdrop.style.display = 'block';
            backdrop.classList.add('show');
            console.log('📊 Backdrop display after setting:', backdrop.style.display);
            console.log('📊 Backdrop has show class:', backdrop.classList.contains('show'));

            const addTaskForm = document.getElementById('add-task-form');
            console.log('🔍 Form found:', !!addTaskForm);
            
            this.populateFormDropdowns();
            console.log('✅ Form dropdowns populated');
            
            addTaskForm.style.display = 'block';
            addTaskForm.classList.add('show');
            console.log('📊 Form display after setting:', addTaskForm.style.display);
            console.log('📊 Form has show class:', addTaskForm.classList.contains('show'));

            const taskPriority = document.getElementById('task-priority');
            if (taskPriority) taskPriority.value = 'medium';

            backdrop.addEventListener('click', () => this.hideAddTaskForm());
            addTaskForm.addEventListener('click', (e) => e.stopPropagation());

            const taskTitle = document.getElementById('task-title');
            if (taskTitle) {
                taskTitle.focus();
                console.log('✅ Focus set on task title');
            }
            
            console.log('🎉 Modal should now be visible');
        } catch (error) {
            console.error('💥 Error in showAddTaskModal:', error);
        }
    }

    hideAddTaskForm() {
        const addTaskForm = document.getElementById('add-task-form');
        const backdrop = document.getElementById('modal-backdrop');
        const form = document.getElementById('new-task-form');

        if (addTaskForm) {
            addTaskForm.style.display = 'none';
            addTaskForm.classList.remove('show');
        }
        if (backdrop) {
            backdrop.style.display = 'none';
            backdrop.classList.remove('show');
        }
        if (form) form.reset();

        // Dynamically build list of "other" fields to hide from configuration
        const dataFields = this.getFieldConfigs();
        
        const otherFields = [];
        Object.entries(dataFields).forEach(([fieldName, fieldConfig]) => {
            if (fieldConfig.type === 'select' && 
                fieldConfig.options?.preserveOtherOption !== false) {
                
                const selectId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
                const otherId = `${selectId}-other`;
                otherFields.push(otherId);
            }
        });

        // Hide all "other" fields
        otherFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.style.display = 'none';
        });
    }

    handleOtherOption(event, otherFieldId) {
        const otherField = document.getElementById(otherFieldId);
        const otherContainer = document.getElementById(otherFieldId + '-container');

        if (event.target.value === 'Other') {
            if (otherContainer) {
                otherContainer.style.display = 'block';
            } else if (otherField) {
                otherField.style.display = 'block';
            }
            if (otherField) otherField.focus();
        } else {
            if (otherContainer) {
                otherContainer.style.display = 'none';
            } else if (otherField) {
                otherField.style.display = 'none';
                otherField.value = '';
            }
        }
    }

    async handleAddTask(event) {
        event.preventDefault();
        this.showAddTaskLoading(true);

        const formData = new FormData(event.target);
        const dataFields = this.getFieldConfigs();
        
        // Build taskData dynamically from configuration
        const taskData = {};
        
        // Process each configured field
        for (const [fieldName, fieldConfig] of Object.entries(dataFields)) {
            let fieldValue = null;
            
            // Get the form field name (use configured formFieldName or derive from fieldName)
            const formFieldName = fieldConfig.formFieldName || fieldName;
            
            // Get the data field name (use configured dataName or use fieldName)
            const dataFieldName = fieldConfig.dataName || fieldName;
            
            // Handle different field types
            switch (fieldConfig.type) {
                case 'select':
                    fieldValue = formData.get(formFieldName) || (fieldConfig.defaultValue || '');
                    
                    // Handle "Other" option for select fields
                    if (fieldValue === 'Other' && fieldConfig.options?.preserveOtherOption !== false) {
                        const otherFieldName = `${formFieldName}Other`;
                        fieldValue = formData.get(otherFieldName)?.trim() || (fieldConfig.defaultValue || '');
                    }
                    break;
                    
                case 'text':
                case 'textarea':
                    fieldValue = formData.get(formFieldName)?.trim() || (fieldConfig.defaultValue || '');
                    break;
                    
                case 'date':
                    fieldValue = formData.get(formFieldName) || (fieldConfig.defaultValue || '');
                    break;
                    
                case 'audio':
                    // For audio fields, prioritize the URL input over file upload
                    const audioUrl = formData.get(`${formFieldName.replace('audioFile', 'audioUrl')}`);
                    fieldValue = audioUrl?.trim() || (fieldConfig.defaultValue || '');
                    
                    // If no URL provided, check if a file was selected for upload
                    if (!fieldValue) {
                        const fileInput = document.getElementById(`task-${toKebabCase(formFieldName)}`);
                        if (fileInput && fileInput.files.length > 0) {
                            try {
                                // Show upload progress
                                this.showAddTaskLoading(true, 'Uploading audio file to Google Drive...');
                                
                                // Upload file to Google Drive and get shareable link
                                fieldValue = await this.uploadAudioFileToGoogleDrive(fileInput.files[0], fieldConfig.options?.driveFolder);
                                
                                // Update loading message
                                this.showAddTaskLoading(true, 'Creating task...');
                                
                            } catch (error) {
                                console.error('File upload failed:', error);
                                throw new Error(`File upload failed: ${error.message}`);
                            }
                        } else {
                            fieldValue = fieldConfig.defaultValue || '';
                        }
                    }
                    break;
                    
                default:
                    fieldValue = formData.get(formFieldName) || (fieldConfig.defaultValue || '');
                    break;
            }
            
            // Generic handling for multiselect fields
            if (fieldConfig.type === 'multiselect') {
                fieldValue = this.getSelectedMultiValues(dataFieldName);
            }
            
            // Set the field value in taskData using the data field name
            taskData[dataFieldName] = fieldValue;
        }

        if (!taskData.text) {
            this.showAddTaskLoading(false);
            alert('Please enter a task description.');
            return;
        }

        try {
            await this.addTask(taskData);
            this.showAddTaskLoading(false);
            this.hideAddTaskForm();
        } catch (error) {
            console.error('Error adding task:', error);
            this.showAddTaskLoading(false);
            this.showError(`Failed to add task: ${error.message}`);
        }
    }

    showAddTaskLoading(show, message = 'Adding task...') {
        const loadingOverlay = document.getElementById('add-task-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
            
            // Update loading message if provided
            const loadingText = loadingOverlay.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = message;
            }
        }
    }

    showLoading(show) {
        if (this.isInitialLoad) {
            const loading = document.getElementById('loading');
            if (loading) loading.style.display = show ? 'block' : 'none';
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error-display');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 8000);
        } else {
            console.error('Error:', message);
            alert('Error: ' + message);
        }
    }

    showOfflineNotice() {
        const offlineNotice = document.getElementById('offline-notice');
        if (offlineNotice) offlineNotice.style.display = 'block';
    }

    hideOfflineNotice() {
        const offlineNotice = document.getElementById('offline-notice');
        if (offlineNotice) offlineNotice.style.display = 'none';
    }

    updateSyncStatus(status) {
        const syncStatusText = document.getElementById('sync-status-text');
        if (syncStatusText) {
            syncStatusText.textContent = status;
            // Keep status visible in bottom bar (no auto-hide)
            syncStatusText.style.display = 'block';
            setTimeout(() => {
                syncStatusText.style.display = 'none';
            }, 3000);
        }

        // Update any legacy elements that might still exist
        const lastSyncElement = document.getElementById('last-sync');
        if (lastSyncElement) {
            lastSyncElement.textContent = status;
        }
    }

    saveToCache() {
        try {
            const cacheData = {
                tasks: this.tasks,
                lastModified: this.lastModified,
                timestamp: Date.now()
            };
            localStorage.setItem('todo-system-cache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('Failed to cache data:', error);
        }
    }

    isCompleted(completedValue) {
        if (completedValue === null || completedValue === undefined) return false;
        const value = String(completedValue).toLowerCase().trim();
        return value === 'true' || value === '✓' || value === 'yes' || value === '1' || value === 'checked';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    linkifyUrls(text) {
        const escapedText = this.escapeHtml(text);
        const textWithBreaks = escapedText.replace(/\n/g, '<br>');
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;

        return textWithBreaks.replace(urlRegex, (match, url) => {
            try {
                const hostname = new URL(url).hostname.replace(/^www\./, '');
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--color-accent, #ff69b4); text-decoration: underline;">${hostname}</a>`;
            } catch (e) {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--color-accent, #ff69b4); text-decoration: underline;">${url}</a>`;
            }
        });
    }

    // Date picker methods (if flatpickr is available)
    initializeDatePicker() {
        if (typeof flatpickr === 'undefined') return;

        // Find date fields from configuration
        const dataFields = this.getFieldConfigs();

        Object.entries(dataFields).forEach(([fieldName, fieldConfig]) => {
            if (fieldConfig.type === 'date') {
                const fieldId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
                
                const config = this.getFlatpickrConfig({
                    onChange: (selectedDates, dateStr, instance) => {
                        this.handleTaskDateChange(selectedDates, dateStr, instance, fieldId);
                    }
                });

                this.taskDatePicker = flatpickr(`#${fieldId}`, config);
                this.taskDateMode = config.defaultMode || 'single';
            }
        });
    }

    initializeAudioField() {
        // Find audio fields from configuration
        const dataFields = this.getFieldConfigs();

        Object.entries(dataFields).forEach(([fieldName, fieldConfig]) => {
            if (fieldConfig.type === 'audio') {
                const fieldId = fieldConfig.elementId || `task-${toKebabCase(fieldName)}`;
                const fileInput = document.getElementById(fieldId);
                const filenameSpan = document.querySelector('.audio-filename');
                const urlInput = document.getElementById(`${fieldId.replace('file', 'url')}`);
                
                if (fileInput && filenameSpan) {
                    // Handle file selection
                    fileInput.addEventListener('change', (e) => {
                        if (e.target.files.length > 0) {
                            const fileName = e.target.files[0].name;
                            filenameSpan.textContent = fileName;
                            filenameSpan.classList.add('has-file');
                        } else {
                            filenameSpan.textContent = 'No file selected';
                            filenameSpan.classList.remove('has-file');
                        }
                    });
                }

                // Set default URL value if configured
                if (urlInput && fieldConfig.defaultValue) {
                    urlInput.placeholder = `e.g., ${fieldConfig.defaultValue}`;
                }
            }
        });
    }

    getFlatpickrConfig(overrides = {}) {
        const defaultConfig = {
            dateFormat: "Y-m-d",
            allowInput: false,
            theme: this.theme === 'dark' ? "dark" : "light",
            position: "auto",
            defaultMode: "single"
        };

        // Use the flatpickr config from constructor
        const userConfig = this.flatpickrConfig || {};

        return {
            ...defaultConfig,
            ...userConfig,
            ...overrides
        };
    }

    setDatePickerMode(mode, fieldId = 'task-due-date') {
        if (typeof flatpickr === 'undefined') return;

        // Find the date input field
        const dateInput = document.getElementById(fieldId);
        if (!dateInput) {
            console.warn(`Date field with id '${fieldId}' not found`);
            return;
        }

        // Update button states in the associated toggle container
        const toggleContainer = dateInput.closest('.form-group')?.querySelector('.date-type-toggle');
        if (toggleContainer) {
            const buttons = toggleContainer.querySelectorAll('.date-toggle-btn');
            buttons.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
            });
        }

        // Destroy existing picker if it exists
        if (this.taskDatePicker) {
            this.taskDatePicker.destroy();
        }

        const config = this.getFlatpickrConfig({
            mode: mode,
            onChange: (selectedDates, dateStr, instance) => {
                this.handleTaskDateChange(selectedDates, dateStr, instance, fieldId);
            }
        });

        this.taskDatePicker = flatpickr(`#${fieldId}`, config);
        this.taskDateMode = mode;

        // Clear the current value when switching modes
        if (dateInput) dateInput.value = '';
    }

    handleTaskDateChange(selectedDates, dateStr, instance, fieldId = 'task-due-date') {
        const taskDate = document.getElementById(fieldId);
        if (!taskDate) return;

        if (this.taskDateMode === 'range' && selectedDates.length === 2) {
            const startDate = selectedDates[0].toISOString().split('T')[0];
            const endDate = selectedDates[1].toISOString().split('T')[0];
            taskDate.value = `${startDate} to ${endDate}`;
        } else if (this.taskDateMode === 'single' && selectedDates.length === 1) {
            taskDate.value = selectedDates[0].toISOString().split('T')[0];
        } else {
            taskDate.value = dateStr;
        }
    }

    // Inline editing functionality
    startEditingText(element) {
        // Prevent multiple edits at once
        if (document.querySelector('.editing-text')) {
            return;
        }

        const taskId = element.dataset.taskId;
        const field = element.dataset.field;
        const currentText = this.getOriginalText(element);

        // Create text input
        const input = document.createElement(field === 'notes' || field === 'description' ? 'textarea' : 'input');
        if (field !== 'notes' && field !== 'description') {
            input.type = 'text';
        }
        input.value = currentText;
        input.className = 'editing-text';
        input.dataset.taskId = taskId;
        input.dataset.field = field;
        input.dataset.originalText = currentText;

        if (field === 'notes' || field === 'description') {
            input.rows = 3;
            input.style.resize = 'vertical';
        }

        // Style the input
        Object.assign(input.style, {
            background: 'var(--color-bg)',
            border: '1px solid var(--color-pink)',
            borderRadius: '4px',
            padding: '8px',
            color: 'var(--color-text)',
            fontSize: field === 'what' || field === 'text' ? '18px' : '14px',
            fontWeight: field === 'what' || field === 'text' ? 'bold' : 'normal',
            width: '100%',
            fontFamily: 'inherit'
        });

        // Replace the element with input
        element.style.display = 'none';
        element.parentNode.insertBefore(input, element.nextSibling);

        // Focus and select all text
        input.focus();
        input.select();

        // Handle save/cancel
        input.addEventListener('blur', () => this.finishEditingText(input));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (field === 'notes' || field === 'description') {
                    // For textarea fields, only submit on Shift+Enter
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.finishEditingText(input);
                    }
                    // Allow normal Enter to create new lines
                } else {
                    // For other fields, Enter submits (original behavior)
                    if (!e.shiftKey) {
                        e.preventDefault();
                        this.finishEditingText(input);
                    }
                }
            } else if (e.key === 'Escape') {
                this.cancelEditingText(input);
            }
        });
    }

    getOriginalText(element) {
        const field = element.dataset.field;
        const taskId = element.dataset.taskId;
        const task = this.tasks.find(t => t.id === taskId);

        if (!task) return '';
        return task[field] || '';
    }

    async finishEditingText(input) {
        const taskId = input.dataset.taskId;
        const field = input.dataset.field;
        const newValue = input.value.trim();
        const originalText = input.dataset.originalText;

        // Get the original element
        const originalElement = input.previousElementSibling;

        if (newValue !== originalText) {
            // OPTIMISTIC UPDATE: Update the UI immediately
            this.updateElementDisplay(originalElement, newValue, field);

            // Also update the local task data immediately
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task[field] = newValue;
            }

            // Clean up the input first so user sees the change immediately
            this.cleanupTextEdit(input, originalElement);

            // Then send the server request in the background
            try {
                await this.updateTask(taskId, { [field]: newValue });
                console.log(`Successfully updated ${field} to "${newValue}" for task ${taskId}`);
            } catch (error) {
                console.error('Error updating text:', error);
                // If server update fails, revert the UI change
                this.updateElementDisplay(originalElement, originalText, field);

                // Also revert the local task data
                if (task) {
                    task[field] = originalText;
                }

                this.showError?.(`Failed to update ${field}: ${error.message}`);
            }
        } else {
            // No change, just clean up
            this.cleanupTextEdit(input, originalElement);
        }
    }

    cancelEditingText(input) {
        const originalElement = input.previousElementSibling;
        this.cleanupTextEdit(input, originalElement);
    }

    cleanupTextEdit(input, originalElement) {
        originalElement.style.display = '';
        input.remove();
    }

    startEditingDropdown(element) {
        // Prevent multiple edits at once
        if (document.querySelector('.editing-dropdown')) {
            return;
        }

        const taskId = element.dataset.taskId;
        const field = element.dataset.field;
        const currentValue = this.getOriginalDropdownValue(element);

        // Add a unique ID to the element for better tracking
        const elementId = `edit-${taskId}-${field}-${Date.now()}`;
        element.dataset.elementId = elementId;

        // Create dropdown select
        const select = document.createElement('select');
        select.className = 'editing-dropdown';
        select.dataset.taskId = taskId;
        select.dataset.field = field;
        select.dataset.originalValue = currentValue;
        select.dataset.originalElementId = elementId;

        // Style the select
        const baseStyle = {
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '2px solid var(--color-accent)',
            borderRadius: '4px',
            padding: '8px',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            minWidth: '150px'
        };

        Object.assign(select.style, baseStyle);

        // Populate dropdown with available options from field config
        this.populateEditingDropdown(select, field, currentValue);

        // Replace the element with select
        element.style.display = 'none';
        element.parentNode.insertBefore(select, element.nextSibling);

        // Focus the select
        select.focus();

        // Handle save/cancel with proper event management
        let isFinishing = false;

        const finishEdit = () => {
            if (!isFinishing) {
                isFinishing = true;
                this.finishEditingDropdown(select);
            }
        };

        const cancelEdit = () => {
            if (!isFinishing) {
                isFinishing = true;
                this.cancelEditingDropdown(select);
            }
        };

        select.addEventListener('blur', finishEdit);
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        select.addEventListener('change', finishEdit);
    }

    getOriginalDropdownValue(element) {
        const field = element.dataset.field;
        const taskId = element.dataset.taskId;
        const task = this.tasks.find(t => t.id === taskId);

        if (!task) return '';
        return task[field] || '';
    }

    populateEditingDropdown(select, field, currentValue) {
        const fieldConfig = this.getFieldConfig(field);
        let values = [];

        // Get unique values from existing tasks for this field
        if (field) {
            values = [...new Set(
                this.tasks
                    .map(task => task[field])
                    .filter(value => value && value.trim() !== '')
                    .map(value => value.trim())
            )].sort();
        }

        // Clear and rebuild options
        select.innerHTML = '';

        // Always add blank option first
        const blankOption = document.createElement('option');
        blankOption.value = '';
        blankOption.textContent = '(none)';
        select.appendChild(blankOption);

        // Add current value if it exists and isn't in the values list
        if (currentValue && currentValue !== '' && !values.includes(currentValue)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentValue;
            currentOption.textContent = currentValue;
            currentOption.selected = true;
            select.appendChild(currentOption);
        }

        // Add all other values
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            option.selected = value === currentValue;
            select.appendChild(option);
        });

        // Add "Other" option if field config allows it
        if (fieldConfig.options?.preserveOtherOption) {
            const otherOption = document.createElement('option');
            otherOption.value = 'Other';
            otherOption.textContent = 'Other...';
            select.appendChild(otherOption);
        }
    }

    async finishEditingDropdown(select) {
        // Prevent duplicate processing
        if (select.dataset.processing === 'true') {
            return;
        }
        select.dataset.processing = 'true';

        const taskId = select.dataset.taskId;
        const field = select.dataset.field;
        const newValue = select.value;
        const originalValue = select.dataset.originalValue;

        // Find the original element more robustly
        const originalElement = select.dataset.originalElementId ?
            document.querySelector(`[data-element-id="${select.dataset.originalElementId}"]`) :
            select.previousSibling;

        // Safely remove the select only if it's still in the DOM
        if (select.parentNode) {
            select.parentNode.removeChild(select);
        }

        // Show the original element
        if (originalElement) {
            originalElement.style.display = '';
        }

        // Only update if value changed
        if (newValue !== originalValue) {
            if (newValue === 'Other') {
                // Handle "Other" option - prompt for custom value
                const customValue = prompt(`Enter custom value for ${field}:`);
                if (customValue && customValue.trim()) {
                    await this.updateTaskField(taskId, field, customValue.trim(), originalElement);
                } else {
                    // User cancelled or entered empty value, revert
                    this.updateElementDisplay(originalElement, originalValue, field);
                }
            } else {
                // Update with selected value
                await this.updateTaskField(taskId, field, newValue, originalElement);
            }
        }
    }

    cancelEditingDropdown(select) {
        // Prevent duplicate processing
        if (select.dataset.processing === 'true') {
            return;
        }
        select.dataset.processing = 'true';

        // Find the original element more robustly
        const originalElement = select.dataset.originalElementId ?
            document.querySelector(`[data-element-id="${select.dataset.originalElementId}"]`) :
            select.previousSibling;

        // Safely remove the select only if it's still in the DOM
        if (select.parentNode) {
            select.parentNode.removeChild(select);
        }

        // Show the original element
        if (originalElement) {
            originalElement.style.display = '';
        }
    }

    async updateTaskField(taskId, field, newValue, originalElement) {
        // OPTIMISTIC UPDATE: Update the UI immediately
        this.updateElementDisplay(originalElement, newValue, field);

        // Also update the local task data immediately
        const task = this.tasks.find(t => t.id === taskId);
        const originalValue = task ? task[field] : '';
        if (task) {
            task[field] = newValue;
        }

        // Then send the server request in the background
        try {
            await this.updateTask(taskId, { [field]: newValue });
            console.log(`Successfully updated ${field} to "${newValue}" for task ${taskId}`);
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
            // If server update fails, revert the UI change
            this.updateElementDisplay(originalElement, originalValue, field);

            // Also revert the local task data
            if (task) {
                task[field] = originalValue;
            }

            this.showError?.(`Failed to update ${field}: ${error.message}`);
        }
    }

    updateElementDisplay(element, value, field) {
        const fieldConfig = this.getFieldConfig(field);
        
        if (!element) return;

        if (value && value.trim() !== '') {
            // Has value - show it with edit icon
            const displayValue = fieldConfig.toText ? fieldConfig.toText(value) : value;
            const icon = fieldConfig.icon ? `${fieldConfig.icon} ` : '';
            element.innerHTML = `${icon}${this.escapeHtml(displayValue)}<span class="edit-icon">✏️</span>`;
            element.classList.remove('empty-field');
        } else {
            // Empty value - show placeholder
            const label = fieldConfig.label || field;
            element.innerHTML = `Click to set ${label.toLowerCase()}...<span class="edit-icon">✏️</span>`;
            element.classList.add('empty-field');
        }
    }

    // Date editing functionality
    startEditingDate(element) {
        // Prevent multiple edits at once
        if (document.querySelector('.editing-date')) {
            return;
        }

        const taskId = element.dataset.taskId;
        const field = element.dataset.field;
        const currentDate = this.getOriginalText(element);

        // Create date input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentDate;
        input.className = 'editing-date';
        input.dataset.taskId = taskId;
        input.dataset.field = field;
        input.dataset.originalText = currentDate;
        input.placeholder = 'Click to select date...';

        // Style the input
        Object.assign(input.style, {
            background: 'var(--color-bg)',
            border: '1px solid var(--color-pink)',
            borderRadius: '4px',
            padding: '8px',
            color: 'var(--color-text)',
            fontSize: '14px',
            width: '100%',
            fontFamily: 'inherit'
        });

        // Replace the element with input
        element.style.display = 'none';
        element.parentNode.insertBefore(input, element.nextSibling);

        // Initialize Flatpickr on the input
        const datePicker = flatpickr(input, this.getFlatpickrConfig({
            onChange: (selectedDates, dateStr, instance) => {
                input.value = dateStr;
            },
            onClose: () => {
                this.finishEditingDate(input, datePicker);
            }
        }));

        // Open the date picker immediately
        datePicker.open();

        // Handle escape key to cancel
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cancelEditingDate(input, datePicker);
            }
        });
    }

    async finishEditingDate(input, datePicker) {
        const taskId = input.dataset.taskId;
        const field = input.dataset.field;
        const newValue = input.value.trim();
        const originalText = input.dataset.originalText;

        // Get the original element
        const originalElement = input.previousElementSibling;

        if (newValue !== originalText) {
            // OPTIMISTIC UPDATE: Update the UI immediately
            this.updateElementDisplay(originalElement, newValue, field);

            // Also update the local task data immediately
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task[field] = newValue;
            }

            // Clean up the input first so user sees the change immediately
            this.cleanupDateEdit(input, originalElement, datePicker);

            // Then send the server request in the background
            try {
                await this.updateTask(taskId, { [field]: newValue });
                console.log(`Successfully updated ${field} to "${newValue}" for task ${taskId}`);
            } catch (error) {
                console.error('Error updating date:', error);
                // If server update fails, revert the UI change
                this.updateElementDisplay(originalElement, originalText, field);

                // Also revert the local task data
                if (task) {
                    task[field] = originalText;
                }

                this.showError?.(`Failed to update date: ${error.message}`);
            }
        } else {
            // No change, just clean up
            this.cleanupDateEdit(input, originalElement, datePicker);
        }
    }

    cancelEditingDate(input, datePicker) {
        const originalElement = input.previousElementSibling;
        this.cleanupDateEdit(input, originalElement, datePicker);
    }

    cleanupDateEdit(input, originalElement, datePicker) {
        if (datePicker) {
            datePicker.destroy();
        }
        originalElement.style.display = '';
        input.remove();
    }

    async clearDateField(taskId) {
        try {
            // Find the task
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) {
                console.error('Task not found:', taskId);
                return;
            }

            console.log(`Clearing date for task ${taskId}, current value: "${task.date}"`);

            // Store original value for potential rollback
            const originalDate = task.date;

            // OPTIMISTIC UPDATE: Update the UI immediately
            task.date = '';  // Set to empty string

            // Force re-render to show the change immediately
            this.renderTasks();

            // Send the server request - if this fails, the optimistic update will be reverted
            await this.updateTask(taskId, { date: '' });
            console.log(`Successfully cleared date for task ${taskId}`);

        } catch (error) {
            console.error('Error clearing date:', error);
            this.showError?.(`Failed to clear date: ${error.message}`);

            // The updateTask method should handle reloading from server on error
            // which will revert our optimistic update
        }
    }

    // Placeholder update method - should be implemented based on your data source
    async updateTask(taskId, updates) {
        // This should be implemented to update your data source
        // For now, just log the update
        console.log(`Update task ${taskId}:`, updates);
        
        // If you have a method to update tasks in your data source, call it here
        // For example: await this.updateTaskInSheet(taskId, updates);
        
        return Promise.resolve();
    }

    /**
     * Upload audio file to Google Drive via Apps Script
     * @param {File} file - The file to upload
     * @param {string} driveFolder - Google Drive folder URL (optional)
     * @returns {Promise<string>} - Promise resolving to the shareable Google Drive link
     */
    async uploadAudioFileToGoogleDrive(file, driveFolder = null) {
        if (!this.appsScriptUrl) {
            throw new Error('Google Apps Script URL not configured');
        }

        // Validate file
        if (!file) {
            throw new Error('No file provided');
        }

        // Check file size (limit to 10MB for Google Apps Script)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error('File size exceeds 10MB limit. Please choose a smaller file.');
        }

        // Check file type
        if (!file.type.startsWith('audio/')) {
            throw new Error('Please select an audio file');
        }

        try {
            // Convert file to base64
            const base64Data = await this.fileToBase64(file);
            
            // Prepare upload data
            const uploadData = {
                action: 'uploadFile',
                fileName: file.name,
                fileData: base64Data,
                mimeType: file.type,
                driveFolder: driveFolder || this.config?.data?.audioFile?.options?.driveFolder,
                timestamp: Date.now()
            };

            // Send to Apps Script
            const response = await fetch(this.appsScriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(uploadData)
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            // Return the shareable link
            return result.fileUrl;

        } catch (error) {
            console.error('Google Drive upload error:', error);
            throw error;
        }
    }

    /**
     * Convert file to base64 string
     * @param {File} file - The file to convert
     * @returns {Promise<string>} - Promise resolving to base64 string
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data URL prefix (e.g., "data:audio/mpeg;base64,")
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}

// Handle sync status visibility based on first todo item scroll position
function handleSyncStatusVisibility() {
    const syncStatus = document.querySelector('.sync-status');

    if (!syncStatus) return;

    function updateSyncStatusVisibility() {
        const firstTodoItem = document.querySelector('.todo-item');

        if (!firstTodoItem) {
            // No todo items yet, hide sync status
            syncStatus.classList.remove('visible');
            return;
        }

        const firstItemRect = firstTodoItem.getBoundingClientRect();
        const scrollY = window.scrollY;

        // Show sync status when first todo item is scrolled into view or we've scrolled past it
        if (firstItemRect.top <= window.innerHeight || scrollY > 100) {
            syncStatus.classList.add('visible');
        } else {
            syncStatus.classList.remove('visible');
        }
    }

    // Update on scroll and resize
    window.addEventListener('scroll', updateSyncStatusVisibility);
    window.addEventListener('resize', updateSyncStatusVisibility);

    // Also update when tasks are loaded/refreshed
    const observer = new MutationObserver(() => {
        setTimeout(updateSyncStatusVisibility, 100); // Small delay to ensure rendering
    });

    const todoList = document.querySelector('#todo-list');
    if (todoList) {
        observer.observe(todoList, { childList: true, subtree: true });
    }

    // Initial check
    setTimeout(updateSyncStatusVisibility, 500); // Delay to ensure initial load
}

// Initialize the system when DOM is ready
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.sheetsChecklist = new GoogleSheetsChecklist();
            handleSyncStatusVisibility();
        });
    } else {
        window.sheetsChecklist = new GoogleSheetsChecklist();
        handleSyncStatusVisibility();
    }
}
