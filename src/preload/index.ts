import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Mapping } from '../shared/mapping';
import type {
  AppInfo,
  CameraConfig,
  CameraFullState,
  CameraInput,
  CameraSet,
  CameraStatus,
  JogDir,
  LogEntry,
  LogLevel,
  NdiFrame,
  NdiSource,
  NdiStateMessage,
  NdiStatus,
  OscIncomingMessage,
  OscStatus,
  Position,
  Preset,
  PresetPatch,
  RecallSpeed,
  Settings,
  TestResult,
  UpdateStatus,
  VideoEvent,
  ZoomDir,
} from '../shared/types';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const on = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

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
    set: (id: string, s: CameraSet) => invoke<void>('camera:set', id, s),
    fullState: (id: string) => invoke<CameraFullState>('camera:fullState', id),
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
  /** The camera's own VISCA preset slots (0-255). */
  cameraPreset: {
    recall: (id: string, n: number) => invoke<void>('preset:recall', id, n),
    set: (id: string, n: number) => invoke<void>('preset:set', id, n),
  },
  /** App-side presets: unlimited, recalled with absolute moves. */
  presets: {
    list: (cameraId?: string) => invoke<Preset[]>('presets:list', cameraId),
    save: (cameraId: string, name: string, thumbnail?: string) => invoke<Preset>('presets:save', cameraId, name, thumbnail),
    recall: (id: string, speed: RecallSpeed) => invoke<void>('presets:recall', id, speed),
    update: (id: string, patch: PresetPatch) => invoke<Preset>('presets:update', id, patch),
    updatePosition: (id: string) => invoke<Preset>('presets:updatePosition', id),
    remove: (id: string) => invoke<void>('presets:remove', id),
    removeMany: (ids: string[]) => invoke<number>('presets:removeMany', ids),
    reorder: (cameraId: string, ids: string[]) => invoke<Preset[]>('presets:reorder', cameraId, ids),
    mirror: (id: string, slot: number) => invoke<Preset>('presets:mirror', id, slot),
    export: (cameraId?: string) => invoke<string | null>('presets:export', cameraId),
    import: (cameraId: string) => invoke<number>('presets:import', cameraId),
  },
  log: {
    list: () => invoke<LogEntry[]>('log:list'),
    clear: () => invoke<void>('log:clear'),
    reveal: () => invoke<string | null>('log:reveal'),
    report: (level: LogLevel, message: string) => invoke<void>('log:report', level, message),
    onEntry: (cb: (e: LogEntry) => void) => on<LogEntry>('log:entry', cb),
  },
  settings: {
    get: () => invoke<Settings>('settings:get'),
    set: (patch: Partial<Settings>) => invoke<Settings>('settings:set', patch),
  },
  mappings: {
    list: () => invoke<Mapping[]>('mappings:list'),
    save: (list: Mapping[]) => invoke<Mapping[]>('mappings:save', list),
    reset: () => invoke<Mapping[]>('mappings:reset'),
  },
  osc: {
    status: () => invoke<OscStatus>('osc:status'),
    /** Sends to the configured feedback target; resolves false when feedback is off. */
    send: (address: string, args: (number | string | boolean)[]) => invoke<boolean>('osc:send', address, args),
    onMessage: (cb: (m: OscIncomingMessage) => void) => on<OscIncomingMessage>('osc:message', cb),
    onStatus: (cb: (s: OscStatus) => void) => on<OscStatus>('osc:status', cb),
  },
  onStatus: (cb: (s: CameraStatus) => void) => on<CameraStatus>('camera:status', cb),
  video: {
    subscribe: (id: string) => invoke<void>('video:subscribe', id),
    unsubscribe: (id: string) => invoke<void>('video:unsubscribe', id),
    onEvent: (cb: (ev: VideoEvent) => void) => on<VideoEvent>('video:event', cb),
  },
  ndi: {
    status: () => invoke<NdiStatus>('ndi:status'),
    sources: (extraIp?: string) => invoke<NdiSource[]>('ndi:sources', extraIp),
    subscribe: (id: string) => invoke<void>('ndi:subscribe', id),
    unsubscribe: (id: string) => invoke<void>('ndi:unsubscribe', id),
    focus: (id: string | null) => invoke<void>('ndi:focus', id),
    onFrame: (cb: (f: NdiFrame) => void) => on<NdiFrame>('ndi:frame', cb),
    onState: (cb: (s: NdiStateMessage) => void) => on<NdiStateMessage>('ndi:state', cb),
  },
  app: {
    info: () => invoke<AppInfo>('app:info'),
  },
  update: {
    status: () => invoke<UpdateStatus>('update:status'),
    check: () => invoke<UpdateStatus>('update:check'),
    install: () => invoke<void>('update:install'),
    onStatus: (cb: (s: UpdateStatus) => void) => on<UpdateStatus>('update:status', cb),
  },
  env: {
    autotest: process.env.EZY_AUTOTEST ?? '',
  },
};

export type EzyApi = typeof api;

contextBridge.exposeInMainWorld('ezy', api);
