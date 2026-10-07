const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  snip: () => ipcRenderer.send('snip'),
  copy: (text) => ipcRenderer.send('copy', text),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  openScreenSettings: () => ipcRenderer.send('open-screen-settings'),
  relaunch: () => ipcRenderer.send('relaunch'),
  on: (channel, fn) => ipcRenderer.on(channel, (_, value) => fn(value)),
});
