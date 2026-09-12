import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CameraConfig, CameraInput, CameraStatus, JogDir, Position, TestResult, VideoEvent, ZoomDir } from '../shared/types';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

export const api = {
  cameras: {
    list: () => invoke<CameraConfig[]>('cameras:list'),
    add: (input: CameraInput) => invoke<CameraConfig>('cameras:add', input),
    update: (cfg: CameraConfig) => invoke<CameraConfig>('cameras:update', cfg),
    remove: (id: string) => invoke<void>('cameras:remove', id),
  },
  camera: {
    test: (host: string, port: number) => invoke<TestResult>('camera:test', host, port),
    connect: (id: string) => invoke<CameraStatus>('camera:connect', id),
    disconnect: (id: string) => invoke<void>('camera:disconnect', id),
    statuses: () => invoke<CameraStatus[]>('camera:statuses'),
    position: (id: string) => invoke<Position>('camera:position', id),
  },
  ptz: {
    drive: (id: string, dir: JogDir, pan: number, tilt: number) => invoke<void>('ptz:drive', id, dir, pan, tilt),
    home: (id: string) => invoke<void>('ptz:home', id),
    absolute: (id: string, panDeg: number, tiltDeg: number, pan: number, tilt: number) =>
      invoke<void>('ptz:absolute', id, panDeg, tiltDeg, pan, tilt),
  },
  zoom: {
    drive: (id: string, dir: ZoomDir, speed: number) => invoke<void>('zoom:drive', id, dir, speed),
    direct: (id: string, ratio: number) => invoke<void>('zoom:direct', id, ratio),
  },
  focusPush: (id: string) => invoke<void>('focus:push', id),
  track: (id: string, on: boolean) => invoke<void>('ai:track', id, on),
  record: (id: string, on: boolean) => invoke<void>('record', id, on),
  orientation: (id: string, vertical: boolean) => invoke<void>('orientation', id, vertical),
  preset: {
    recall: (id: string, n: number) => invoke<void>('preset:recall', id, n),
    set: (id: string, n: number) => invoke<void>('preset:set', id, n),
  },
  onStatus: (cb: (s: CameraStatus) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, s: CameraStatus) => cb(s);
    ipcRenderer.on('camera:status', handler);
    return () => ipcRenderer.off('camera:status', handler);
  },
  video: {
    subscribe: (id: string) => invoke<void>('video:subscribe', id),
    unsubscribe: (id: string) => invoke<void>('video:unsubscribe', id),
    onEvent: (cb: (ev: VideoEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, ev: VideoEvent) => cb(ev);
      ipcRenderer.on('video:event', handler);
      return () => ipcRenderer.off('video:event', handler);
    },
  },
};

export type EzyApi = typeof api;

contextBridge.exposeInMainWorld('ezy', api);
