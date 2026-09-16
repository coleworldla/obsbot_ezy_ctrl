/** 'webcam' = any system video device (Tail 2 over USB in UVC mode, or an NDI source via NDI Tools Webcam Input); videoUrl holds the deviceId. */
export type VideoSource = 'rtsp' | 'ndi' | 'srt' | 'webui' | 'demo' | 'webcam';

/** Messages from the main-process video manager to the renderer (channel 'video:event'). */
export type VideoEvent =
  | { kind: 'start'; id: string; session: number; codec: string | null; init: Uint8Array }
  | { kind: 'segment'; id: string; session: number; data: Uint8Array }
  | { kind: 'end'; id: string; session: number; reason: string };

export interface CameraConfig {
  id: string;
  name: string;
  host: string;
  viscaPort: number;
  videoSource: VideoSource;
  videoUrl: string;
}

export type CameraInput = Omit<CameraConfig, 'id'>;

export interface Position {
  panDeg: number;
  tiltDeg: number;
  zoomRatio: number;
}

/** State polled every couple of seconds so the UI mirrors what the camera is really doing. */
export interface CameraLiveState {
  track: boolean;
  trackMode: 'single' | 'group';
  record: boolean;
  portrait: boolean;
  focusAuto: boolean;
  exposureAuto: boolean;
  wbMode: number;
}

/** Everything else, fetched when the camera panel opens and after each change. */
export interface CameraImageState {
  trackSpeed: number; // 0 super lazy … 4 crazy, 5 custom
  autoZoom: number; // 0 none, 1 close-up … 7 long shot 2
  onlyMe: boolean;
  focusPos: number; // 0-100
  expComp: number; // index 0-18 (-3 … +3 EV)
  backlight: boolean;
  flicker: number; // 0 off, 1 50 Hz, 2 60 Hz
  shutter: number; // shutter index (see SHUTTER_LABELS)
  gain: number; // ISO / 100
  colorTemp: number; // K
  rGain: number;
  bGain: number;
  style: number; // 0 standard, 1 outdoor, 2 pastel, 3 custom
  bright: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  hue: number;
}

export type CameraFullState = CameraLiveState &
  CameraImageState & {
    /** Inquiries this camera did not answer; their values above are defaults or last commanded values. */
    unsupported: string[];
  };

export type CameraSet =
  | { key: 'track' | 'onlyMe' | 'focusAuto' | 'exposureAuto' | 'backlight' | 'record' | 'portrait'; value: boolean }
  | { key: 'trackMode'; value: 'single' | 'group' }
  | { key: 'trackSpeed' | 'autoZoom' | 'flicker' | 'wbMode' | 'style' | 'expComp' | 'focusPos' | 'colorTemp' | 'bright' | 'contrast' | 'saturation' | 'sharpness' | 'hue'; value: number }
  | { key: 'focusPush' | 'wbPush' | 'shutterUp' | 'shutterDown' | 'gainUp' | 'gainDown' | 'rGainUp' | 'rGainDown' | 'bGainUp' | 'bGainDown' | 'expCompReset' | 'colorTempReset' };

/** 0 = off, 1 = program (red), 2 = preview (green). */
export type Tally = 0 | 1 | 2;

export interface CameraStatus {
  id: string;
  connected: boolean;
  lastError?: string;
  latencyMs?: number;
  position?: Position;
  state?: CameraLiveState;
  updatedAt: number;
}

export type JogDir =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'upleft'
  | 'upright'
  | 'downleft'
  | 'downright'
  | 'stop';

export type ZoomDir = 'tele' | 'wide' | 'stop';

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  position?: Position;
  error?: string;
}

/** An app-side preset: exact pan/tilt/zoom, recalled with an absolute move. No count limit. */
export interface Preset {
  id: string;
  cameraId: string;
  name: string;
  panDeg: number;
  tiltDeg: number;
  zoomRatio: number;
  /** JPEG data URL captured from the viewport when saved. */
  thumbnail?: string;
  order: number;
  /** Set when the preset has also been stored into one of the camera's own VISCA slots (0-255). */
  cameraSlot?: number;
  createdAt: number;
  updatedAt: number;
}

export type PresetInput = Pick<Preset, 'cameraId' | 'name' | 'panDeg' | 'tiltDeg' | 'zoomRatio' | 'thumbnail'>;
export type PresetPatch = Partial<Pick<Preset, 'name' | 'panDeg' | 'tiltDeg' | 'zoomRatio' | 'thumbnail' | 'cameraSlot'>>;

export interface RecallSpeed {
  pan: number;
  tilt: number;
}

export interface PresetExport {
  version: 1;
  app: 'obsbot-ezy-ctrl';
  exportedAt: string;
  presets: Preset[];
}

export interface Settings {
  osc: {
    enabled: boolean;
    listenPort: number;
    feedbackEnabled: boolean;
    feedbackHost: string;
    feedbackPort: number;
  };
  midi: {
    /** Input device names the user switched off. */
    disabledDevices: string[];
  };
  updates: {
    /** Check GitHub Releases on startup and download in the background. */
    autoCheck: boolean;
  };
}

export interface UpdateStatus {
  state: 'unsupported' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
  checkedAt?: number;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
  electron: string;
}

export interface OscStatus {
  listening: boolean;
  port: number;
  error: string | null;
  /** This machine's IPv4 addresses, for pointing controllers at it. */
  addresses: string[];
}

export interface OscIncomingMessage {
  address: string;
  args: (number | string | boolean)[];
  from: string;
}

// ---- NDI ----
export interface NdiStatus {
  available: boolean;
  runtimePath?: string;
  version?: string;
  error?: string;
}

export interface NdiSource {
  name: string;
  /** "ip:port" as reported by NDI discovery. */
  url: string;
}

export type NdiState = 'idle' | 'searching' | 'connecting' | 'receiving' | 'no-source' | 'error' | 'unavailable';

export interface NdiStateMessage {
  id: string;
  state: NdiState;
  message?: string;
  source?: NdiSource;
}

export interface NdiFrame {
  id: string;
  width: number;
  height: number;
  /** Bytes per row of RGBA/RGBX data. */
  stride: number;
  data: Uint8Array;
  ts: number;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  /** Where it came from: visca, video, preset, ipc, ui, app. */
  source: string;
  message: string;
  cameraId?: string;
}

export const DEFAULT_VISCA_PORT = 52381;
export const DEFAULT_RTSP_PORT = 8554;

export function defaultVideoUrl(source: VideoSource, host: string): string {
  switch (source) {
    case 'rtsp':
      return `rtsp://${host}:${DEFAULT_RTSP_PORT}/live`;
    case 'srt':
      return `srt://${host}:5000`;
    case 'webui':
      return `http://${host}/`;
    case 'ndi':
    case 'demo':
    case 'webcam':
      return '';
  }
}
