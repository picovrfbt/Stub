// Stub for Windows: opens the Stub app in its own window, with its own taskbar icon.
// The app itself is the same one at APP_URL; your data still goes only to your own server.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const APP_URL = 'https://picovrfbt.github.io/Stub/';

// one window only: opening Stub again brings the existing window forward
if (!app.requestSingleInstanceLock()) app.quit();
let win;

const insideApp = url => url.startsWith(APP_URL);
const openOutside = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };

function offlinePage() {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><title>Stub</title>
    <body style="background:#0d0d0d;color:#fff;font:15px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
    <div><h2>Stub needs the internet the first time it opens</h2><p style="color:#c3c2b7">After that it works offline.</p>
    <p><a href="${APP_URL}" style="color:#3987e5">Try again</a></p></div>`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 360, minHeight: 560,
    title: 'Stub', backgroundColor: '#0d0d0d', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());

  // only Stub opens in this window; every other link opens in your normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!insideApp(url)) { e.preventDefault(); openOutside(url); } });

  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && insideApp(url)) win.loadURL(offlinePage());
  });
  // F5 / Ctrl+R reload, Ctrl+Shift+I developer tools (there's no menu bar)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) win.webContents.reload();
    if (input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });

  win.loadURL(APP_URL);
}

Menu.setApplicationMenu(null);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
