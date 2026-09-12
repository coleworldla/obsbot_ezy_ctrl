#!/usr/bin/env node
/**
 * Download ffmpeg binaries for one or more architectures into build/ffmpeg/<os>-<arch>/,
 * so a single electron-builder run can package every architecture with the right ffmpeg.
 * Uses the same release the ffmpeg-static package installs from.
 *
 *   node scripts/fetch-ffmpeg.mjs mac arm64 x64
 *   node scripts/fetch-ffmpeg.mjs win x64
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

const RELEASE = process.env.FFMPEG_STATIC_RELEASE ?? 'b6.1.1';
const BASE = process.env.FFMPEG_BINARIES_URL ?? `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;

const [os, ...arches] = process.argv.slice(2);
if (!os || arches.length === 0) {
  console.error('usage: fetch-ffmpeg.mjs <mac|win|linux> <arch...>');
  process.exit(1);
}
const platform = { mac: 'darwin', win: 'win32', linux: 'linux' }[os];
if (!platform) {
  console.error(`unknown os ${os}`);
  process.exit(1);
}

for (const arch of arches) {
  const dir = path.join('build', 'ffmpeg', `${os}-${arch}`);
  const exe = path.join(dir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(exe) && fs.statSync(exe).size > 1_000_000) {
    console.log(`have ${exe}`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  const url = `${BASE}/ffmpeg-${platform}-${arch}.gz`;
  console.log(`downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    console.error(`download failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const tmp = `${exe}.part`;
  // Node's fetch body is a web stream; convert for pipeline().
  const { Readable } = await import('node:stream');
  await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fs.createWriteStream(tmp));
  fs.renameSync(tmp, exe);
  if (platform !== 'win32') fs.chmodSync(exe, 0o755);
  console.log(`wrote ${exe} (${(fs.statSync(exe).size / 1e6).toFixed(1)} MB)`);
}
