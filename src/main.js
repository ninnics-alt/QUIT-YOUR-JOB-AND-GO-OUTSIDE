const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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
