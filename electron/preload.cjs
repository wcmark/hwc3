const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('holyricsDesktop', Object.freeze({
  version: '3.0.0',
  isDesktop: true,
  openWebPanel: () => ipcRenderer.invoke('open-web-panel'),
  openAbout: () => ipcRenderer.invoke('open-about'),
  getStartupSettings: () => ipcRenderer.invoke('startup-settings-get'),
  setStartupSettings: settings => ipcRenderer.invoke('startup-settings-set', settings)
}));
