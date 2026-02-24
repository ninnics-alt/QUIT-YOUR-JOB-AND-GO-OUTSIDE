// Preload script: expose safe IPC bridge for renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openDevTools: () => ipcRenderer.send('open-devtools'),
  logDevices: (devices) => ipcRenderer.send('log-devices', devices)
});
