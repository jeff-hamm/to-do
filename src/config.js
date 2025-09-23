// Universal Todo System Configuration
// Customize this file to match your project needs

const TODO_CONFIG = {
    // Project identification
    projectName: "Your Project",
    projectId: "your-project-id",
    
    // Google Sheets Integration (optional)
    // Set enabled: false to disable Google Sheets and use local storage only
    // IMPORTANT: Copy config.example.js to config.local.js and fill in your real values
    googleSheets: {
        enabled: false, // Set to true to enable Google Sheets integration (override in config.local.js)
        spreadsheetId: 'YOUR_GOOGLE_SHEETS_ID_HERE', // Your Google Sheets ID (override in config.local.js)
        gid: 'YOUR_SHEET_GID_HERE', // The specific sheet tab ID (override in config.local.js)
        csvUrl: null, // Auto-constructed as: https://docs.google.com/spreadsheets/d/{spreadsheetId}/gviz/tq?tqx=out:csv&gid={gid}&headers=1
        appScriptUrl: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE' // Google Apps Script web app URL (override in config.local.js)
    },
    
    // Data source configuration
    dataSource: {
        // If Google Sheets is disabled, uses localStorage with this key
        localStorageKey: "todoApp_tasks",
        
        // Auto-sync interval (milliseconds) - set to 0 to disable auto-sync
        syncInterval: 30000, // 30 seconds
        
        // Offline support
        enableOfflineMode: true
    },
    filters: {
        all: {
            title: "All Tasks",
            apply: (t) => true,
        },
        incomplete: {
            title: "Incomplete",
            apply: (t) => !t.completed,
        },
        completed: {
            title: "Completed",
            apply: (t) => t.completed,
        },
        timeline: {
            field: 'timeline',
            title: function(t) {
                if (!t.timeline) return 'Other';
                if (/^\d+\s+days?\s+before/i.test(t.timeline.trim())) {
                    return 'Before Event';
                }
                return t.timeline;
            },
        },
    },
    groups: [ {
        field: 'timeline',
        title: function(t) {
            if (!t.timeline) return 'Other';
            if (/^\d+\s+days?\s+before/i.test(t.timeline.trim())) {
                return 'Before Event';
            }
            return t.timeline;
        },
    }],
    sort: [ 
            {
                field: 'completed',
                direction: 'asc'  // Show incomplete tasks first
            },
            {
                field: 'priority',
                direction: 'asc'  // This will show critical first since array is ['critical', 'high', 'medium', 'low', '']
            }
    ],
    // Data field configuration - defines form fields and their behavior
    // Note: dynamic defaults to false - only specify dynamic: true for fields that should be populated from existing task data
    data: {
        completed: {
            type: 'checkbox',
            primary: true
        },
        timeline: {
            dynamic: true,
            type: 'select',
            icon: '📅',
            location: "detail",
            options: {
                preserveOtherOption: false   // Override default for timeline
            },
            sort: function(a, b) {
                if (a.toLowerCase() === 'asap') return -1;
                if (b.toLowerCase() === 'asap') return 1;
                if (a === 'Before Event') return -1;
                if (b === 'Before Event') return 1;

                const aStartsWithNumber = /^\d/.test(a);
                const bStartsWithNumber = /^\d/.test(b);

                if (aStartsWithNumber && bStartsWithNumber) {
                    const aNum = parseInt(a.match(/^\d+/)[0]);
                    const bNum = parseInt(b.match(/^\d+/)[0]);
                    return bNum - aNum;
                }

                if (aStartsWithNumber && !bStartsWithNumber) return -1;
                if (!aStartsWithNumber && bStartsWithNumber) return 1;

                return a.localeCompare(b);
            }
        },
        category: {
            dynamic: true,
            type: 'select',
            location: "detail",
            icon: '📂'
        },
        how: {
            location: "top-right",
            type: 'select',
            icon: '🔧'
        },
        whoCanHelp: {
            dynamic: true,
            type: 'select',
            location: "detail",
            icon: '🤝'
        },
        priority: {
            type: 'select',
            toValue: function(v) {
                return v.replace(/^[\d\s\-]+/, '').toLowerCase();
            },
            toIcon: function(v) {
                const cleanPriority = v.replace(/^[\d\s\-]+/, '').toLowerCase();
                const priorityIcon = cleanPriority ? {
                    'critical': '❗',
                    'high': '🔥',
                    'medium': '📌',
                    'low': '📝'
                }[cleanPriority] || '⚪' : '⚪';
                return priorityIcon;
            },
            toText: function(v) {
                const cleanPriority = v.replace(/^[\d\s\-]+/, '').toLowerCase();
                return cleanPriority.charAt(0).toUpperCase() + cleanPriority.slice(1);
            },
            
                // Priority indicator
            sort: [ 'critical', 'high', 'medium', 'low', '' ],
            options: {
                preserveEmptyOption: false,
                preserveOtherOption: false
            }
        },
        title: {
            type: 'text',
            required: true,
            dataName: 'text'  // Maps form field 'title' to task data field 'text'
        },
        notes: {
            type: 'textarea',
            location: "detail",
            icon: '📝',  // Maps form field 'description' to task data field 'notes'
        },
        dueDate: {
            type: 'date',
            dataName: 'date',  // Maps form field 'dueDate' to task data field 'date'
            location: "detail",
            icon: '📅',
            options: {
                // mode: 'single'  // Use 'single' for only single date, 'range' for only range, or omit for both options
            }
        },
        audioFile: {
            type: 'audio',
            location: "detail",
            icon: '🎵',
            defaultValue: 'YOUR_GOOGLE_DRIVE_FOLDER_URL_HERE',
            options: {
                driveFolder: 'YOUR_GOOGLE_DRIVE_FOLDER_URL_HERE',
                accept: 'audio/*'  // File input accept attribute for audio files
            }
        }
    },
    
    // UI Configuration
    ui: {
        // Default view settings
        defaultFilter: "all", // "all", "active", "completed", "high-priority", etc.
        showProgressBar: true,
        showSyncStatus: true,
        
        // Theme customization (you can override these in CSS)
        theme: {
            // These are applied as CSS custom properties
            colorPrimary: "#ff69b4",
            colorBackground: "#0d1117",
            colorText: "#f0f6fc"
        },
        
        // Form settings
        form: {
            enableDatePicker: true,
            enableDateRanges: true,
            defaultPriority: "medium",
            categories: [
                { value: "work", label: "Work" },
                { value: "personal", label: "Personal" },
                { value: "shopping", label: "Shopping" },
                { value: "health", label: "Health" },
                { value: "finance", label: "Finance" },
                { value: "home", label: "Home" },
                { value: "other", label: "Other" }
            ],
            priorities: [
                { value: "low", label: "Low", icon: "🟢" },
                { value: "medium", label: "Medium", icon: "🟡" },
                { value: "high", label: "High", icon: "🟠" },
                { value: "urgent", label: "Urgent", icon: "🔴" }
            ],
            timelines: [
                { value: "", label: "No Timeline" },
                { value: "today", label: "Today" },
                { value: "tomorrow", label: "Tomorrow" },
                { value: "this-week", label: "This Week" },
                { value: "next-week", label: "Next Week" },
                { value: "this-month", label: "This Month" },
                { value: "custom", label: "Custom Date" }
            ]
        },
        
        // Flatpickr date picker configuration
        flatpickr: {
            // Default date format
            dateFormat: "m-d-Y",

            // Theme to use (dark matches the site theme)
            theme: "dark",

            // Whether to allow manual input
            allowInput: false,

            // Positioning strategy
            position: "auto",

            // Default mode (single or range)
            defaultMode: "single"
        }
    },
    
    // Features configuration
    features: {
        // Enable/disable specific features
        allowTaskCreation: true,
        allowTaskEditing: true,
        allowTaskDeletion: false, // Set to true to enable delete functionality
        
        // Task field configuration
        fields: {
            title: { required: true, display: true },
            description: { required: false, display: true },
            category: { required: false, display: true },
            priority: { required: false, display: true },
            timeline: { required: false, display: true },
            assignedTo: { required: false, display: true },
            dueDate: { required: false, display: true },
            status: { required: false, display: true } // completed/active
        },
        
        // Filtering options
        filters: [
            { id: "all", label: "All Tasks", icon: "📋" },
            { id: "active", label: "Active", icon: "⚡" },
            { id: "completed", label: "Completed", icon: "✅" },
            { id: "high-priority", label: "High Priority", icon: "🔥" },
            { id: "today", label: "Due Today", icon: "📅" },
            { id: "overdue", label: "Overdue", icon: "⏰" }
        ],
        
        // Sorting options
        sorting: {
            defaultSort: "priority_desc", // priority_desc, date_asc, title_asc, etc.
            options: [
                { id: "priority_desc", label: "Priority (High to Low)" },
                { id: "priority_asc", label: "Priority (Low to High)" },
                { id: "date_asc", label: "Due Date (Soon to Later)" },
                { id: "date_desc", label: "Due Date (Later to Soon)" },
                { id: "title_asc", label: "Title (A to Z)" },
                { id: "title_desc", label: "Title (Z to A)" }
            ]
        }
    },
    
    // Development and debugging
    debug: {
        enabled: false, // Set to true for console logging
        verboseLogging: false,
        showDataInConsole: false
    },
    
    // Custom callbacks (optional)
    callbacks: {
        onTaskAdded: null, // function(task) { ... }
        onTaskCompleted: null, // function(task) { ... }
        onTaskUpdated: null, // function(task) { ... }
        onDataLoaded: null, // function(tasks) { ... }
        onSyncComplete: null, // function(success, data) { ... }
        onError: null // function(error) { ... }
    },
    
    // Sample data shown when no real data is available
    sampleData: [
        {
            id: 'sample-1',
            text: '🚀 Set up Google Sheets integration',
            completed: false,
            timeline: 'Setup',
            priority: 'high',
            category: 'Configuration',
            how: 'Follow setup guide',
            notes: 'Configure your Google Sheet ID and Apps Script URL',
            assignedTo: 'Developer',
            date: '',
            source: 'sample',
            rowIndex: 2
        },
        {
            id: 'sample-2',
            text: '📝 Create your first real task',
            completed: false,
            timeline: 'Getting Started',
            priority: 'medium',
            category: 'Setup',
            how: 'Use the add task form',
            notes: 'Click the + button to add a new task',
            assignedTo: '',
            date: new Date().toISOString().split('T')[0],
            source: 'sample',
            rowIndex: 3
        },
        {
            id: 'sample-3',
            text: '🎨 Customize the styling',
            completed: false,
            timeline: 'Customization',
            priority: 'low',
            category: 'Design',
            how: 'Edit CSS variables',
            notes: 'Modify colors, fonts, and layout in styles.css',
            assignedTo: 'Designer',
            date: '',
            source: 'sample',
            rowIndex: 4
        },
        {
            id: 'sample-4',
            text: '✅ Test the system',
            completed: true,
            timeline: 'Testing',
            priority: 'medium',
            category: 'QA',
            how: 'Try all features',
            notes: 'Create, edit, complete, and filter tasks',
            assignedTo: 'Tester',
            date: '',
            source: 'sample',
            rowIndex: 5
        }
    ]
};

