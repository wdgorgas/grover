const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grover', Object.freeze({
  snapshot: () => ipcRenderer.invoke('grover:snapshot'),
  conversationMessages: (conversationId) => ipcRenderer.invoke('grover:conversation-messages', conversationId),
  searchMemories: (query) => ipcRenderer.invoke('grover:search-memories', query),
  submit: (input) => ipcRenderer.invoke('grover:submit', input),
  taskAction: (taskId, action) => ipcRenderer.invoke('grover:task-action', { taskId, action }),
  setKillSwitch: (enabled) => ipcRenderer.invoke('grover:kill-switch', enabled),
  setPreferredEngine: (engineId) => ipcRenderer.invoke('grover:preferred-engine', engineId),
  refreshEngines: () => ipcRenderer.invoke('grover:refresh-engines'),
  signInEngine: (engineId) => ipcRenderer.invoke('grover:sign-in-engine', engineId),
  moveConversation: (conversationId, context) => ipcRenderer.invoke('grover:move-conversation', { conversationId, context }),
  chooseProjectFolder: (conversationId) => ipcRenderer.invoke('grover:choose-project-folder', conversationId),
  openProjectFolder: (conversationId) => ipcRenderer.invoke('grover:open-project-folder', conversationId),
  chooseWorkspace: () => ipcRenderer.invoke('grover:choose-workspace'),
  forget: (memoryId) => ipcRenderer.invoke('grover:forget', memoryId),
  correctMemory: (memoryId, content) => ipcRenderer.invoke('grover:correct-memory', { memoryId, content }),
  approveMemory: (proposalId) => ipcRenderer.invoke('grover:approve-memory', proposalId),
  rejectMemory: (proposalId) => ipcRenderer.invoke('grover:reject-memory', proposalId),
  syncMemory: () => ipcRenderer.invoke('grover:sync-memory'),
  consolidateMemory: (namespace) => ipcRenderer.invoke('grover:consolidate-memory', namespace),
  exportMemory: () => ipcRenderer.invoke('grover:export-memory'),
  restoreMemory: () => ipcRenderer.invoke('grover:restore-memory'),
  rateTask: (taskId, rating) => ipcRenderer.invoke('grover:rate-task', { taskId, rating }),
  reportProblem: (taskId, kind, note, correction) => ipcRenderer.invoke('grover:report-problem', { taskId, kind, note, correction }),
  incidentAction: (incidentId, action) => ipcRenderer.invoke('grover:incident-action', { incidentId, action }),
  replayIncident: (incidentId) => ipcRenderer.invoke('grover:replay-incident', incidentId),
  promoteIncidentReplay: (incidentId) => ipcRenderer.invoke('grover:promote-incident-replay', incidentId),
  runRegressions: () => ipcRenderer.invoke('grover:run-regressions'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('grover:state', listener);
    return () => ipcRenderer.removeListener('grover:state', listener);
  },
}));
