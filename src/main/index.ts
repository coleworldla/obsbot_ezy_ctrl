import { app, BrowserWindow, session, shell } from 'electron';
import fs from 'node:fs';
import { join } from 'node:path';
import { CameraManager } from './cameras';
import { oscStatusOf, registerIpc } from './ipc';
import { errMsg, logger } from './log';
import { NdiManager } from './ndi/manager';
import { OscServer, type OscIncoming } from './osc/server';
import { showFileFromArgv } from '../shared/show';
import { ShowService } from './show';
import { createShowActions, type ShowActions } from './show-dialogs';
import { CameraStore } from './store/cameras';
import { MappingStore } from './store/mappings';
import { PresetStore } from './store/presets';
import { SettingsStore } from './store/settings';
import { Updater } from './updater';
import { VideoManager } from './video/manager';

// Dev / test hooks (harmless when unset):
//   EZY_USER_DATA=<dir>     use a different config directory (keeps test runs away from real presets)
//   EZY_CAPTURE=<file.png>  screenshot the window after EZY_CAPTURE_DELAY ms (default 8000) and quit
//   EZY_AUTOTEST=<steps>    let the renderer run scripted interactions (see renderer App.tsx);
//                           the step "shows" also answers the show dialogs by themselves
if (process.env.EZY_USER_DATA) app.setPath('userData', process.env.EZY_USER_DATA);

// One running copy per installation: a second launch (double-clicking a .ezy show) hands its command
// line to the running app instead of fighting it for the cameras and the OSC port. Dev runs are left alone.
const primary = !app.isPackaged || app.requestSingleInstanceLock();
if (!primary) app.quit();

let win: BrowserWindow | null = null;
let manager: CameraManager | null = null;
let video: VideoManager | null = null;
let osc: OscServer | null = null;
let ndi: NdiManager | null = null;
let showActions: ShowActions | null = null;
/** A show the OS asked to open before the window was ready. */
let pendingShow: string | null = showFileFromArgv(process.argv.slice(1));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Open a .ezy handed over by the OS, once the window has loaded; always asks first. */
function openShowFromOs(file: string): void {
  const w = win;
  if (!w || !showActions) {
    pendingShow = file;
    return;
  }
  if (w.isMinimized()) w.restore();
  w.focus();
  const go = () => void showActions?.open(file);
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go);
  else go();
}

app.on('second-instance', (_e, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
  const file = showFileFromArgv(argv.slice(1));
  if (file) openShowFromOs(file);
});

// macOS: a .ezy double-clicked in Finder or dropped on the Dock icon (can arrive before ready).
app.on('open-file', (e, file) => {
  if (!/\.ezy$/i.test(file)) return;
  e.preventDefault();
  openShowFromOs(file);
});

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
  if (!primary) return;
  const userData = app.getPath('userData');
  logger.attachFile(join(userData, 'logs', 'ezy-ctrl.log'));
  logger.info('app', `EZY CTRL ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.arch}`);
  logger.info('app', `config folder ${userData}`);
  logger.on('entry', (entry) => win?.webContents.send('log:entry', entry));

  // Web MIDI (and clipboard for "copy address list") need explicit permission in Electron.
  // 'media' = webcam capture for the Webcam video source (UVC / NDI Tools Webcam Input).
  const allowed = new Set(['midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media']);
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

  ndi = new NdiManager(process.env.EZY_NDI_RUNTIME ?? settings.get().ndi.runtimePath);

  const backupsDir = join(userData, 'shows', 'backups');
  const shows = new ShowService({
    store,
    presets,
    settings,
    mappings,
    appVersion: app.getVersion(),
    backupsDir,
    stopCamera: async (id) => {
      manager?.forget(id);
      video?.stop(id);
      await Promise.race([ndi?.stop(id), sleep(3000)]);
    },
  });
  showActions = createShowActions({
    shows,
    window: () => win,
    // Test runs with their own config folder keep their shows there, away from the real Documents folder.
    showsDir: process.env.EZY_USER_DATA ? join(userData, 'shows') : join(app.getPath('documents'), 'EZY CTRL Shows'),
    backupsDir,
    afterApply: applyOsc,
    noPrompt: (process.env.EZY_AUTOTEST ?? '').split(',').includes('shows'),
  });

  registerIpc({ store, presets, settings, mappings, manager, video, osc, applyOsc, updater, ndi, shows, showActions });
  manager.startPolling();
  void applyOsc();

  win = createWindow();
  installCaptureHook(win);
  if (pendingShow) {
    const file = pendingShow;
    pendingShow = null;
    openShowFromOs(file);
  }

  if (app.isPackaged && settings.get().updates.autoCheck) {
    setTimeout(() => void updater.check(), 8000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
  });
});

let quitting = false;

async function shutdown(): Promise<void> {
  manager?.stopAll();
  video?.stopAll();
  osc?.close();
  // NDI receivers must be destroyed before the process exits, otherwise the runtime hangs on unload.
  await ndi?.stopAll();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  void shutdown()
    .catch((err) => logger.error('app', `shutdown: ${errMsg(err)}`))
    .finally(() => app.quit());
});
