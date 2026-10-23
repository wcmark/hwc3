const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('holyricsAbout', Object.freeze({
  getInfo: () => ipcRenderer.invoke('about-info'),
  setDontShowAgain: value => ipcRenderer.invoke('about-preference', value),
  openLink: id => ipcRenderer.invoke('about-open-link', id),
  close: () => ipcRenderer.invoke('about-close')
}));
