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
const pct = (v: number) => clamp(Math.round(v), 0, 100);
/** `00 00 0p 0q` two-nibble value used by most "direct" image commands. */
const nib2 = (v: number): number[] => [0x00, 0x00, (v >> 4) & 0x0f, v & 0x0f];

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

/** Shutter index -> label, from the OBSBOT inquiry table (0x09 … 0x22). */
export const SHUTTER_LABELS: Record<number, string> = {
  0x09: '1/8000', 0x0a: '1/6400', 0x0b: '1/5000', 0x0c: '1/4000', 0x0d: '1/3200', 0x0e: '1/2500', 0x0f: '1/2000', 0x10: '1/1600',
  0x11: '1/1250', 0x12: '1/1000', 0x13: '1/800', 0x14: '1/640', 0x15: '1/500', 0x16: '1/400', 0x17: '1/320', 0x18: '1/240',
  0x19: '1/200', 0x1a: '1/160', 0x1b: '1/120', 0x1c: '1/100', 0x1d: '1/80', 0x1e: '1/60', 0x1f: '1/50', 0x20: '1/40', 0x21: '1/30', 0x22: '1/25',
};

/** Exposure compensation index 0-18 -> EV. */
export const EXP_COMP_EV = [-3, -2.7, -2.3, -2, -1.7, -1.3, -1, -0.7, -0.3, 0, 0.3, 0.7, 1, 1.3, 1.7, 2, 2.3, 2.7, 3];

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
  focusDirect: (v: number) => pkt(0x01, 0x04, 0x48, ...toNibbles16(pct(v))),

  // ---- camera-side presets (0-255) ----
  presetSet: (n: number) => pkt(0x01, 0x04, 0x3f, 0x01, n & 0xff),
  presetRecall: (n: number) => pkt(0x01, 0x04, 0x3f, 0x02, n & 0xff),
  presetReset: (n: number) => pkt(0x01, 0x04, 0x3f, 0x00, n & 0xff),

  // ---- white balance / colour ----
  /** 0 auto, 1 daylight, 2 fluorescent, 3 one-push, 4 tungsten, 5 manual, 6 cloudy */
  wbMode: (p: number) => pkt(0x01, 0x04, 0x35, clamp(Math.round(p), 0, 6)),
  wbOnePush: () => pkt(0x01, 0x04, 0x10, 0x05),
  rGainUp: () => pkt(0x01, 0x04, 0x03, 0x02),
  rGainDown: () => pkt(0x01, 0x04, 0x03, 0x03),
  bGainUp: () => pkt(0x01, 0x04, 0x04, 0x02),
  bGainDown: () => pkt(0x01, 0x04, 0x04, 0x03),
  colorTempReset: () => pkt(0x01, 0x04, 0x20, 0x00),
  /** 2000-10000 K as four nibbles of the Kelvin value. */
  colorTempDirect: (k: number) => pkt(0x01, 0x04, 0x20, ...toNibbles16(clamp(Math.round(k), 2000, 10000))),

  // ---- exposure ----
  exposureAuto: (auto: boolean) => pkt(0x01, 0x04, 0x39, auto ? 0x00 : 0x03),
  gainUp: () => pkt(0x01, 0x04, 0x0c, 0x02),
  gainDown: () => pkt(0x01, 0x04, 0x0c, 0x03),
  shutterUp: () => pkt(0x01, 0x04, 0x0a, 0x02),
  shutterDown: () => pkt(0x01, 0x04, 0x0a, 0x03),
  backlight: (on: boolean) => pkt(0x01, 0x04, 0x33, on ? 0x02 : 0x03),
  expCompReset: () => pkt(0x01, 0x04, 0x0e, 0x00),
  /** index 0-18, see EXP_COMP_EV */
  expCompDirect: (idx: number) => pkt(0x01, 0x04, 0x4e, ...nib2(clamp(Math.round(idx), 0, 18))),
  /** 0 off, 1 50 Hz, 2 60 Hz */
  flicker: (p: number) => pkt(0x01, 0x04, 0x23, clamp(Math.round(p), 0, 2)),

  // ---- image ----
  /** 0 standard, 1 outdoor, 2 pastel, 3 custom */
  style: (p: number) => pkt(0x01, 0x04, 0x40, clamp(Math.round(p), 0, 3)),
  brightDirect: (v: number) => pkt(0x01, 0x04, 0x4d, ...nib2(pct(v))),
  contrastDirect: (v: number) => pkt(0x01, 0x04, 0xa2, ...nib2(pct(v))),
  saturationDirect: (v: number) => pkt(0x01, 0x04, 0xa3, ...nib2(pct(v))),
  sharpnessDirect: (v: number) => pkt(0x01, 0x04, 0xa4, ...nib2(pct(v))),
  hueDirect: (v: number) => pkt(0x01, 0x04, 0xa5, ...nib2(pct(v))),

  // ---- video ----
  record: (on: boolean) => pkt(0x01, 0x04, 0x66, on ? 0x01 : 0x00),
  /** vertical = portrait */
  orientation: (vertical: boolean) => pkt(0x01, 0x04, 0x67, vertical ? 0x01 : 0x00),

  // ---- AI ----
  aiTrack: (on: boolean) => pkt(0x01, 0x8e, 0x00, on ? 0x02 : 0x03),
  aiTrackMode: (multi: boolean) => pkt(0x01, 0x8e, 0x01, multi ? 0x01 : 0x00),
  /** preset 0 super lazy, 1 lazy, 2 slow, 3 fast, 4 crazy, 5 custom (with pan/tilt 1-10). */
  aiTrackSpeed: (preset: number, panSpeedCustom = 5, tiltSpeedCustom = 5) => {
    const p = clamp(Math.round(preset), 0, 5);
    const custom = p === 5;
    return pkt(0x01, 0x8e, 0x02, p, custom ? 0x00 : 0x01, clamp(Math.round(panSpeedCustom), 1, 10), custom ? 0x00 : 0x01, clamp(Math.round(tiltSpeedCustom), 1, 10));
  },
  aiOnlyMe: (on: boolean) => pkt(0x01, 0x8e, 0x04, on ? 0x01 : 0x00),
  /** Single-person: 0 none, 1 close-up, 2 half body, 3 above knees, 4 nine-head, 5 full body, 6/7 long shot. */
  aiAutoZoom: (level: number) => pkt(0x01, 0x8e, 0x03, clamp(Math.round(level), 0, 7)),
};

