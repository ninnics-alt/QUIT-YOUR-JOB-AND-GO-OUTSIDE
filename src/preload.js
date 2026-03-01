// Preload script: expose safe IPC bridge for renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isDev: ipcRenderer.sendSync('get-isDev'),
  openDevTools: () => ipcRenderer.send('open-devtools'),
  logDevices: (devices) => ipcRenderer.send('log-devices', devices),
  minimodeEnable: (payload) => ipcRenderer.invoke('minimode:enable', payload),
  minimodeDisable: () => ipcRenderer.invoke('minimode:disable'),
  minimodeSetCorner: (payload) => ipcRenderer.invoke('minimode:setCorner', payload),
  minimodeSetModule: (payload) => ipcRenderer.invoke('minimode:setModule', payload),
  getCaptureStream: () => ipcRenderer.invoke('capture:getStream'),
  saveAudioFile: (filename, audioData) => ipcRenderer.invoke('capture:saveAudio', { filename, audioData }),
  saveAudioToPath: (filePath, audioData) => ipcRenderer.invoke('capture:saveAudioToPath', { filePath, audioData }),
  openCapturesFolder: () => ipcRenderer.invoke('capture:openFolder'),
  showSaveDialog: (defaultFilename) => ipcRenderer.invoke('dialog:showSaveDialog', String(defaultFilename || 'audio-capture')),
});
