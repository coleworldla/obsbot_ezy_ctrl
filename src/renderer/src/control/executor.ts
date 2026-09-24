/**
 * Runs action invocations (from keyboard, MIDI or OSC) against the app: one place that knows
 * how to jog, zoom, recall presets, toggle tracking, set tally, and so on.
 */
import { oscSlug, viscaZoomSpeed, ZOOM_SPEED_MAX } from '../../../shared/mapping';
import type { Invocation } from '../../../shared/mapping';
import type { CameraConfig, CameraStatus, JogDir, Preset, Tally } from '../../../shared/types';

export interface Speed {
  pan: number;
  tilt: number;
  /** Zoom tele / wide speed, 1 … ZOOM_SPEED_MAX (see viscaZoomSpeed). */
  zoom: number;
}

export interface CamState {
  tracking: boolean;
  recording: boolean;
  portrait: boolean;
}

export interface ExecContext {
  cameras: CameraConfig[];
  selectedId: string | null;
  status: Record<string, CameraStatus>;
  presets: Preset[];
  speed: Speed;
  /** Takes an updater too, so several speed messages arriving before the next render all count. */
  setSpeed: (s: Speed | ((prev: Speed) => Speed)) => void;
  selectCamera: (id: string) => void;
  recall: (p: Preset) => void;
  savePreset: (cameraId: string) => Promise<unknown>;
  clearActive: (cameraId: string) => void;
  camState: Record<string, CamState>;
  setCamState: (cameraId: string, patch: Partial<CamState>) => void;
  setTally: (cameraId: string, tally: Tally) => void;
  toggleLog: () => void;
  toggleMapping: () => void;
  togglePanel: () => void;
}

const DIRS: Record<string, JogDir> = {
  'ptz.up': 'up',
  'ptz.down': 'down',
  'ptz.left': 'left',
  'ptz.right': 'right',
  'ptz.upleft': 'upleft',
  'ptz.upright': 'upright',
  'ptz.downleft': 'downleft',
  'ptz.downright': 'downright',
};

const DEAD_ZONE = 0.08;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fire = (p: Promise<unknown>) => p.catch(() => undefined);

function dirFrom(px: number, ty: number): JogDir {
  if (px === 0 && ty === 0) return 'stop';
  if (px === 0) return ty > 0 ? 'up' : 'down';
  if (ty === 0) return px > 0 ? 'right' : 'left';
  if (ty > 0) return px > 0 ? 'upright' : 'upleft';
  return px > 0 ? 'downright' : 'downleft';
}

interface Axis {
  pan: number;
  tilt: number;
  dir: JogDir;
  ps: number;
  ts: number;
}

export class ActionExecutor {
  private readonly axes = new Map<string, Axis>();
  private readonly zoomTimers = new Map<string, number>();
  private readonly zoomPending = new Map<string, number>();

  constructor(private readonly ctx: () => ExecContext) {}

