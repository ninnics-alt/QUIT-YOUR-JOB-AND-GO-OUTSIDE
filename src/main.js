const { app, BrowserWindow, ipcMain, screen, shell, dialog } = require('electron');
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
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
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
  
  // Add keyboard shortcut to open DevTools (Cmd+Option+I on Mac, F12 elsewhere)
  // This helps with debugging if needed
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In packaged app, user can press Cmd+Option+I to open DevTools
    const { globalShortcut } = require('electron');
    globalShortcut.register('CmdOrCtrl+Alt+I', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }
}

app.whenReady().then(() => {
  // Set app icon on macOS dock (use PNG as fallback since ICNS conversion is tricky)
  if (process.platform === 'darwin') {
    try {
      // Try ICNS first
      const icnsPath = path.join(__dirname, '..', 'assets', 'icon.icns');
      if (fs.existsSync(icnsPath)) {
        // Verify it's a real ICNS file, not a PNG renamed
        const header = fs.readFileSync(icnsPath, { end: 3 });
        if (header.toString('ascii') === 'icns') {
          app.dock.setIcon(icnsPath);
        } else {
          // Fall back to PNG
          app.dock.setIcon(path.join(__dirname, '..', 'assets', 'icon.png'));
        }
      } else {
        app.dock.setIcon(path.join(__dirname, '..', 'assets', 'icon.png'));
      }
    } catch (err) {
      console.error('Failed to set dock icon:', err);
    }
  }
  
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.on('get-isDev', (event) => {
  event.returnValue = !app.isPackaged;
});

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

ipcMain.handle('capture:getStream', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || win.isDestroyed()) {
    throw new Error('Window not found');
  }
  
  // Return a message that will be handled by the renderer to access the audio context
  // Since we can't directly pass MediaStream across IPC, we'll need to handle this in the renderer
  return { ok: true };
});

ipcMain.handle('capture:saveAudio', (event, payload) => {
  try {
    const { filename, audioData } = payload;
    const userData = app.getPath('userData');
    const capturesDir = path.join(userData, 'audio-captures');
    
    console.log('[Capture] Saving to:', capturesDir);
    
    // Create the captures directory if it doesn't exist
    if (!fs.existsSync(capturesDir)) {
      fs.mkdirSync(capturesDir, { recursive: true });
      console.log('[Capture] Created directory:', capturesDir);
    }
    
    const filePath = path.join(capturesDir, filename);
    
    // Convert array back to Buffer
    const buffer = Buffer.from(audioData);
    fs.writeFileSync(filePath, buffer);
    
    console.log('[Capture] Audio file saved:', filePath);
    return { ok: true, path: filePath, dir: capturesDir };
  } catch (error) {
    console.error('[Capture] Failed to save audio file:', error);
    throw error;
  }
});

ipcMain.handle('capture:saveAudioToPath', (event, payload) => {
  try {
    const { filePath, audioData } = payload;
    
    let finalPath = filePath;
    // Ensure .wav extension
    if (!finalPath.endsWith('.wav') && !finalPath.endsWith('.WAV')) {
      finalPath = finalPath + '.wav';
    }
    
    // Create parent directory if it doesn't exist
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Convert array back to Buffer
    const buffer = Buffer.from(audioData);
    fs.writeFileSync(finalPath, buffer);
    
    console.log('[Capture] Audio file saved to:', finalPath);
    return { ok: true, path: finalPath };
  } catch (error) {
    console.error('[Capture] Failed to save audio file:', error);
    throw error;
  }
});

ipcMain.handle('capture:openFolder', (event) => {
  try {
    const userData = app.getPath('userData');
    const capturesDir = path.join(userData, 'audio-captures');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(capturesDir)) {
      fs.mkdirSync(capturesDir, { recursive: true });
    }
    
    shell.openPath(capturesDir);
    return { ok: true, path: capturesDir };
  } catch (error) {
    console.error('[Capture] Failed to open folder:', error);
    throw error;
  }
});

ipcMain.handle('dialog:showSaveDialog', async (event, defaultFilename) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || win.isDestroyed()) {
    throw new Error('Window not found');
  }
  
  const filename = String(defaultFilename || 'audio-capture.wav');
  
  const result = await dialog.showSaveDialog(win, {
    defaultPath: filename.endsWith('.wav') ? filename : (filename + '.wav'),
    filters: [
      { name: 'WAV Audio', extensions: ['wav'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['showOverwriteConfirmation']
  });
  
  return result;
});

