import { app, BrowserWindow, session, shell } from 'electron';
import fs from 'node:fs';
import { join } from 'node:path';
import { CameraManager } from './cameras';
import { oscStatusOf, registerIpc } from './ipc';
import { errMsg, logger } from './log';
import { OscServer, type OscIncoming } from './osc/server';
import { CameraStore } from './store/cameras';
import { MappingStore } from './store/mappings';
import { PresetStore } from './store/presets';
import { SettingsStore } from './store/settings';
import { Updater } from './updater';
import { VideoManager } from './video/manager';

// Dev / test hooks (harmless when unset):
//   EZY_USER_DATA=<dir>     use a different config directory (keeps test runs away from real presets)
//   EZY_CAPTURE=<file.png>  screenshot the window after EZY_CAPTURE_DELAY ms (default 8000) and quit
//   EZY_AUTOTEST=<steps>    let the renderer run scripted interactions (see renderer App.tsx)
if (process.env.EZY_USER_DATA) app.setPath('userData', process.env.EZY_USER_DATA);

let win: BrowserWindow | null = null;
let manager: CameraManager | null = null;
let video: VideoManager | null = null;
let osc: OscServer | null = null;

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
  w.webContents.on('render-process-gone', (_e, details) => logger.error('app', `renderer gone: ${details.reason}`));
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

process.on('uncaughtException', (e) => logger.error('app', `uncaught exception: ${e.stack ?? errMsg(e)}`));
process.on('unhandledRejection', (e) => logger.error('app', `unhandled rejection: ${errMsg(e)}`));

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  logger.attachFile(join(userData, 'logs', 'ezy-ctrl.log'));
  logger.info('app', `EZY CTRL ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.arch}`);
  logger.info('app', `config folder ${userData}`);
  logger.on('entry', (entry) => win?.webContents.send('log:entry', entry));

  // Web MIDI (and clipboard for "copy address list") need explicit permission in Electron.
  const allowed = new Set(['midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  const store = new CameraStore(join(userData, 'cameras.json'));
  const presets = new PresetStore(join(userData, 'presets.json'));
  const settings = new SettingsStore(join(userData, 'settings.json'));
  const mappings = new MappingStore(join(userData, 'mappings.json'));
  manager = new CameraManager(store, (status) => {
    win?.webContents.send('camera:status', status);
  });
  video = new VideoManager(
    (line) => logger.info('video', line),
    (line) => logger.error('video', line),
  );

  osc = new OscServer();
  osc.on('message', (m: OscIncoming) => win?.webContents.send('osc:message', m));
  osc.on('error', (e: Error) => logger.warn('osc', e.message));
  osc.on('listening', (port: number) => logger.info('osc', `listening on udp port ${port}`));
  const applyOsc = async () => {
    const s = settings.get().osc;
    if (s.enabled) {
      try {
        if (!osc!.listening || osc!.port !== s.listenPort) await osc!.start(s.listenPort);
      } catch (e) {
        logger.error('osc', `cannot listen on udp port ${s.listenPort}: ${errMsg(e)}`);
      }
    } else if (osc!.listening) {
      osc!.stop();
      logger.info('osc', 'listener stopped');
    }
    win?.webContents.send('osc:status', oscStatusOf(osc!));
  };

  const updater = new Updater();
  updater.on('status', (s) => win?.webContents.send('update:status', s));

  registerIpc({ store, presets, settings, mappings, manager, video, osc, applyOsc, updater });
  manager.startPolling();
  void applyOsc();

  win = createWindow();
  installCaptureHook(win);

  if (app.isPackaged && settings.get().updates.autoCheck) {
    setTimeout(() => void updater.check(), 8000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

function shutdown(): void {
  manager?.stopAll();
  video?.stopAll();
  osc?.close();
}

app.on('window-all-closed', () => {
  shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', shutdown);
