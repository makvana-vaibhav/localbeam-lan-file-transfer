const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer (the web dashboard)
contextBridge.exposeInMainWorld('localbeamDesktop', {
  getPort: () => ipcRenderer.invoke('get-port'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLog: () => ipcRenderer.invoke('open-log'),
  isDesktop: true,
  platform: process.platform,
});
