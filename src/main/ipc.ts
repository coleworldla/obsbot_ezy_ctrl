import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import type { Mapping } from '../shared/mapping';
import type { AppInfo, CameraConfig, CameraInput, CameraSet, JogDir, LogLevel, OscStatus, PresetPatch, RecallSpeed, Settings, ZoomDir } from '../shared/types';
import type { Updater } from './updater';
import type { NdiManager } from './ndi/manager';
import type { CameraManager } from './cameras';
import { CameraManager as Manager } from './cameras';
import { errMsg, logger } from './log';
import type { OscServer } from './osc/server';
import type { CameraStore } from './store/cameras';
import type { MappingStore } from './store/mappings';
import type { PresetStore } from './store/presets';
import type { SettingsStore } from './store/settings';
import type { VideoManager } from './video/manager';

export interface IpcDeps {
  store: CameraStore;
  presets: PresetStore;
  settings: SettingsStore;
  mappings: MappingStore;
  manager: CameraManager;
  video: VideoManager;
  osc: OscServer;
  /** Re-apply OSC settings (start/stop/rebind the listener). */
  applyOsc: () => Promise<void>;
  updater: Updater;
  ndi: NdiManager;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function localAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

export function oscStatusOf(osc: OscServer): OscStatus {
  return { listening: osc.listening, port: osc.port, error: osc.lastError, addresses: localAddresses() };
}

export function registerIpc({ store, presets, settings, mappings, manager, video, osc, applyOsc, updater, ndi }: IpcDeps): void {
  /** Register a handler whose failures are logged (and still rejected to the renderer). */
  const handle = <A extends unknown[], R>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => R | Promise<R>) => {
    ipcMain.handle(channel, async (e, ...args) => {
      try {
        return await fn(e, ...(args as A));
      } catch (err) {
        logger.warn('ipc', `${channel} failed: ${errMsg(err)}`);
        throw err;
      }
    });
  };

  // ---- camera list ----
  handle('cameras:list', () => store.list());
  handle('cameras:add', async (_e, input: CameraInput) => {
    const cam = store.add(input);
    logger.info('app', `added camera "${cam.name}" (${cam.host}, ${cam.videoSource})`, cam.id);
    await manager.connect(cam.id).catch(() => undefined);
    return cam;
  });
  handle('cameras:update', async (_e, cfg: CameraConfig) => {
    const cam = store.update(cfg);
    await manager.reconnect(cam);
    video.update(cam);
    ndi.update(cam);
    return cam;
  });
  handle('cameras:remove', (_e, id: string) => {
    const cam = store.get(id);
    manager.disconnect(id);
    video.stop(id);
    ndi.stop(id);
    presets.removeForCamera(id);
    store.remove(id);
    logger.info('app', `removed camera "${cam?.name ?? id}"`, id);
  });

  // ---- connection ----
  handle('camera:test', (_e, host: string, port: number) => Manager.test(host, port));
  handle('camera:connect', (_e, id: string) => manager.connect(id));
  handle('camera:disconnect', (_e, id: string) => manager.disconnect(id));
  handle('camera:statuses', () => manager.statuses());
  handle('camera:position', (_e, id: string) => manager.get(id).position());

  // ---- video ----
  handle('video:subscribe', (e, id: string) => {
    const cfg = store.get(id);
    if (cfg) video.subscribe(cfg, e.sender);
  });
  handle('video:unsubscribe', (e, id: string) => video.unsubscribe(id, e.sender));

  // ---- NDI ----
  handle('ndi:status', () => ndi.status());
  handle('ndi:sources', (_e, extraIp?: string) => ndi.sources(1500, extraIp || undefined));
  handle('ndi:subscribe', (e, id: string) => {
    const cfg = store.get(id);
    if (cfg) ndi.subscribe(cfg, e.sender);
  });
  handle('ndi:unsubscribe', (e, id: string) => ndi.unsubscribe(id, e.sender));
  handle('ndi:focus', (_e, id: string | null) => ndi.focus(id));

  // ---- pan / tilt / zoom ----
  handle('ptz:drive', (_e, id: string, dir: JogDir, pan: number, tilt: number) => manager.get(id).jog(dir, pan, tilt));
  handle('ptz:home', (_e, id: string) => manager.get(id).home());
  handle('ptz:absolute', (_e, id: string, panDeg: number, tiltDeg: number, pan: number, tilt: number) =>
    manager.get(id).moveTo(panDeg, tiltDeg, pan, tilt),
  );
  handle('zoom:drive', (_e, id: string, dir: ZoomDir, speed: number) => manager.get(id).zoom(dir, speed));
  handle('zoom:direct', (_e, id: string, ratio: number) => manager.get(id).zoomTo(ratio));

  // ---- camera settings (tracking / focus / exposure / white balance / image) ----
  handle('camera:set', async (_e, id: string, s: CameraSet) => {
    await manager.get(id).set(s);
    logger.info('visca', `${store.get(id)?.name ?? id}: set ${s.key}${'value' in s ? ` = ${String(s.value)}` : ''}`, id);
    // Live-state keys are re-read right away so the UI mirrors the camera.
    if (['track', 'trackMode', 'record', 'portrait', 'focusAuto', 'exposureAuto', 'wbMode'].includes(s.key)) await manager.refreshState(id).catch(() => undefined);
  });
  handle('camera:fullState', (_e, id: string) => manager.get(id).fullState(manager.statuses().find((s) => s.id === id)?.state));

