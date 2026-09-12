#!/usr/bin/env node
/**
 * A fake OBSBOT Tail 2 that answers VISCA over IP on UDP (default port 52381) for development.
 * It keeps a pan/tilt/zoom state, moves at a plausible speed, and answers the inquiries the app uses.
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
  vPan: 0, // steps per second (drive)
  vTilt: 0,
  vZoom: 0, // ratio x 1000 per second
  target: null, // { pan, tilt, speedSteps, done }
  focusAuto: true,
  track: false,
  rec: false,
  portrait: false,
  slots: new Map(),
};

const nib = (v) => {
  const x = v & 0xffff;
  return [(x >> 12) & 15, (x >> 8) & 15, (x >> 4) & 15, x & 15];
};
const fromNib = (b, o) => {
  const v = ((b[o] & 15) << 12) | ((b[o + 1] & 15) << 8) | ((b[o + 2] & 15) << 4) | (b[o + 3] & 15);
  return v >= 0x8000 ? v - 0x10000 : v;
};
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

  if (type === 0x0200) return send(0x0201, [0x01]); // reset sequence

  if (p[1] === 0x09) {
    // ---- inquiries ----
    if (p[2] === 0x06 && p[3] === 0x12) return reply([0x90, 0x50, ...nib(Math.round(state.pan)), ...nib(Math.round(state.tilt)), 0xff]);
    if (p[2] === 0x04 && p[3] === 0x47) return reply([0x90, 0x50, ...nib(Math.round(state.zoom)), 0xff]);
    if (p[2] === 0x04 && p[3] === 0x38) return reply([0x90, 0x50, state.focusAuto ? 2 : 3, 0xff]);
    if (p[2] === 0x04 && p[3] === 0x66) return reply([0x90, 0x50, state.rec ? 1 : 0, 0xff]);
    if (p[2] === 0x04 && p[3] === 0x67) return reply([0x90, 0x50, state.portrait ? 1 : 0, 0xff]);
    if (p[2] === 0x8e && p[3] === 0x00) return reply([0x90, 0x50, state.track ? 2 : 3, 0xff]);
    return reply([0x90, 0x60, 0x02, 0xff]);
  }

  // ---- commands: ACK now, completion when done ----
  reply([0x90, 0x41, 0xff]);
  const complete = () => reply([0x90, 0x51, 0xff]);

  if (p[2] === 0x06 && p[3] === 0x01) {
    const [vv, ww, h, v] = [p[4], p[5], p[6], p[7]];
    state.target = null;
    state.vPan = h === 1 ? -degPerSec(vv) / STEP_DEG : h === 2 ? degPerSec(vv) / STEP_DEG : 0;
    state.vTilt = v === 1 ? degPerSec(ww) / STEP_DEG : v === 2 ? -degPerSec(ww) / STEP_DEG : 0;
    log(`drive h=${h} v=${v} speed=${vv}/${ww}`);
    return complete();
  }
  if (p[2] === 0x06 && p[3] === 0x02) {
    const pan = clamp(fromNib(p, 6), -PAN_MAX, PAN_MAX);
    const tilt = clamp(fromNib(p, 10), TILT_MIN, TILT_MAX);
    state.vPan = state.vTilt = 0;
    state.target = { pan, tilt, speedSteps: degPerSec(p[4]) / STEP_DEG, done: complete };
    log(`absolute -> pan ${(pan * STEP_DEG).toFixed(1)} tilt ${(tilt * STEP_DEG).toFixed(1)} speed ${p[4]}`);
    return;
  }
  if (p[2] === 0x06 && p[3] === 0x04) {
    state.vPan = state.vTilt = 0;
    state.target = { pan: 0, tilt: 0, speedSteps: degPerSec(20) / STEP_DEG, done: complete };
    log('home');
    return;
  }
  if (p[2] === 0x04 && p[3] === 0x07) {
    const b = p[4];
    const speed = (b & 0x0f) + 1; // 1..8
    if (b === 0x00) state.vZoom = 0;
    else if (b === 0x02 || (b & 0xf0) === 0x20) state.vZoom = 800 * speed * 0.5;
    else if (b === 0x03 || (b & 0xf0) === 0x30) state.vZoom = -800 * speed * 0.5;
    return complete();
  }
  if (p[2] === 0x04 && p[3] === 0x47) {
    state.zoom = clamp(fromNib(p, 4), 1000, 12000);
    log(`zoom direct ${(state.zoom / 1000).toFixed(1)}x`);
    return complete();
  }
  if (p[2] === 0x04 && p[3] === 0x38) {
    state.focusAuto = p[4] === 0x02;
    return complete();
  }
  if (p[2] === 0x04 && p[3] === 0x66) {
    state.rec = p[4] === 0x01;
    log(`record ${state.rec}`);
    return complete();
  }
  if (p[2] === 0x04 && p[3] === 0x67) {
    state.portrait = p[4] === 0x01;
    return complete();
  }
  if (p[2] === 0x8e && p[3] === 0x00) {
    state.track = p[4] === 0x02;
    log(`track ${state.track}`);
    return complete();
  }
  if (p[2] === 0x04 && p[3] === 0x3f) {
    const slot = p[5];
    if (p[4] === 0x01) {
      state.slots.set(slot, { pan: state.pan, tilt: state.tilt, zoom: state.zoom });
      log(`preset set slot ${slot}`);
      return complete();
    }
    if (p[4] === 0x02) {
      const s = state.slots.get(slot);
      if (!s) return reply([0x90, 0x60, 0x41, 0xff]);
      state.target = { pan: s.pan, tilt: s.tilt, speedSteps: degPerSec(18) / STEP_DEG, done: complete };
      state.zoom = s.zoom;
      log(`preset recall slot ${slot}`);
      return;
    }
    if (p[4] === 0x00) {
      state.slots.delete(slot);
      return complete();
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
