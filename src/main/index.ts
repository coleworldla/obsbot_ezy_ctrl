import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { CameraManager } from './cameras';
import { registerIpc } from './ipc';
import { CameraStore } from './store/cameras';

let win: BrowserWindow | null = null;
let manager: CameraManager | null = null;

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1c2026',
    title: 'EZY CTRL',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return w;
}

app.whenReady().then(() => {
  const store = new CameraStore(join(app.getPath('userData'), 'cameras.json'));
  manager = new CameraManager(store, (status) => {
    win?.webContents.send('camera:status', status);
  });
  registerIpc(store, manager);
  manager.startPolling();

  win = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

app.on('window-all-closed', () => {
  manager?.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => manager?.stopAll());
