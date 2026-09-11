export type VideoSource = 'rtsp' | 'ndi' | 'srt' | 'webui';

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
      return '';
  }
}
