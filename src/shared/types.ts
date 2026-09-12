export type VideoSource = 'rtsp' | 'ndi' | 'srt' | 'webui' | 'demo';

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

export interface CameraStatus {
  id: string;
  connected: boolean;
  lastError?: string;
  latencyMs?: number;
  position?: Position;
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
      return '';
  }
}
