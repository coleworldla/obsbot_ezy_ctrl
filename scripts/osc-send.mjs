#!/usr/bin/env node
/**
 * Send one OSC message over UDP, for testing the app's OSC input.
 *
 *   node scripts/osc-send.mjs /cam/1/preset/2
 *   node scripts/osc-send.mjs 10.0.0.10:9000 /cam/sel/zoom 4.5
 *   node scripts/osc-send.mjs /cam/1/track 1
 *
 * Numeric arguments are sent as int32 when whole, float32 otherwise; anything else as a string.
 */
import dgram from 'node:dgram';

const argv = process.argv.slice(2);
let host = '127.0.0.1';
let port = 9000;
if (argv[0] && !argv[0].startsWith('/')) {
  const [h, p] = argv.shift().split(':');
  host = h || host;
  port = Number(p) || port;
}
const address = argv.shift();
if (!address) {
  console.error('usage: osc-send.mjs [host:port] /address [args...]');
  process.exit(1);
}

const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const str = (s) => pad(Buffer.from(`${s}\0`, 'utf8'));
let tags = ',';
const parts = [];
for (const a of argv) {
  const n = Number(a);
  if (a.trim() !== '' && !Number.isNaN(n)) {
    const b = Buffer.alloc(4);
    if (Number.isInteger(n)) {
      tags += 'i';
      b.writeInt32BE(n);
    } else {
      tags += 'f';
      b.writeFloatBE(n);
    }
    parts.push(b);
  } else {
    tags += 's';
    parts.push(str(a));
  }
}
const packet = Buffer.concat([str(address), str(tags), ...parts]);
const sock = dgram.createSocket('udp4');
sock.send(packet, port, host, (err) => {
  if (err) console.error(err.message);
  else console.log(`sent ${address} ${argv.join(' ')} -> ${host}:${port}`);
  sock.close();
});
