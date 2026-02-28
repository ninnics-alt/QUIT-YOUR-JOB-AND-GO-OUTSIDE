// Preload script: expose safe IPC bridge for renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openDevTools: () => ipcRenderer.send('open-devtools'),
  logDevices: (devices) => ipcRenderer.send('log-devices', devices),
  minimodeEnable: (payload) => ipcRenderer.invoke('minimode:enable', payload),
  minimodeDisable: () => ipcRenderer.invoke('minimode:disable'),
  minimodeSetCorner: (payload) => ipcRenderer.invoke('minimode:setCorner', payload),
  minimodeSetModule: (payload) => ipcRenderer.invoke('minimode:setModule', payload)
});
