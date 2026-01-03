#!/usr/bin/env python3
"""
Enhanced test server for bowiephone app with debug log collection
This will make HTTP requests to test the server and collect debug logs
"""

import requests
import sys
import json
from datetime import datetime
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse
import os
import signal

class DebugLogCollector:
    def __init__(self):
        self.logs = []
        self.max_logs = 200
    
    def add_log(self, log_data):
        self.logs.append({
            **log_data,
            'server_timestamp': datetime.now().isoformat()
        })
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)
        
        # Print to console with formatting
        timestamp = log_data.get('timestamp', 'Unknown')
        log_type = log_data.get('type', 'log').upper()
        message = log_data.get('message', '')
        url = log_data.get('url', '')
        
        # Color coding for terminal output (Windows compatible)
        try:
            colors = {
                'ERROR': '\033[91m',  # Red
                'WARN': '\033[93m',   # Yellow
                'INFO': '\033[94m',   # Blue
                'LOG': '\033[92m',    # Green
            }
            reset_color = '\033[0m'
            
            color = colors.get(log_type, '')
            print(f"{color}[{timestamp}] {log_type}: {message}{reset_color}")
            if url and url != 'http://localhost:8001':
                print(f"  📍 {url}")
        except:
            # Fallback for terminals that don't support colors
            print(f"[{timestamp}] {log_type}: {message}")
    
    def get_logs(self):
        return self.logs
    
    def clear_logs(self):
        self.logs = []

# Global log collector
log_collector = DebugLogCollector()

class DebugHTTPRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default HTTP server logging
        pass
    
    def do_POST(self):
        if self.path == '/debug-log':
            try:
                # Handle debug log submission
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length == 0:
                    self.send_error(400, "No content")
                    return
                    
                post_data = self.rfile.read(content_length)
                log_data = json.loads(post_data.decode('utf-8'))
                log_collector.add_log(log_data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'logged'}).encode())
                
            except json.JSONDecodeError as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid JSON: {str(e)}'}).encode())
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/logs':
            # Return collected logs as JSON
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            logs = log_collector.get_logs()
            self.wfile.write(json.dumps(logs, indent=2).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run_debug_server():
    """Run the debug log collection server"""
    try:
        server = HTTPServer(('localhost', 8002), DebugHTTPRequestHandler)
        print("🔍 Debug log server running on http://localhost:8002")
        print("📝 Debug logs will be displayed here in real-time")
        print("💡 GET /logs to view all collected logs")
        print("💡 Press Ctrl+C to stop")
        print("=" * 60)
        
        # Graceful shutdown handler
        def signal_handler(signum, frame):
            print("\n🛑 Shutting down debug server...")
            server.shutdown()
            print(f"📈 Collected {len(log_collector.get_logs())} debug logs total")
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        server.serve_forever()
        
    except OSError as e:
        if "Address already in use" in str(e):
            print("❌ Port 8002 is already in use")
            print("💡 Try stopping other debug servers or use a different port")
        else:
            print(f"❌ Server error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

def test_app_server():
    """Test the main application server"""
    base_url = "http://localhost:8001"
    
    print("🧪 Testing bowiephone application...")
    print(f"📡 Base URL: {base_url}")
    print()
    
    # Test files that should exist
    test_files = [
        "/",  # index.html
        "/config.js",
        "/app.js", 
        "/debug.js",
        "/styles/styles.css",
        "/styles/default-theme.css"
    ]
    
    all_good = True
    
    for file_path in test_files:
        try:
            url = base_url + file_path
            response = requests.get(url, timeout=5)
            status = "✅" if response.status_code == 200 else "❌"
            print(f"{status} {file_path}: {response.status_code} ({len(response.content)} bytes)")
            
            if response.status_code != 200:
                all_good = False
            
            # Check for debug flag in config
            if file_path == '/config.js' and response.status_code == 200:
                content = response.text
                if 'debug: true' in content:
                    print(f"   🐛 Debug mode ENABLED")
                elif 'debug: false' in content:
                    print(f"   🐛 Debug mode DISABLED")
                    
        except requests.exceptions.ConnectionError:
            print(f"❌ {file_path}: Connection refused - Is the server running on port 8001?")
            all_good = False
        except requests.exceptions.Timeout:
            print(f"❌ {file_path}: Request timeout")
            all_good = False
        except requests.exceptions.RequestException as e:
            print(f"❌ {file_path}: Request error - {e}")
            all_good = False
    
    print()
    if all_good:
        print("✅ Application server test complete - all files accessible")
    else:
        print("⚠️  Some issues found with the application server")
        print("💡 Make sure: python -m http.server 8001 --directory src")
    
    print("💡 Open http://localhost:8001 to test the app")
    print("📊 Debug logs will appear below:")
    print("=" * 60)
    
    return all_good

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == 'debug-only':
        # Just run the debug server
        print("🚀 Starting debug log collection server only...")
        run_debug_server()
    elif len(sys.argv) > 1 and sys.argv[1] == 'test-only':
        # Just test the app server
        test_app_server()
    else:
        # Test the app server first, then run debug server
        print("🚀 Testing application server first...")
        app_ok = test_app_server()
        
        if not app_ok:
            print("\n⚠️  Application server issues detected.")
            print("💡 Start the app server first: python -m http.server 8001 --directory src")
            print("💡 Then run: python test_server.py debug-only")
            sys.exit(1)
        
        print("\n🚀 Starting debug log collection server...")
        try:
            run_debug_server()
        except KeyboardInterrupt:
            print("\n🛑 Debug server stopped")
            print(f"📈 Collected {len(log_collector.get_logs())} debug logs total")