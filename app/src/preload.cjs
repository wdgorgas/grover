const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grover', Object.freeze({
  snapshot: () => ipcRenderer.invoke('grover:snapshot'),
  submit: (input) => ipcRenderer.invoke('grover:submit', input),
  taskAction: (taskId, action) => ipcRenderer.invoke('grover:task-action', { taskId, action }),
  setKillSwitch: (enabled) => ipcRenderer.invoke('grover:kill-switch', enabled),
  setPreferredEngine: (engineId) => ipcRenderer.invoke('grover:preferred-engine', engineId),
  refreshEngines: () => ipcRenderer.invoke('grover:refresh-engines'),
  signInEngine: (engineId) => ipcRenderer.invoke('grover:sign-in-engine', engineId),
  moveConversation: (conversationId, context) => ipcRenderer.invoke('grover:move-conversation', { conversationId, context }),
  chooseWorkspace: () => ipcRenderer.invoke('grover:choose-workspace'),
  forget: (memoryId) => ipcRenderer.invoke('grover:forget', memoryId),
  rateTask: (taskId, rating) => ipcRenderer.invoke('grover:rate-task', { taskId, rating }),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('grover:state', listener);
    return () => ipcRenderer.removeListener('grover:state', listener);
  },
}));
