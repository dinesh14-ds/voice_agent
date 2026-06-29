const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeAction: (name, args) => ipcRenderer.invoke('execute-action', { name, args }),
  saveVoiceProfile: (embedding) => ipcRenderer.invoke('save-voice-profile', embedding),
  loadVoiceProfile: () => ipcRenderer.invoke('load-voice-profile'),
});
