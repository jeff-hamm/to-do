# Setup Instructions

## Google Sheets Integration (Optional)

This project can integrate with Google Sheets for task management. To set this up securely:

### 1. Create Local Configuration

1. Copy `config.example.js` to `config.local.js`:
   ```bash
   cp src/config.example.js src/config.local.js
   ```

2. Edit `src/config.local.js` and replace the placeholder values with your real Google Sheets credentials:
   - `spreadsheetId`: Your Google Sheets document ID
   - `gid`: The specific sheet tab ID (found in URL after #gid=)
   - `appScriptUrl`: Your Google Apps Script web app URL

### 2. Important Security Notes

- ✅ `config.local.js` is automatically ignored by git
- ✅ Never commit real credentials to the repository
- ✅ The main `config.js` file only contains safe placeholder values
- ✅ Your local configuration will automatically override the defaults

### 3. Local Storage Only Mode

If you don't want to use Google Sheets integration, the app will automatically fall back to local storage mode. No additional setup required.

### 4. Testing Your Setup

1. Start the local server:
   ```bash
   python -m http.server 8000 --directory src
   ```

2. Open http://localhost:8000 in your browser

3. Check the browser console:
   - ✅ "Local configuration loaded successfully" = Google Sheets integration active
   - ℹ️ "No local configuration found" = Using local storage mode

## Development

The app will automatically detect and load your local configuration when available, making development seamless while keeping your credentials secure.