  // ---- other actions ----
  handle('focus:push', (_e, id: string) => manager.get(id).focusOnePush());
  handle('ai:track', (_e, id: string, on: boolean) => manager.get(id).track(on));
  handle('record', (_e, id: string, on: boolean) => manager.get(id).record(on));
  handle('orientation', (_e, id: string, vertical: boolean) => manager.get(id).orientation(vertical));
  handle('preset:recall', (_e, id: string, n: number) => manager.get(id).presetRecall(n));
  handle('preset:set', (_e, id: string, n: number) => manager.get(id).presetSet(n));

  // ---- app-side presets (unlimited) ----
  handle('presets:list', (_e, cameraId?: string) => presets.list(cameraId));
  handle('presets:save', async (_e, cameraId: string, name: string, thumbnail?: string) => {
    const pos = await manager.get(cameraId).position();
    const p = presets.add({ cameraId, name, panDeg: pos.panDeg, tiltDeg: pos.tiltDeg, zoomRatio: pos.zoomRatio, thumbnail });
    logger.info('preset', `saved "${p.name}" at pan ${p.panDeg} tilt ${p.tiltDeg} zoom ${p.zoomRatio}x`, cameraId);
    return p;
  });
  handle('presets:recall', async (_e, id: string, speed: RecallSpeed) => {
    const p = presets.get(id);
    if (!p) throw new Error('preset not found');
    const cam = manager.get(p.cameraId);
    await Promise.all([cam.moveTo(p.panDeg, p.tiltDeg, speed.pan, speed.tilt), cam.zoomTo(p.zoomRatio)]);
  });
  handle('presets:update', (_e, id: string, patch: PresetPatch) => presets.update(id, patch));
  handle('presets:updatePosition', async (_e, id: string) => {
    const p = presets.get(id);
    if (!p) throw new Error('preset not found');
    const pos = await manager.get(p.cameraId).position();
    logger.info('preset', `updated "${p.name}" to pan ${pos.panDeg} tilt ${pos.tiltDeg} zoom ${pos.zoomRatio}x`, p.cameraId);
    return presets.update(id, { panDeg: pos.panDeg, tiltDeg: pos.tiltDeg, zoomRatio: pos.zoomRatio });
  });
  handle('presets:remove', (_e, id: string) => {
    const p = presets.get(id);
    presets.remove(id);
    if (p) logger.info('preset', `deleted "${p.name}"`, p.cameraId);
  });
  handle('presets:reorder', (_e, cameraId: string, ids: string[]) => presets.reorder(cameraId, ids));
  handle('presets:mirror', async (_e, id: string, slot: number) => {
    const p = presets.get(id);
    if (!p) throw new Error('preset not found');
    if (!Number.isInteger(slot) || slot < 0 || slot > 255) throw new Error('slot must be 0-255');
    const cam = manager.get(p.cameraId);
    await Promise.all([cam.moveTo(p.panDeg, p.tiltDeg, 24, 23), cam.zoomTo(p.zoomRatio)]);
    await sleep(400);
    await cam.presetSet(slot);
    logger.info('preset', `stored "${p.name}" into camera slot ${slot}`, p.cameraId);
    return presets.update(id, { cameraSlot: slot });
  });
  handle('presets:export', async (e, cameraId?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win!, {
      title: 'Export presets',
      defaultPath: `ezy-ctrl-presets-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const data = presets.exportJson(cameraId);
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
    logger.info('preset', `exported ${data.presets.length} presets to ${r.filePath}`);
    return r.filePath;
  });
  handle('presets:import', async (e, cameraId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const r = await dialog.showOpenDialog(win!, {
      title: 'Import presets',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return 0;
    const n = presets.import(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')), cameraId);
    logger.info('preset', `imported ${n} presets from ${r.filePaths[0]}`, cameraId);
    return n;
  });

  // ---- settings, mappings, OSC ----
  handle('settings:get', () => settings.get());
  handle('settings:set', async (_e, patch: Partial<Settings>) => {
    const s = settings.set(patch);
    await applyOsc();
    return s;
  });
  handle('mappings:list', () => mappings.list());
  handle('mappings:save', (_e, list: Mapping[]) => {
    const saved = mappings.save(list);
    logger.info('app', `saved ${saved.length} mappings`);
    return saved;
  });
  handle('mappings:reset', () => mappings.resetToDefaults());
  handle('osc:status', () => oscStatusOf(osc));
  handle('osc:send', (_e, address: string, args: (number | string | boolean)[]) => {
    const s = settings.get().osc;
    if (!s.feedbackEnabled || !s.feedbackHost) return false;
    osc.send(s.feedbackHost, s.feedbackPort, address, args);
    return true;
  });

  // ---- app info, updates ----
  handle('app:info', (): AppInfo => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged, electron: process.versions.electron }));
  handle('update:status', () => updater.status);
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.install());

  // ---- log ----
  handle('log:list', () => logger.list());
  handle('log:clear', () => logger.clear());
  handle('log:reveal', () => {
    if (logger.filePath) shell.showItemInFolder(logger.filePath);
    return logger.filePath;
  });
  handle('log:report', (_e, level: LogLevel, message: string) => {
    logger.log(level === 'error' || level === 'warn' ? level : 'info', 'ui', message);
  });
}
