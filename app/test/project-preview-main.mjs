import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadFile(process.env.GROVER_PROJECT_HTML);
});

app.on('window-all-closed', () => app.quit());