// Example of how to customize for different projects:

// For a work project:
/*
const TODO_CONFIG = {
    projectName: "Work Tasks",
    projectId: "work-todos",
    googleSheets: {
        enabled: true,
        spreadsheetId: "your-work-spreadsheet-id",
        csvUrl: "https://docs.google.com/spreadsheets/d/YOUR_ID/export?format=csv&gid=0",
        appScriptUrl: "https://script.google.com/macros/s/YOUR_SCRIPT/exec"
    },
    ui: {
        theme: {
            colorPrimary: "#0066cc", // Blue theme for work
            colorBackground: "#ffffff",
            colorText: "#333333"
        }
    }
};
*/

// For a personal project (local storage only):
/*
const TODO_CONFIG = {
    projectName: "Personal Tasks",
    projectId: "personal-todos",
    googleSheets: { enabled: false },
    ui: {
        theme: {
            colorPrimary: "#28a745", // Green theme
            colorBackground: "#f8f9fa",
            colorText: "#212529"
        }
    }
};
*/

// Attempt to load local configuration overrides
// This allows keeping sensitive data in config.local.js (which is git-ignored)
try {
    // Try to dynamically import config.local.js if it exists
    const script = document.createElement('script');
    script.src = './config.local.js';
    script.onload = function() {
        if (typeof LOCAL_CONFIG_OVERRIDES !== 'undefined') {
            // Deep merge the local config overrides
            function deepMerge(target, source) {
                for (const key in source) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key]) target[key] = {};
                        deepMerge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
            
            deepMerge(TODO_CONFIG, LOCAL_CONFIG_OVERRIDES);
            console.log('✅ Local configuration loaded successfully');
            
            // Trigger a custom event to notify that config is ready
            window.dispatchEvent(new CustomEvent('configReady'));
        }
    };
    script.onerror = function() {
        console.log('ℹ️  No local configuration found. Using default values.');
        console.log('💡 Copy config.example.js to config.local.js to add your Google Sheets credentials');
        // Trigger the ready event even without local config
        window.dispatchEvent(new CustomEvent('configReady'));
    };
    document.head.appendChild(script);
} catch (error) {
    console.log('ℹ️  Local configuration not available:', error.message);
    // Trigger the ready event even if loading fails
    window.dispatchEvent(new CustomEvent('configReady'));
}