import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ffmpegArgs, ffmpegPath } from '../src/main/video/ffmpeg';
import { VideoStream } from '../src/main/video/stream';

let ffmpeg: string | null = null;
try {
  ffmpeg = ffmpegPath();
} catch {
  ffmpeg = null;
}

describe('ffmpegArgs', () => {
  it('uses TCP transport and stream copy for RTSP', () => {
    const a = ffmpegArgs('rtsp', 'rtsp://10.0.0.5:8554/live');
    expect(a).toContain('-rtsp_transport');
    expect(a.slice(a.indexOf('-c:v'), a.indexOf('-c:v') + 2)).toEqual(['-c:v', 'copy']);
    expect(a[a.length - 1]).toBe('pipe:1');
    expect(a.join(' ')).toContain('frag_every_frame');
  });

  it('encodes a test pattern for the demo source', () => {
    const a = ffmpegArgs('demo', '');
    expect(a).toContain('lavfi');
    expect(a).toContain('libx264');
  });
});

describe.skipIf(!ffmpeg || !fs.existsSync(ffmpeg))('VideoStream with the bundled ffmpeg (demo pattern)', () => {
  it('produces an init segment with an H.264 codec string and then media segments', async () => {
    const stream = new VideoStream('demo', '', { autoRestart: false, extraInputArgs: ['-t', '1'] });
    const got = await new Promise<{ codec: string | null; init: Buffer; segments: number }>((resolve, reject) => {
      let init: Buffer | null = null;
      let codec: string | null = null;
      let segments = 0;
      const timer = setTimeout(() => reject(new Error(`timeout; ffmpeg said: ${stream.lastLog()}`)), 20000);
      stream.on('init', (b: Buffer, c: string | null) => {
        init = b;
        codec = c;
      });
      stream.on('segment', () => {
        segments += 1;
      });
      stream.on('exit', () => {
        clearTimeout(timer);
        if (init) resolve({ codec, init, segments });
        else reject(new Error(`no init segment; ffmpeg said: ${stream.lastLog()}`));
      });
      stream.start();
    });
    expect(got.init.toString('latin1', 4, 8)).toBe('ftyp');
    expect(got.codec).toMatch(/^avc1\.[0-9A-F]{6}$/);
    expect(got.segments).toBeGreaterThan(10);
  }, 30000);
});
