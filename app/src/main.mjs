import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron/main';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { openDb } from './db.ts';
import { findRepoRoot, GroverCore } from './core.ts';

const here = dirname(fileURLToPath(import.meta.url));
const rendererDir = join(here, '..', 'renderer');
let core;
let mainWindow;

if (!app.requestSingleInstanceLock()) app.quit();
app.setName('GROVER');
if (process.env.GROVER_TEST_DATA_DIR) app.setPath('userData', process.env.GROVER_TEST_DATA_DIR);

function sendState(state) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('grover:state', state);
  }
}

function createWindow() {
  const indexPath = join(rendererDir, 'index.html');
  const allowedUrl = pathToFileURL(indexPath).href;
  mainWindow = new BrowserWindow({
    title: 'GROVER',
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: '#f4f2ed',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== allowedUrl) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  void mainWindow.loadFile(indexPath);
}

function installIpc() {
  ipcMain.handle('grover:snapshot', () => core.getSnapshot());
  ipcMain.handle('grover:submit', (_event, input) => core.submit(input));
  ipcMain.handle('grover:task-action', (_event, { taskId, action }) => core.taskAction(taskId, action));
  ipcMain.handle('grover:kill-switch', (_event, enabled) => core.setKillSwitch(Boolean(enabled)));
  ipcMain.handle('grover:preferred-engine', (_event, engineId) => core.setPreferredEngine(engineId));
  ipcMain.handle('grover:refresh-engines', () => core.refreshEngineStatus());
  ipcMain.handle('grover:sign-in-engine', (_event, engineId) => core.signInEngine(engineId));
  ipcMain.handle('grover:move-conversation', (_event, { conversationId, context }) => core.moveConversation(conversationId, context));
  ipcMain.handle('grover:forget', (_event, memoryId) => core.forget(memoryId));
  ipcMain.handle('grover:rate-task', (_event, { taskId, rating }) => core.rateTask(taskId, rating));
  ipcMain.handle('grover:choose-workspace', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the GROVER project folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    core.setWorkspaceRoot(result.filePaths[0]);
    return result.filePaths[0];
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, 'grover.db'));
  const developmentRoot = process.env.GROVER_TEST_WORKSPACE_ROOT ??
    findRepoRoot(join(here, '..', '..')) ?? findRepoRoot(process.cwd());
  core = new GroverCore({ db, dataDir, workspaceRoot: developmentRoot });
  core.on('state', sendState);
  installIpc();
  createWindow();
  void core.refreshEngineStatus();
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => app.quit());
