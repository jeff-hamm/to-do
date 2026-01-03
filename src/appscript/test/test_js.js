// Simple Node.js test to validate the JavaScript files
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const webDir = path.join(repoRoot, 'src', 'web');
const appscriptDir = path.join(repoRoot, 'src', 'appscript');

console.log('🧪 Testing JavaScript files...\n');

// Test 1: Check if config.js is valid JavaScript
try {
    const configPath = path.join(webDir, 'config.js');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Create a simple evaluation context
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
    const appPath = path.join(webDir, 'app.js');
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    // Just check syntax, don't execute (too complex)
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

// Test 3: Check universal-sheet-api.js syntax and helpers
try {
    const apiPath = path.join(webDir, 'universal-sheet-api.js');
    const apiContent = fs.readFileSync(apiPath, 'utf8');
    new vm.Script(apiContent);
    console.log('✅ universal-sheet-api.js: Syntax is valid');

    try {
        const UniversalSheetAPI = require(apiPath);
        const key = UniversalSheetAPI.toKey('Done?');
        if (key === 'done') {
            console.log('✅ universal-sheet-api.js: toKey("Done?") -> done');
        } else {
            console.log(`❌ universal-sheet-api.js: toKey("Done?") returned ${key}`);
        }

        const todoSchema = UniversalSheetAPI.createSchema?.todo;
        if (todoSchema && todoSchema['done?']?.key === 'done') {
            console.log('✅ universal-sheet-api.js: todo schema maps done? -> done');
        } else {
            console.log('❌ universal-sheet-api.js: todo schema missing or incorrect');
        }
    } catch (moduleError) {
        console.log('❌ universal-sheet-api.js: Module load failed -', moduleError.message);
    }
} catch (error) {
    console.log('❌ universal-sheet-api.js: Syntax error -', error.message);
}

// Test 4: Check universal-apps-script.js syntax
try {
    const serverPath = path.join(appscriptDir, 'universal-apps-script.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    new vm.Script(serverContent);
    console.log('✅ universal-apps-script.js: Syntax is valid');

    const requiredKeywords = ['getData', 'addRow', 'updateRow', 'deleteRow'];
    requiredKeywords.forEach(keyword => {
        if (serverContent.includes(keyword)) {
            console.log(`✅ universal-apps-script.js: Found ${keyword}() definition`);
        } else {
            console.log(`❌ universal-apps-script.js: Missing ${keyword}() definition`);
        }
    });

    // Run pure helper self-tests inside a sandbox to avoid real GAS APIs
    const sandbox = {
        console,
        ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'json', JAVASCRIPT: 'javascript' } },
        SpreadsheetApp: {},
        DriveApp: { Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' } },
        Utilities: { base64Decode: () => '', newBlob: () => ({ setName: () => ({}) }) }
    };
    vm.createContext(sandbox);
    vm.runInContext(serverContent, sandbox);

    if (typeof sandbox.selfTest === 'function') {
        const selfTestResult = sandbox.selfTest();
        const passedCount = selfTestResult.results?.filter(r => r.passed).length || 0;
        console.log(`✅ universal-apps-script.js: selfTest ran (${passedCount}/${selfTestResult.results?.length || 0} passed)`);
        selfTestResult.results?.forEach(r => {
            const icon = r.passed ? '✅' : '❌';
            console.log(`   ${icon} ${r.name}${r.detail ? ' - ' + r.detail : ''}`);
        });
    } else {
        console.log('❌ universal-apps-script.js: selfTest() not found');
    }

    if (typeof sandbox.integrationTest === 'function') {
        try {
            if (typeof sandbox.SpreadsheetApp?.create !== 'function') {
                console.log('⚠️  universal-apps-script.js: integrationTest skipped (SpreadsheetApp.create not available in Node sandbox)');
            } else {
                const integration = sandbox.integrationTest();
                const passed = integration.results?.filter(r => r.passed).length || 0;
                console.log(`✅ universal-apps-script.js: integrationTest ran (${passed}/${integration.results?.length || 0} passed)`);
                integration.results?.forEach(r => {
                    const icon = r.passed ? '✅' : '❌';
                    console.log(`   ${icon} ${r.name}${r.detail ? ' - ' + r.detail : ''}`);
                });
            }
        } catch (e) {
            console.log('❌ universal-apps-script.js: integrationTest error -', e.message);
        }
    } else {
        console.log('❌ universal-apps-script.js: integrationTest() not found');
    }

    if (typeof sandbox.runAllTests === 'function') {
        try {
            if (typeof sandbox.SpreadsheetApp?.create !== 'function') {
                console.log('⚠️  universal-apps-script.js: runAllTests skipped (SpreadsheetApp.create not available in Node sandbox)');
            } else {
                const all = sandbox.runAllTests();
                const helperPassed = all.helper?.results?.filter(r => r.passed).length || 0;
                const integPassed = all.integration?.results?.filter(r => r.passed).length || 0;
                console.log(`✅ universal-apps-script.js: runAllTests success=${all.success}`);
                console.log(`   Helper: ${helperPassed}/${all.helper?.results?.length || 0}`);
                console.log(`   Integration: ${integPassed}/${all.integration?.results?.length || 0}`);
            }
        } catch (e) {
            console.log('❌ universal-apps-script.js: runAllTests error -', e.message);
        }
    }
} catch (error) {
    console.log('❌ universal-apps-script.js: Syntax error -', error.message);
}

console.log('\n📁 Checking file structure...');

const requiredFiles = [
    { label: 'src/web/index.html', absPath: path.join(webDir, 'index.html') },
    { label: 'src/web/config.js', absPath: path.join(webDir, 'config.js') },
    { label: 'src/web/app.js', absPath: path.join(webDir, 'app.js') },
    { label: 'src/web/debug.js', absPath: path.join(webDir, 'debug.js') },
    { label: 'src/web/styles/styles.css', absPath: path.join(webDir, 'styles', 'styles.css') },
    { label: 'src/web/styles/default-theme.css', absPath: path.join(webDir, 'styles', 'default-theme.css') },
    { label: 'src/web/universal-sheet-api.js', absPath: path.join(webDir, 'universal-sheet-api.js') },
    { label: 'src/appscript/universal-apps-script.js', absPath: path.join(appscriptDir, 'universal-apps-script.js') },
    { label: 'docs/UNIVERSAL_BACKEND.md', absPath: path.join(repoRoot, 'docs', 'UNIVERSAL_BACKEND.md') }
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file.absPath)) {
        const stats = fs.statSync(file.absPath);
        console.log(`✅ ${file.label} (${stats.size} bytes)`);
    } else {
        console.log(`❌ ${file.label} - MISSING`);
    }
});

console.log('\n🔍 Done!');