// Simple Node.js test to validate the JavaScript files
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing JavaScript files...\n');

// Test 1: Check if config.js is valid JavaScript
try {
    const configPath = path.join(__dirname, 'src', 'config.js');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Create a simple evaluation context
    const vm = require('vm');
    const context = {
        console: console,
        document: {
            createElement: () => ({ onload: null, onerror: null, src: '' }),
            head: { appendChild: () => {} },
            readyState: 'complete',
            addEventListener: () => {}
        },
        window: {
            dispatchEvent: () => {}
        }
    };
    
    vm.createContext(context);
    vm.runInContext(configContent, context);
    
    if (context.TODO_CONFIG) {
        console.log('✅ config.js: TODO_CONFIG loaded successfully');
        console.log(`   - Project: ${context.TODO_CONFIG.projectName}`);
        console.log(`   - GoogleSheets enabled: ${context.TODO_CONFIG.googleSheets?.enabled}`);
        console.log(`   - GoogleSheets object exists: ${!!context.TODO_CONFIG.googleSheets}`);
        
        if (!context.TODO_CONFIG.googleSheets) {
            console.log('❌ config.js: googleSheets object is missing!');
        } else {
            console.log('   - SpreadsheetId: ' + (context.TODO_CONFIG.googleSheets.spreadsheetId || 'not configured'));
        }
    } else {
        console.log('❌ config.js: TODO_CONFIG not found after execution');
    }
    
} catch (error) {
    console.log('❌ config.js: Error loading -', error.message);
}

// Test 2: Check if app.js is valid JavaScript
try {
    const appPath = path.join(__dirname, 'src', 'app.js');
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    // Just check syntax, don't execute (too complex)
    const vm = require('vm');
    new vm.Script(appContent);
    console.log('✅ app.js: Syntax is valid');
    
    // Check for key components
    if (appContent.includes('class GoogleSheetsChecklist')) {
        console.log('✅ app.js: GoogleSheetsChecklist class found');
    } else {
        console.log('❌ app.js: GoogleSheetsChecklist class not found');
    }
    
} catch (error) {
    console.log('❌ app.js: Syntax error -', error.message);
}

console.log('\n📁 Checking file structure...');

const requiredFiles = [
    'src/index.html',
    'src/config.js', 
    'src/app.js',
    'src/debug.js',
    'src/styles/styles.css',
    'src/styles/default-theme.css'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log(`✅ ${file} (${stats.size} bytes)`);
    } else {
        console.log(`❌ ${file} - MISSING`);
    }
});

console.log('\n🔍 Done!');