#!/usr/bin/env node
/**
 * A fake OBSBOT Tail 2 that answers VISCA over IP on UDP (default port 52381) for development.
 * It keeps pan/tilt/zoom plus tracking / focus / exposure / white balance / image state, moves at a
 * plausible speed, and answers every inquiry the app uses.
 *
 *   npm run fake-camera            # port 52381
 *   npm run fake-camera -- 52382   # another port for a second fake camera
 */
import dgram from 'node:dgram';

const port = Number(process.argv[2] ?? 52381);
const STEP_DEG = 0.075;
const PAN_MAX = 2132; // steps, 159.9 deg
const TILT_MIN = Math.round(-65 / STEP_DEG);
const TILT_MAX = Math.round(32 / STEP_DEG);

const state = {
  pan: 0,
  tilt: 0,
  zoom: 1000, // ratio x 1000
  vPan: 0,
  vTilt: 0,
  vZoom: 0,
  target: null,
  slots: new Map(),
  // camera settings
  track: false,
  trackMulti: false,
  trackSpeed: [3, 1, 5, 1, 5],
  autoZoom: 0,
  onlyMe: false,
  focusAuto: true,
  focusPos: 50,
  exposureAuto: true,
  shutter: 0x1e,
  gain: 4,
  backlight: false,
  expComp: 9,
  flicker: 0,
  wbMode: 0,
  rGain: 128,
  bGain: 128,
  colorTemp: 5500,
  style: 0,
  bright: 50,
  contrast: 50,
  saturation: 50,
  sharpness: 50,
  hue: 50,
  rec: false,
  portrait: false,
};

