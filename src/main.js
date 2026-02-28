const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
const miniModeState = {
  enabled: false,
  corner: 'top-right',
  width: 460,
  height: 320,
  moduleId: 'miniMeters',
  skipTaskbar: false,
  previousWindowState: null
};

function clampMiniSize(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function computeMiniBounds(corner, width, height, margin = 16) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  let x = area.x + margin;
  let y = area.y + margin;

  if (corner === 'top-right' || corner === 'bottom-right') {
    x = area.x + area.width - width - margin;
  }
  if (corner === 'bottom-left' || corner === 'bottom-right') {
    y = area.y + area.height - height - margin;
  }

  return { x, y, width, height };
}

async function enableMiniMode(win, payload = {}) {
  if (!win || win.isDestroyed()) return { ok: false };

  if (!miniModeState.enabled) {
    miniModeState.previousWindowState = {
      bounds: win.getBounds(),
      alwaysOnTop: win.isAlwaysOnTop(),
      resizable: win.isResizable(),
      fullScreenable: win.isFullScreenable(),
      minimizable: win.isMinimizable(),
      fullscreen: win.isFullScreen()
    };
  }

  miniModeState.corner = payload.corner || miniModeState.corner;
  miniModeState.width = clampMiniSize(payload.width, miniModeState.width, 280, 900);
  miniModeState.height = clampMiniSize(payload.height, miniModeState.height, 200, 700);
  miniModeState.moduleId = payload.moduleId || miniModeState.moduleId;
  miniModeState.skipTaskbar = !!payload.skipTaskbar;

  const miniBounds = computeMiniBounds(miniModeState.corner, miniModeState.width, miniModeState.height, 16);

  // Exit fullscreen first and wait for it to complete
  win.setFullScreen(false);
  
  // Wait for fullscreen transition to complete before resizing
  await new Promise(resolve => setTimeout(resolve, 200));
  
  win.setAlwaysOnTop(true, 'floating');
  win.setResizable(false);
  win.setFullScreenable(false);
  win.setMinimizable(false);
  win.setBounds(miniBounds, true);

  miniModeState.enabled = true;
  return { ok: true, miniModeState };
}

function disableMiniMode(win) {
  if (!win || win.isDestroyed()) return { ok: false };

  if (miniModeState.previousWindowState) {
    const prev = miniModeState.previousWindowState;
    win.setAlwaysOnTop(prev.alwaysOnTop);
    win.setResizable(prev.resizable);
    win.setFullScreenable(prev.fullScreenable);
    win.setMinimizable(prev.minimizable);
    win.setFullScreen(prev.fullscreen);
    if (!prev.fullscreen) {
      win.setBounds(prev.bounds, true);
    }
  } else {
    // Restore to maximized state
    win.setAlwaysOnTop(false);
    win.setResizable(true);
    win.setFullScreenable(true);
    win.setMinimizable(true);
    win.maximize();
  }

  miniModeState.enabled = false;
  miniModeState.previousWindowState = null;
  return { ok: true, miniModeState };
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  // Start maximized but allow native fullscreen toggle
  win.maximize();

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow = win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.on('open-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.on('log-devices', (event, devices) => {
  try{
    const userData = app.getPath('userData');
    const logPath = path.join(userData, 'device-enumeration.log');
    const entry = `${new Date().toISOString()}\n${JSON.stringify(devices, null, 2)}\n\n`;
    fs.appendFileSync(logPath, entry);
  }catch(e){
    console.error('Failed to write device log', e);
  }
});

ipcMain.handle('minimode:enable', (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return enableMiniMode(win, payload || {});
});

ipcMain.handle('minimode:disable', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return disableMiniMode(win);
});

ipcMain.handle('minimode:setCorner', (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || win.isDestroyed()) return { ok: false };
  miniModeState.corner = (payload && payload.corner) || miniModeState.corner;
  if (miniModeState.enabled) {
    const bounds = computeMiniBounds(miniModeState.corner, miniModeState.width, miniModeState.height, 16);
    win.setBounds(bounds, true);
  }
  return { ok: true, miniModeState };
});

ipcMain.handle('minimode:setModule', (_event, payload) => {
  miniModeState.moduleId = (payload && payload.moduleId) || miniModeState.moduleId;
  return { ok: true, miniModeState };
});
