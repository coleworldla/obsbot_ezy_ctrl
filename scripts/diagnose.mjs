#!/usr/bin/env node
/**
 * Talk to a real Tail 2 and report what it answers: every VISCA inquiry the app uses, plus a
 * short pull of the video stream with the bundled ffmpeg.
 *
 *   npm run diagnose -- 10.0.0.42
 *   npm run diagnose -- 10.0.0.42 --video srt://10.0.0.42:5000
 *   npm run diagnose -- 10.0.0.42 --no-video
 */
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const host = args.find((a) => !a.startsWith('--'));
if (!host) {
  console.error('usage: diagnose.mjs <camera-ip> [--port 52381] [--video <url>] [--no-video]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const port = Number(opt('port', 52381));
const videoUrl = args.includes('--no-video') ? null : opt('video', `rtsp://${host}:8554/live`);

const frame = (type, seq, payload) => {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(payload.length, 2);
  b.writeUInt32BE(seq >>> 0, 4);
  Buffer.from(payload).copy(b, 8);
  return b;
};
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
const nib4 = (d, o = 0) => {
  const v = ((d[o] & 15) << 12) | ((d[o + 1] & 15) << 8) | ((d[o + 2] & 15) << 4) | (d[o + 3] & 15);
  return v >= 0x8000 ? v - 0x10000 : v;
};
const nib2 = (d) => ((d[2] & 15) << 4) | (d[3] & 15);

const INQUIRIES = [
  ['pan/tilt position', [0x81, 0x09, 0x06, 0x12, 0xff], (d) => `pan ${(nib4(d, 0) * 0.075).toFixed(1)}° tilt ${(nib4(d, 4) * 0.075).toFixed(1)}°`],
  ['zoom', [0x81, 0x09, 0x04, 0x47, 0xff], (d) => `${((nib4(d, 0) & 0xffff) / 1000).toFixed(2)}x`],
  ['focus mode', [0x81, 0x09, 0x04, 0x38, 0xff], (d) => (d[0] === 2 ? 'auto' : d[0] === 3 ? 'manual' : `byte ${d[0]}`)],
  ['focus position', [0x81, 0x09, 0x04, 0x48, 0xff], (d) => String(nib4(d) & 0xffff)],
  ['exposure mode', [0x81, 0x09, 0x04, 0x39, 0xff], (d) => (d[0] === 0 ? 'auto' : d[0] === 3 ? 'manual' : `byte ${d[0]}`)],
  ['shutter', [0x81, 0x09, 0x04, 0x4a, 0xff], (d) => `index 0x${nib2(d).toString(16)}`],
  ['gain', [0x81, 0x09, 0x04, 0x4c, 0xff], (d) => `ISO ${nib2(d) * 100}`],
  ['backlight', [0x81, 0x09, 0x04, 0x33, 0xff], (d) => (d[0] === 2 ? 'on' : d[0] === 3 ? 'off' : `byte ${d[0]}`)],
  ['exposure comp', [0x81, 0x09, 0x04, 0x4e, 0xff], (d) => `index ${nib2(d)}`],
  ['anti-flicker', [0x81, 0x09, 0x04, 0x55, 0xff], (d) => ['off', '50 Hz', '60 Hz'][d[0]] ?? `byte ${d[0]}`],
  ['image style', [0x81, 0x09, 0x04, 0x40, 0xff], (d) => ['standard', 'outdoor', 'pastel', 'custom'][d[0]] ?? `byte ${d[0]}`],
  ['brightness', [0x81, 0x09, 0x04, 0x4d, 0xff], (d) => String(nib2(d))],
  ['contrast', [0x81, 0x09, 0x04, 0xa2, 0xff], (d) => String(nib2(d))],
  ['saturation', [0x81, 0x09, 0x04, 0xa3, 0xff], (d) => String(nib2(d))],
  ['sharpness', [0x81, 0x09, 0x04, 0xa4, 0xff], (d) => String(nib2(d))],
  ['hue', [0x81, 0x09, 0x04, 0xa5, 0xff], (d) => String(nib2(d))],
  ['white balance mode', [0x81, 0x09, 0x04, 0x35, 0xff], (d) => ['auto', 'daylight', 'fluorescent', 'one-push', 'tungsten', 'manual', 'cloudy'][d[0]] ?? `byte ${d[0]}`],
  ['R gain', [0x81, 0x09, 0x04, 0x43, 0xff], (d) => String(nib2(d))],
  ['B gain', [0x81, 0x09, 0x04, 0x44, 0xff], (d) => String(nib2(d))],
  ['colour temperature', [0x81, 0x09, 0x04, 0x20, 0xff], (d) => `${nib4(d) & 0xffff} K`],
  ['record', [0x81, 0x09, 0x04, 0x66, 0xff], (d) => (d[0] === 1 ? 'on' : 'off')],
  ['orientation', [0x81, 0x09, 0x04, 0x67, 0xff], (d) => (d[0] === 1 ? 'portrait' : 'landscape')],
  ['AI tracking', [0x81, 0x09, 0x8e, 0x00, 0xff], (d) => (d[0] === 2 ? 'on' : d[0] === 3 ? 'off' : `byte ${d[0]}`)],
  ['AI track mode', [0x81, 0x09, 0x8e, 0x01, 0xff], (d) => (d[0] === 1 ? 'group' : 'single')],
  ['AI track speed', [0x81, 0x09, 0x8e, 0x02, 0xff], (d) => `preset ${d[0]} pan ${d[1] ? 'auto' : 'manual'} ${d[2]} tilt ${d[3] ? 'auto' : 'manual'} ${d[4]}`],
  ['AI auto-zoom', [0x81, 0x09, 0x8e, 0x03, 0xff], (d) => `level ${d[0]}`],
  ['AI only-me', [0x81, 0x09, 0x8e, 0x04, 0xff], (d) => (d[0] === 1 ? 'on' : 'off')],
];

const ERRORS = { 1: 'message length error', 2: 'syntax error', 3: 'command buffer full', 4: 'command cancelled', 5: 'no socket', 0x41: 'command not executable' };

const socket = dgram.createSocket('udp4');
const waiters = new Map();
socket.on('message', (msg) => {
  if (msg.length < 8) return;
  const seq = msg.readUInt32BE(4);
  const payload = msg.subarray(8);
  const w = waiters.get(seq) ?? waiters.values().next().value;
  if (w) w(payload);
});

let seq = 1;
function send(type, payload, timeoutMs = 700) {
  return new Promise((resolve) => {
    const mySeq = seq++;
    const timer = setTimeout(() => {
      waiters.delete(mySeq);
      resolve(null);
    }, timeoutMs);
    waiters.set(mySeq, (p) => {
      // skip plain ACKs for inquiries; wait for the data reply
      if (p.length === 3 && (p[1] & 0xf0) === 0x40) return;
      clearTimeout(timer);
      waiters.delete(mySeq);
      resolve(p);
    });
    socket.send(frame(type, mySeq, payload), port, host);
  });
}

console.log(`\nEZY CTRL diagnose → ${host}:${port}\n`);
await new Promise((r) => socket.bind(0, r));

const ctrl = await send(0x0200, [0x01], 700);
console.log(`reset sequence: ${ctrl ? `reply ${hex(ctrl)}` : 'no reply (many cameras ignore this; fine)'}`);

const unsupported = [];
for (const [name, payload, parse] of INQUIRIES) {
  const p = await send(0x0110, payload);
  if (!p) {
    console.log(`  ${name.padEnd(20)} no reply`);
    unsupported.push(name);
    continue;
  }
  if ((p[1] & 0xf0) === 0x60) {
    console.log(`  ${name.padEnd(20)} ERROR ${ERRORS[p[2]] ?? `0x${p[2].toString(16)}`}   (${hex(p)})`);
    unsupported.push(name);
    continue;
  }
  const data = p.subarray(2, p.length - 1);
  let parsed = '';
  try {
    parsed = parse(data);
  } catch {
    parsed = '(could not parse)';
  }
  console.log(`  ${name.padEnd(20)} ${parsed.padEnd(28)} raw ${hex(p)}`);
}
console.log(unsupported.length ? `\nnot answered: ${unsupported.join(', ')}` : '\nevery inquiry answered');
socket.close();

if (videoUrl) {
  console.log(`\nvideo: pulling 3 s from ${videoUrl} …`);
  const require = createRequire(import.meta.url);
  const ffmpeg = require('ffmpeg-static');
  const a = ['-hide_banner', '-loglevel', 'info', '-nostats', '-rw_timeout', '8000000'];
  if (videoUrl.startsWith('rtsp://')) a.push('-rtsp_transport', 'tcp');
  a.push('-analyzeduration', '2000000', '-probesize', '2000000', '-i', videoUrl, '-t', '3', '-f', 'null', '-');
  const t0 = Date.now();
  const proc = spawn(ffmpeg, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr.on('data', (d) => (err += d.toString()));
  const killer = setTimeout(() => {
    console.log('  no data after 20 s; giving up (is another app holding the stream, or is the camera in a different output mode?)');
    proc.kill();
  }, 20000);
  proc.on('close', (code) => {
    clearTimeout(killer);
    const lines = err.split(/\r?\n/).filter((l) => /Stream #|Input #|Duration|error|Error|refused|timed out|Unauthorized|401|404/.test(l));
    for (const l of lines) console.log(`  ${l.trim()}`);
    console.log(code === 0 ? `  OK: stream readable (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `  ffmpeg exited with ${code} — is the camera's output mode set to ${videoUrl.split(':')[0].toUpperCase()}?`);
  });
}
