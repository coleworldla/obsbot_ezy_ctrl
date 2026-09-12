import { app, BrowserWindow, shell } from 'electron';
import fs from 'node:fs';
import { join } from 'node:path';
import { CameraManager } from './cameras';
import { registerIpc } from './ipc';
import { CameraStore } from './store/cameras';
import { VideoManager } from './video/manager';

// Dev / test hooks (harmless when unset):
//   EZY_USER_DATA=<dir>     use a different config directory (keeps test runs away from real presets)
//   EZY_CAPTURE=<file.png>  screenshot the window after EZY_CAPTURE_DELAY ms (default 8000) and quit
if (process.env.EZY_USER_DATA) app.setPath('userData', process.env.EZY_USER_DATA);

let win: BrowserWindow | null = null;
let manager: CameraManager | null = null;
let video: VideoManager | null = null;

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
      webviewTag: true,
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

function installCaptureHook(w: BrowserWindow): void {
  const file = process.env.EZY_CAPTURE;
  if (!file) return;
  const delay = Number(process.env.EZY_CAPTURE_DELAY ?? 8000);
  setTimeout(async () => {
    try {
      const img = await w.webContents.capturePage();
      fs.writeFileSync(file, img.toPNG());
      console.log(`[capture] wrote ${file}`);
    } catch (e) {
      console.error('[capture] failed', e);
    } finally {
      app.quit();
    }
  }, delay);
}

app.whenReady().then(() => {
  const store = new CameraStore(join(app.getPath('userData'), 'cameras.json'));
  manager = new CameraManager(store, (status) => {
    win?.webContents.send('camera:status', status);
  });
  video = new VideoManager((line) => console.log(`[video] ${line}`));
  registerIpc(store, manager, video);
  manager.startPolling();

  win = createWindow();
  installCaptureHook(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

function shutdown(): void {
  manager?.stopAll();
  video?.stopAll();
}

app.on('window-all-closed', () => {
  shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', shutdown);