const nib = (v) => {
  const x = v & 0xffff;
  return [(x >> 12) & 15, (x >> 8) & 15, (x >> 4) & 15, x & 15];
};
const nib2 = (v) => [0, 0, (v >> 4) & 15, v & 15];
const fromNib = (b, o) => {
  const v = ((b[o] & 15) << 12) | ((b[o + 1] & 15) << 8) | ((b[o + 2] & 15) << 4) | (b[o + 3] & 15);
  return v >= 0x8000 ? v - 0x10000 : v;
};
const fromNib2 = (b, o) => ((b[o + 2] & 15) << 4) | (b[o + 3] & 15);
const frame = (type, seq, payload) => {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(payload.length, 2);
  b.writeUInt32BE(seq >>> 0, 4);
  Buffer.from(payload).copy(b, 8);
  return b;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const degPerSec = (speed) => 2 + speed * 4; // speed 1..24 -> 6..98 deg/s
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const socket = dgram.createSocket('udp4');

socket.on('message', (msg, rinfo) => {
  if (msg.length < 9) return;
  const type = msg.readUInt16BE(0);
  const seq = msg.readUInt32BE(4);
  const p = msg.subarray(8);
  const send = (t, payload) => socket.send(frame(t, seq, payload), rinfo.port, rinfo.address);
  const reply = (payload) => send(0x0111, payload);
  const ok = (...data) => reply([0x90, 0x50, ...data, 0xff]);

  if (type === 0x0200) return send(0x0201, [0x01]); // reset sequence

  if (p[1] === 0x09) {
    // ---- inquiries ----
    const cat = p[2];
    const c = p[3];
    if (cat === 0x06 && c === 0x12) return ok(...nib(Math.round(state.pan)), ...nib(Math.round(state.tilt)));
    if (cat === 0x8e) {
      if (c === 0x00) return ok(state.track ? 2 : 3);
      if (c === 0x01) return ok(state.trackMulti ? 1 : 0);
      if (c === 0x02) return ok(...state.trackSpeed);
      if (c === 0x03) return ok(state.autoZoom);
      if (c === 0x04) return ok(state.onlyMe ? 1 : 0);
    }
    if (cat === 0x04) {
      switch (c) {
        case 0x47: return ok(...nib(Math.round(state.zoom)));
        case 0x38: return ok(state.focusAuto ? 2 : 3);
        case 0x48: return ok(...nib(state.focusPos));
        case 0x39: return ok(state.exposureAuto ? 0 : 3);
        case 0x4a: return ok(...nib2(state.shutter));
        case 0x4c: return ok(...nib2(state.gain));
        case 0x33: return ok(state.backlight ? 2 : 3);
        case 0x4e: return ok(...nib2(state.expComp));
        case 0x55: return ok(state.flicker);
        case 0x40: return ok(state.style);
        case 0x4d: return ok(...nib2(state.bright));
        case 0xa2: return ok(...nib2(state.contrast));
        case 0xa3: return ok(...nib2(state.saturation));
        case 0xa4: return ok(...nib2(state.sharpness));
        case 0xa5: return ok(...nib2(state.hue));
        case 0x35: return ok(state.wbMode);
        case 0x43: return ok(...nib2(state.rGain));
        case 0x44: return ok(...nib2(state.bGain));
        case 0x20: return ok(...nib(state.colorTemp));
        case 0x66: return ok(state.rec ? 1 : 0);
        case 0x67: return ok(state.portrait ? 1 : 0);
      }
    }
    return reply([0x90, 0x60, 0x02, 0xff]);
  }

  // ---- commands: ACK now, completion when done ----
  reply([0x90, 0x41, 0xff]);
  const complete = () => reply([0x90, 0x51, 0xff]);
  const cat = p[2];
  const c = p[3];
  const v = p[4];

  if (cat === 0x06 && c === 0x01) {
    const [vv, ww, h, vert] = [p[4], p[5], p[6], p[7]];
    state.target = null;
    state.vPan = h === 1 ? -degPerSec(vv) / STEP_DEG : h === 2 ? degPerSec(vv) / STEP_DEG : 0;
    state.vTilt = vert === 1 ? degPerSec(ww) / STEP_DEG : vert === 2 ? -degPerSec(ww) / STEP_DEG : 0;
    log(`drive h=${h} v=${vert} speed=${vv}/${ww}`);
    return complete();
  }
  if (cat === 0x06 && c === 0x02) {
    const pan = clamp(fromNib(p, 6), -PAN_MAX, PAN_MAX);
    const tilt = clamp(fromNib(p, 10), TILT_MIN, TILT_MAX);
    state.vPan = state.vTilt = 0;
    state.target = { pan, tilt, speedSteps: degPerSec(p[4]) / STEP_DEG, done: complete };
    log(`absolute -> pan ${(pan * STEP_DEG).toFixed(1)} tilt ${(tilt * STEP_DEG).toFixed(1)} speed ${p[4]}`);
    return;
  }
  if (cat === 0x06 && c === 0x04) {
    state.vPan = state.vTilt = 0;
    state.target = { pan: 0, tilt: 0, speedSteps: degPerSec(20) / STEP_DEG, done: complete };
    log('home');
    return;
  }
  if (cat === 0x8e) {
    if (c === 0x00) state.track = v === 0x02;
    else if (c === 0x01) state.trackMulti = v === 0x01;
    else if (c === 0x02) state.trackSpeed = [p[4], p[5], p[6], p[7], p[8]];
    else if (c === 0x03) state.autoZoom = v;
    else if (c === 0x04) state.onlyMe = v === 0x01;
    log(`ai ${c.toString(16)} <- ${[...p.subarray(4, p.length - 1)].join(' ')}`);
    return complete();
  }
  if (cat === 0x04) {
    switch (c) {
      case 0x07: {
        const speed = (v & 0x0f) + 1;
        if (v === 0x00) state.vZoom = 0;
        else if (v === 0x02 || (v & 0xf0) === 0x20) state.vZoom = 400 * speed;
        else if (v === 0x03 || (v & 0xf0) === 0x30) state.vZoom = -400 * speed;
        return complete();
      }
      case 0x47: state.zoom = clamp(fromNib(p, 4), 1000, 12000); log(`zoom direct ${(state.zoom / 1000).toFixed(1)}x`); return complete();
      case 0x38: state.focusAuto = v === 0x02; log(`focus ${state.focusAuto ? 'auto' : 'manual'}`); return complete();
      case 0x18: log('one-push AF'); return complete();
      case 0x48: state.focusPos = clamp(fromNib(p, 4), 0, 100); state.focusAuto = false; log(`focus pos ${state.focusPos}`); return complete();
      case 0x39: state.exposureAuto = v === 0x00; log(`exposure ${state.exposureAuto ? 'auto' : 'manual'}`); return complete();
      case 0x0a: state.shutter = clamp(state.shutter + (v === 0x02 ? -1 : 1), 0x09, 0x22); log(`shutter idx ${state.shutter}`); return complete();
      case 0x0c: state.gain = clamp(state.gain + (v === 0x02 ? 1 : -1), 1, 64); log(`gain ${state.gain}`); return complete();
      case 0x33: state.backlight = v === 0x02; return complete();
      case 0x0e: if (v === 0x00) state.expComp = 9; else state.expComp = clamp(state.expComp + (v === 0x02 ? 1 : -1), 0, 18); return complete();
      case 0x4e: state.expComp = clamp(fromNib2(p, 4), 0, 18); log(`exp comp idx ${state.expComp}`); return complete();
      case 0x23: state.flicker = v; return complete();
      case 0x40: state.style = v; log(`style ${v}`); return complete();
      case 0x4d: state.bright = fromNib2(p, 4); return complete();
      case 0xa2: state.contrast = fromNib2(p, 4); return complete();
      case 0xa3: state.saturation = fromNib2(p, 4); return complete();
      case 0xa4: state.sharpness = fromNib2(p, 4); return complete();
      case 0xa5: state.hue = fromNib2(p, 4); return complete();
      case 0x35: state.wbMode = v; log(`wb mode ${v}`); return complete();
      case 0x10: log('one-push WB'); return complete();
      case 0x03: state.rGain = clamp(state.rGain + (v === 0x02 ? 1 : -1), 0, 255); return complete();
      case 0x04: state.bGain = clamp(state.bGain + (v === 0x02 ? 1 : -1), 0, 255); return complete();
      case 0x20: state.colorTemp = v === 0x00 ? 5500 : clamp(fromNib(p, 4) & 0xffff, 2000, 10000); log(`colour temp ${state.colorTemp}K`); return complete();
      case 0x66: state.rec = v === 0x01; log(`record ${state.rec}`); return complete();
      case 0x67: state.portrait = v === 0x01; log(`portrait ${state.portrait}`); return complete();
      case 0x3f: {
        const slot = p[5];
        if (v === 0x01) { state.slots.set(slot, { pan: state.pan, tilt: state.tilt, zoom: state.zoom }); log(`preset set slot ${slot}`); return complete(); }
        if (v === 0x02) {
          const s = state.slots.get(slot);
          if (!s) return reply([0x90, 0x60, 0x41, 0xff]);
          state.target = { pan: s.pan, tilt: s.tilt, speedSteps: degPerSec(18) / STEP_DEG, done: complete };
          state.zoom = s.zoom;
          log(`preset recall slot ${slot}`);
          return;
        }
        if (v === 0x00) { state.slots.delete(slot); return complete(); }
      }
    }
  }
  return complete();
});

// Physics at 50 Hz.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  if (state.target) {
    const t = state.target;
    const step = t.speedSteps * dt;
    const dp = t.pan - state.pan;
    const dtl = t.tilt - state.tilt;
    state.pan += Math.abs(dp) <= step ? dp : Math.sign(dp) * step;
    state.tilt += Math.abs(dtl) <= step ? dtl : Math.sign(dtl) * step;
    if (state.pan === t.pan && state.tilt === t.tilt) {
      state.target = null;
      t.done?.();
    }
  } else {
    state.pan = clamp(state.pan + state.vPan * dt, -PAN_MAX, PAN_MAX);
    state.tilt = clamp(state.tilt + state.vTilt * dt, TILT_MIN, TILT_MAX);
  }
  state.zoom = clamp(state.zoom + state.vZoom * dt, 1000, 12000);
}, 20);

socket.bind(port, '127.0.0.1', () => log(`fake Tail 2 listening on udp://127.0.0.1:${port} (VISCA over IP)`));
