/**
 * The pan / tilt joystick's maths, apart from the screen so it can be tested: where the knob is <-> the jog the
 * camera gets. Positions are -1..1 per axis, up positive, never outside the unit circle. A full push moves at the
 * jog speed sliders, like the keys.
 */
import type { JogDir } from './types';

/** Below this share of a full push an axis stays still: a slightly-off release stops, a near-straight push is straight. */
export const STICK_DEAD_ZONE = 0.08;

export interface StickPos {
  x: number;
  y: number;
}

export interface Drive {
  dir: JogDir;
  pan: number;
  tilt: number;
}

const DIRS: Record<string, JogDir> = {
  '0,0': 'stop',
  '0,1': 'up',
  '0,-1': 'down',
  '-1,0': 'left',
  '1,0': 'right',
  '-1,1': 'upleft',
  '1,1': 'upright',
  '-1,-1': 'downleft',
  '1,-1': 'downright',
};
const SIGNS = Object.fromEntries(Object.entries(DIRS).map(([k, d]) => [d, k.split(',').map(Number)])) as Record<JogDir, [number, number]>;

/** No -0: it prints and compares oddly. */
const z = (v: number) => (v === 0 ? 0 : v);

function onCircle(x: number, y: number): StickPos {
  const m = Math.hypot(x, y);
  return m > 1 ? { x: z(x / m), y: z(y / m) } : { x: z(x), y: z(y) };
}

const axis = (v: number) => (Math.abs(v) < STICK_DEAD_ZONE ? 0 : Math.sign(v));

/** Knob position -> jog: each axis at its share of a full push; an idle axis gets speed 1 (VISCA needs one). */
export function stickToDrive(x: number, y: number, max: { pan: number; tilt: number }): Drive {
  const sx = axis(x);
  const sy = axis(y);
  return {
    dir: DIRS[`${sx},${sy}`],
    pan: sx ? Math.max(1, Math.round(Math.abs(x) * max.pan)) : 1,
    tilt: sy ? Math.max(1, Math.round(Math.abs(y) * max.tilt)) : 1,
  };
}

/** Pointer offset from the centre (screen pixels, down positive) -> knob position, held on the rim past the edge. */
export function stickFromOffset(dx: number, dy: number, radius: number): StickPos {
  return onCircle(dx / radius, -dy / radius);
}

/** A jog from anywhere (keys, MIDI, OSC) -> where the knob shows it: slider speed is a full push that way. */
export function driveToStick(dir: JogDir, pan: number, tilt: number, max: { pan: number; tilt: number }): StickPos {
  const [sx, sy] = SIGNS[dir];
  return onCircle(sx * Math.min(1, pan / max.pan), sy * Math.min(1, tilt / max.tilt));
}

type Send = (id: string, dir: JogDir, pan: number, tilt: number) => Promise<void>;
type Listener = (id: string, d: Drive) => void;

/** One road for every jog (joystick, keys, MIDI, OSC), so the joystick can show moves it did not make. */
export function createJogBus(send: Send) {
  const listeners = new Set<Listener>();
  return {
    drive(id: string, dir: JogDir, pan: number, tilt: number): Promise<void> {
      for (const l of listeners) l(id, { dir, pan, tilt });
      return send(id, dir, pan, tilt);
    },
    onDrive(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