export const inq = {
  panTilt: () => pkt(0x09, 0x06, 0x12),
  zoom: () => pkt(0x09, 0x04, 0x47),
  focusMode: () => pkt(0x09, 0x04, 0x38),
  focusPosition: () => pkt(0x09, 0x04, 0x48),
  exposureMode: () => pkt(0x09, 0x04, 0x39),
  shutter: () => pkt(0x09, 0x04, 0x4a),
  gain: () => pkt(0x09, 0x04, 0x4c),
  backlight: () => pkt(0x09, 0x04, 0x33),
  expComp: () => pkt(0x09, 0x04, 0x4e),
  flicker: () => pkt(0x09, 0x04, 0x55),
  style: () => pkt(0x09, 0x04, 0x40),
  bright: () => pkt(0x09, 0x04, 0x4d),
  contrast: () => pkt(0x09, 0x04, 0xa2),
  saturation: () => pkt(0x09, 0x04, 0xa3),
  sharpness: () => pkt(0x09, 0x04, 0xa4),
  hue: () => pkt(0x09, 0x04, 0xa5),
  wbMode: () => pkt(0x09, 0x04, 0x35),
  rGain: () => pkt(0x09, 0x04, 0x43),
  bGain: () => pkt(0x09, 0x04, 0x44),
  colorTemp: () => pkt(0x09, 0x04, 0x20),
  record: () => pkt(0x09, 0x04, 0x66),
  orientation: () => pkt(0x09, 0x04, 0x67),
  track: () => pkt(0x09, 0x8e, 0x00),
  trackMode: () => pkt(0x09, 0x8e, 0x01),
  trackSpeed: () => pkt(0x09, 0x8e, 0x02),
  autoZoom: () => pkt(0x09, 0x8e, 0x03),
  onlyMe: () => pkt(0x09, 0x8e, 0x04),
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
  /** Replies where 02 = on, 03 = off (focus auto, track, backlight). */
  onOff23: (data: Uint8Array) => data[0] === 0x02,
  /** Replies where 01 = on, 00 = off (record, orientation, only-me, multi-person). */
  onOff01: (data: Uint8Array) => data[0] === 0x01,
  /** Single-byte value replies (modes, style, flicker). */
  byte: (data: Uint8Array) => data[0] ?? 0,
  /** `00 00 0p 0q` two-nibble values (bright, contrast, exp comp, shutter, gain, R/B gain). */
  nib2: (data: Uint8Array) => {
    if (data.length < 4) throw new Error('short reply');
    return ((data[2] & 0x0f) << 4) | (data[3] & 0x0f);
  },
  /** Four-nibble unsigned values (focus position, colour temperature). */
  nib4: (data: Uint8Array) => {
    if (data.length < 4) throw new Error('short reply');
    return fromNibbles16(data, 0) & 0xffff;
  },
  trackSpeed: (data: Uint8Array) => ({
    preset: data[0] ?? 3,
    panAuto: data[1] === 0x01,
    panSpeed: data[2] ?? 5,
    tiltAuto: data[3] === 0x01,
    tiltSpeed: data[4] ?? 5,
  }),
};