  run(inv: Invocation): void {
    const c = this.ctx();
    switch (inv.actionId) {
      case 'cam.select': {
        if (inv.phase !== 'press') return;
        const target = inv.cameraName ? c.cameras.find((x) => oscSlug(x.name) === inv.cameraName) : c.cameras[(inv.arg ?? 1) - 1];
        if (target) c.selectCamera(target.id);
        return;
      }
      case 'log.toggle':
        if (inv.phase === 'press') c.toggleLog();
        return;
      case 'mapping.toggle':
        if (inv.phase === 'press') c.toggleMapping();
        return;
      case 'panel.toggle':
        if (inv.phase === 'press') c.togglePanel();
        return;
    }

    const cam = inv.cameraName ? c.cameras.find((x) => oscSlug(x.name) === inv.cameraName) : inv.camera ? c.cameras[inv.camera - 1] : c.cameras.find((x) => x.id === c.selectedId);
    if (!cam) return;
    const id = cam.id;
    const online = c.status[id]?.connected ?? false;

    if (inv.actionId in DIRS) {
      if (inv.phase === 'value' || !online) return;
      c.clearActive(id);
      fire(window.ezy.ptz.drive(id, inv.phase === 'press' ? DIRS[inv.actionId] : 'stop', c.speed.pan, c.speed.tilt));
      return;
    }

    switch (inv.actionId) {
      case 'tally.pgm':
      case 'tally.pvw':
      case 'tally.clear':
        if (inv.phase !== 'press') return;
        c.setTally(id, inv.actionId === 'tally.pgm' ? 1 : inv.actionId === 'tally.pvw' ? 2 : 0);
        return;
      case 'ptz.home':
        if (inv.phase === 'press' && online) {
          c.clearActive(id);
          fire(window.ezy.ptz.home(id));
        }
        return;
      case 'ptz.pan':
      case 'ptz.tilt': {
        if (inv.phase !== 'value' || inv.value === undefined) return;
        const v = inv.unit === 'normalized' ? inv.value * 2 - 1 : clamp(inv.value, -1, 1);
        this.axis(c, id, inv.actionId === 'ptz.pan' ? 'pan' : 'tilt', v, online);
        return;
      }
      case 'ptz.speed': {
        if (inv.phase !== 'value' || inv.value === undefined) return;
        const pan = inv.unit === 'normalized' ? Math.round(1 + inv.value * 23) : clamp(Math.round(inv.value), 1, 24);
        c.setSpeed((s) => ({ ...s, pan, tilt: Math.max(1, Math.round((pan * 23) / 24)) }));
        return;
      }
      case 'ptz.speed.up':
      case 'ptz.speed.down': {
        if (inv.phase !== 'press') return;
        const d = inv.actionId === 'ptz.speed.up' ? 1 : -1;
        c.setSpeed((s) => ({ ...s, pan: clamp(s.pan + d, 1, 24), tilt: clamp(s.tilt + d, 1, 23) }));
        return;
      }
      case 'zoom.speed': {
        if (inv.phase !== 'value' || inv.value === undefined) return;
        const zoom = inv.unit === 'normalized' ? Math.round(1 + inv.value * (ZOOM_SPEED_MAX - 1)) : clamp(Math.round(inv.value), 1, ZOOM_SPEED_MAX);
        c.setSpeed((s) => ({ ...s, zoom }));
        return;
      }
      case 'zoom.speed.up':
      case 'zoom.speed.down': {
        if (inv.phase !== 'press') return;
        const d = inv.actionId === 'zoom.speed.up' ? 1 : -1;
        c.setSpeed((s) => ({ ...s, zoom: clamp(s.zoom + d, 1, ZOOM_SPEED_MAX) }));
        return;
      }
      case 'zoom.level': {
        if (inv.phase !== 'value' || inv.value === undefined || !online) return;
        const ratio = inv.unit === 'normalized' ? 1 + inv.value * 11 : clamp(inv.value, 1, 12);
        this.zoomTo(c, id, ratio);
        return;
      }
      case 'zoom.tele':
      case 'zoom.wide':
        if (inv.phase === 'value' || !online) return;
        c.clearActive(id);
        fire(window.ezy.zoom.drive(id, inv.phase === 'press' ? (inv.actionId === 'zoom.tele' ? 'tele' : 'wide') : 'stop', viscaZoomSpeed(c.speed.zoom)));
        return;
      case 'preset.recall': {
        if (inv.phase !== 'press' || !online) return;
        const list = c.presets.filter((p) => p.cameraId === id);
        const p = inv.presetName ? list.find((x) => oscSlug(x.name) === inv.presetName) : list[(inv.arg ?? 1) - 1];
        if (p) c.recall(p);
        return;
      }
      case 'preset.save':
        if (inv.phase === 'press' && online) void c.savePreset(id);
        return;
      case 'ai.track':
      case 'record':
      case 'orientation': {
        // Keyboard/MIDI buttons toggle on press; OSC (and CC) may carry an explicit 0/1.
        if (inv.phase === 'release' && inv.value === undefined) return;
        if (!online) return;
        const key = inv.actionId === 'ai.track' ? 'tracking' : inv.actionId === 'record' ? 'recording' : 'portrait';
        const cur = c.camState[id]?.[key] ?? false;
        const next = inv.value !== undefined ? inv.value > 0 : !cur;
        if (next === cur && inv.value !== undefined) return;
        c.setCamState(id, { [key]: next });
        const setKey = inv.actionId === 'ai.track' ? 'track' : inv.actionId === 'record' ? 'record' : 'portrait';
        fire(window.ezy.camera.set(id, { key: setKey, value: next }));
        return;
      }
      case 'focus.push':
        if (inv.phase === 'press' && online) fire(window.ezy.focusPush(id));
        return;
    }
  }

  private axis(c: ExecContext, id: string, which: 'pan' | 'tilt', v: number, online: boolean): void {
    const a = this.axes.get(id) ?? { pan: 0, tilt: 0, dir: 'stop' as JogDir, ps: 1, ts: 1 };
    a[which] = v;
    const px = Math.abs(a.pan) < DEAD_ZONE ? 0 : Math.sign(a.pan);
    const ty = Math.abs(a.tilt) < DEAD_ZONE ? 0 : Math.sign(a.tilt);
    const dir = dirFrom(px, ty);
    const ps = clamp(Math.round(Math.abs(a.pan) * 24), 1, 24);
    const ts = clamp(Math.round(Math.abs(a.tilt) * 23), 1, 23);
    if (dir !== a.dir || ps !== a.ps || ts !== a.ts) {
      a.dir = dir;
      a.ps = ps;
      a.ts = ts;
      if (online) {
        c.clearActive(id);
        fire(window.ezy.ptz.drive(id, dir, ps, ts));
      }
    }
    this.axes.set(id, a);
  }

  /** Coalesce rapid fader moves into one command every 80 ms. */
  private zoomTo(c: ExecContext, id: string, ratio: number): void {
    this.zoomPending.set(id, ratio);
    if (this.zoomTimers.has(id)) return;
    this.zoomTimers.set(
      id,
      window.setTimeout(() => {
        this.zoomTimers.delete(id);
        const r = this.zoomPending.get(id);
        if (r === undefined) return;
        c.clearActive(id);
        fire(window.ezy.zoom.direct(id, Math.round(r * 10) / 10));
      }, 80),
    );
  }
}
