import { ipcMain } from 'electron';
import type { CameraConfig, CameraInput, JogDir, ZoomDir } from '../shared/types';
import type { CameraManager } from './cameras';
import { CameraManager as Manager } from './cameras';
import type { CameraStore } from './store/cameras';
import type { VideoManager } from './video/manager';

export function registerIpc(store: CameraStore, manager: CameraManager, video: VideoManager): void {
  // ---- camera list ----
  ipcMain.handle('cameras:list', () => store.list());
  ipcMain.handle('cameras:add', async (_e, input: CameraInput) => {
    const cam = store.add(input);
    await manager.connect(cam.id).catch(() => undefined);
    return cam;
  });
  ipcMain.handle('cameras:update', async (_e, cfg: CameraConfig) => {
    const cam = store.update(cfg);
    await manager.reconnect(cam);
    video.update(cam);
    return cam;
  });
  ipcMain.handle('cameras:remove', (_e, id: string) => {
    manager.disconnect(id);
    video.stop(id);
    store.remove(id);
  });

  // ---- video ----
  ipcMain.handle('video:subscribe', (e, id: string) => {
    const cfg = store.get(id);
    if (cfg) video.subscribe(cfg, e.sender);
  });
  ipcMain.handle('video:unsubscribe', (e, id: string) => video.unsubscribe(id, e.sender));

  // ---- connection ----
  ipcMain.handle('camera:test', (_e, host: string, port: number) => Manager.test(host, port));
  ipcMain.handle('camera:connect', (_e, id: string) => manager.connect(id));
  ipcMain.handle('camera:disconnect', (_e, id: string) => manager.disconnect(id));
  ipcMain.handle('camera:statuses', () => manager.statuses());
  ipcMain.handle('camera:position', (_e, id: string) => manager.get(id).position());

  // ---- pan / tilt / zoom ----
  ipcMain.handle('ptz:drive', (_e, id: string, dir: JogDir, pan: number, tilt: number) =>
    manager.get(id).jog(dir, pan, tilt),
  );
  ipcMain.handle('ptz:home', (_e, id: string) => manager.get(id).home());
  ipcMain.handle('ptz:absolute', (_e, id: string, panDeg: number, tiltDeg: number, pan: number, tilt: number) =>
    manager.get(id).moveTo(panDeg, tiltDeg, pan, tilt),
  );
  ipcMain.handle('zoom:drive', (_e, id: string, dir: ZoomDir, speed: number) => manager.get(id).zoom(dir, speed));
  ipcMain.handle('zoom:direct', (_e, id: string, ratio: number) => manager.get(id).zoomTo(ratio));

  // ---- other actions ----
  ipcMain.handle('focus:push', (_e, id: string) => manager.get(id).focusOnePush());
  ipcMain.handle('ai:track', (_e, id: string, on: boolean) => manager.get(id).track(on));
  ipcMain.handle('record', (_e, id: string, on: boolean) => manager.get(id).record(on));
  ipcMain.handle('orientation', (_e, id: string, vertical: boolean) => manager.get(id).orientation(vertical));
  ipcMain.handle('preset:recall', (_e, id: string, n: number) => manager.get(id).presetRecall(n));
  ipcMain.handle('preset:set', (_e, id: string, n: number) => manager.get(id).presetSet(n));
}
