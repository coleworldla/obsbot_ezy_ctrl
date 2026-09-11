/**
 * OBSBOT Tail 2 VISCA command builders and inquiry parsers.
 * Every function returns the raw VISCA payload (`81 ... FF`); the client adds the IP header.
 * Source: docs/protocol/visca-over-ip.md
 */
import type { JogDir } from '../../shared/types';
import {
  PAN_MAX_STEPS,
  TILT_MAX_STEPS,
  ZOOM_MAX,
  ZOOM_MIN,
  clamp,
  degToSteps,
  fromNibbles16,
  stepsToDeg,
  toNibbles16,
} from './packet';

const HEADER = 0x81;
const pkt = (...bytes: number[]): Buffer => Buffer.from([HEADER, ...bytes, 0xff]);

export const PAN_SPEED_MAX = 0x18; // 24
export const TILT_SPEED_MAX = 0x17; // 23

const panSpeed = (s: number) => clamp(Math.round(s), 1, PAN_SPEED_MAX);
const tiltSpeed = (s: number) => clamp(Math.round(s), 1, TILT_SPEED_MAX);
const zoomSpeed = (s: number) => clamp(Math.round(s), 0, 7);

/** [horizontal, vertical] direction bytes: 01 = left/up, 02 = right/down, 03 = stop. */
const DIR: Record<JogDir, [number, number]> = {
  up: [0x03, 0x01],
  down: [0x03, 0x02],
  left: [0x01, 0x03],
  right: [0x02, 0x03],
  upleft: [0x01, 0x01],
  upright: [0x02, 0x01],
  downleft: [0x01, 0x02],
  downright: [0x02, 0x02],
  stop: [0x03, 0x03],
};

export const cmd = {
  // ---- zoom ----
  zoomStop: () => pkt(0x01, 0x04, 0x07, 0x00),
  zoomTele: (speed?: number) =>
    pkt(0x01, 0x04, 0x07, speed === undefined ? 0x02 : 0x20 | zoomSpeed(speed)),
  zoomWide: (speed?: number) =>
    pkt(0x01, 0x04, 0x07, speed === undefined ? 0x03 : 0x30 | zoomSpeed(speed)),
  /** ratio 1.0 - 12.0 */
  zoomDirect: (ratio: number) =>
    pkt(0x01, 0x04, 0x47, ...toNibbles16(Math.round(clamp(ratio, ZOOM_MIN, ZOOM_MAX) * 1000))),

  // ---- pan / tilt ----
  ptDrive: (dir: JogDir, pan: number, tilt: number) => {
    const [h, v] = DIR[dir];
    return pkt(0x01, 0x06, 0x01, panSpeed(pan), tiltSpeed(tilt), h, v);
  },
  ptStop: (pan = 1, tilt = 1) => cmd.ptDrive('stop', pan, tilt),
  /** Absolute position in degrees; pan +-159.9, tilt +-62.85 (clamped). */
  ptAbsolute: (panDeg: number, tiltDeg: number, pan: number, tilt: number) =>
    pkt(
      0x01,
      0x06,
      0x02,
      panSpeed(pan),
      tiltSpeed(tilt),
      ...toNibbles16(degToSteps(panDeg, PAN_MAX_STEPS)),
      ...toNibbles16(degToSteps(tiltDeg, TILT_MAX_STEPS)),
    ),
  home: () => pkt(0x01, 0x06, 0x04),

  // ---- focus ----
  focusAuto: (auto: boolean) => pkt(0x01, 0x04, 0x38, auto ? 0x02 : 0x03),
  focusOnePush: () => pkt(0x01, 0x04, 0x18, 0x01),
  focusDirect: (v: number) => pkt(0x01, 0x04, 0x48, ...toNibbles16(clamp(Math.round(v), 0, 100))),

  // ---- camera-side presets (0-255) ----
  presetSet: (n: number) => pkt(0x01, 0x04, 0x3f, 0x01, n & 0xff),
  presetRecall: (n: number) => pkt(0x01, 0x04, 0x3f, 0x02, n & 0xff),
  presetReset: (n: number) => pkt(0x01, 0x04, 0x3f, 0x00, n & 0xff),

  // ---- video ----
  record: (on: boolean) => pkt(0x01, 0x04, 0x66, on ? 0x01 : 0x00),
  /** vertical = portrait */
  orientation: (vertical: boolean) => pkt(0x01, 0x04, 0x67, vertical ? 0x01 : 0x00),

  // ---- AI ----
  aiTrack: (on: boolean) => pkt(0x01, 0x8e, 0x00, on ? 0x02 : 0x03),
  aiTrackMode: (multi: boolean) => pkt(0x01, 0x8e, 0x01, multi ? 0x01 : 0x00),
  aiOnlyMe: (on: boolean) => pkt(0x01, 0x8e, 0x04, on ? 0x01 : 0x00),
  /** Single-person: 0 none, 1 close-up, 2 half body, 3 above knees, 4 nine-head, 5 full body, 6/7 long shot. */
  aiAutoZoom: (level: number) => pkt(0x01, 0x8e, 0x03, clamp(Math.round(level), 0, 7)),
};

export const inq = {
  panTilt: () => pkt(0x09, 0x06, 0x12),
  zoom: () => pkt(0x09, 0x04, 0x47),
  focusMode: () => pkt(0x09, 0x04, 0x38),
  focusPosition: () => pkt(0x09, 0x04, 0x48),
  record: () => pkt(0x09, 0x04, 0x66),
  orientation: () => pkt(0x09, 0x04, 0x67),
  track: () => pkt(0x09, 0x8e, 0x00),
  trackMode: () => pkt(0x09, 0x8e, 0x01),
};

/** Parsers take the data bytes between `90 50` and `FF`. */
export const parse = {
  panTilt: (data: Uint8Array) => {
    if (data.length < 8) throw new Error(`pan/tilt reply too short (${data.length} bytes)`);
    const panSteps = fromNibbles16(data, 0);
    const tiltSteps = fromNibbles16(data, 4);
    return { panSteps, tiltSteps, panDeg: stepsToDeg(panSteps), tiltDeg: stepsToDeg(tiltSteps) };
  },
  zoom: (data: Uint8Array) => {
    if (data.length < 4) throw new Error(`zoom reply too short (${data.length} bytes)`);
    return fromNibbles16(data, 0) / 1000;
  },
  /** Replies where 02 = on, 03 = off (focus auto, track). */
  onOff23: (data: Uint8Array) => data[0] === 0x02,
  /** Replies where 01 = on, 00 = off (record, orientation). */
  onOff01: (data: Uint8Array) => data[0] === 0x01,
};
