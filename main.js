// Emet: Electron main process.
// One window, its own local page only, camera permission for that page only.

'use strict';

const path = require('path');
const { app, BrowserWindow, session } = require('electron');

// Packaged builds load the SDK's native runtime from resources/smartspectra/.
if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
  const LIB = { darwin: 'libsmartspectra_capi.dylib', win32: 'smartspectra_capi.dll', linux: 'libsmartspectra_capi.so' }[process.platform];
  if (LIB) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
}

const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#120d0a',
    title: 'Emet',
    autoHideMenuBar: true,
    webPreferences: {
      preload: require.resolve('@smartspectra/node-sdk/preload'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  bindSmartSpectraIpc(win);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Optional: a key in SMARTSPECTRA_API_KEY or a git-ignored presage.key file next to the app
  // is handed to the page once, so it doesn't have to be pasted in. It never leaves this computer.
  const fs = require('fs');
  let key = (process.env.SMARTSPECTRA_API_KEY || '').trim();
  try { if (!key) key = fs.readFileSync(path.join(__dirname, 'presage.key'), 'utf8').trim(); } catch {}
  if (key && /^[\w-]{16,128}$/.test(key)) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(`try{if(!localStorage.getItem('emet.presageKey')){localStorage.setItem('emet.presageKey',${JSON.stringify(key)});location.reload()}}catch(e){}`);
    });
  }
  const query = process.argv.includes('--mock') ? { mock: '1' } : process.argv.includes('--diag') ? { diag: '1' } : undefined;
  // --diag: print the page's [diag] lines to this terminal (presence and confidence only, never values).
  if (query?.diag) win.webContents.on('console-message', (_e, _level, message) => { if (String(message).startsWith('[diag]')) process.stdout.write(message + '\n'); });
  win.loadFile(path.join(__dirname, 'index.html'), query ? { query } : undefined);
}

app.whenReady().then(() => {
  // Camera only (no microphone), and only for our own bundled page.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
    const types = (details && details.mediaTypes) || [];
    callback(permission === 'media' && types.length === 1 && types[0] === 'video' && url.startsWith('file://'));
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
