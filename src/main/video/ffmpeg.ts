import fs from 'node:fs';
import path from 'node:path';
import type { VideoSource } from '../../shared/types';

/**
 * Path to the bundled ffmpeg binary:
 *  1. <resources>/ffmpeg/ffmpeg[.exe] — shipped via electron-builder extraResources (macOS builds)
 *  2. node_modules/ffmpeg-static (dev) or app.asar.unpacked (Windows builds)
 */
export function ffmpegPath(): string {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const shipped = path.join(resources, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(shipped)) return shipped;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require('ffmpeg-static') as string | null;
  if (!p) throw new Error('ffmpeg-static did not provide a binary for this platform');
  const unpacked = p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  if (fs.existsSync(unpacked)) return unpacked;
  if (fs.existsSync(p)) return p;
  throw new Error(`ffmpeg binary not found at ${p}`);
}

export const DEMO_SOURCE = 'demo';

/** ffmpeg arguments that turn a source into a low-latency fragmented MP4 stream on stdout. */
export function ffmpegArgs(source: VideoSource, url: string): string[] {
  const common = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-nostdin'];
  const out = ['-an', '-f', 'mp4', '-movflags', 'empty_moov+default_base_moof+frag_every_frame', 'pipe:1'];

  if (source === 'demo') {
    return [
      ...common,
      '-re',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-g', '30',
      ...out,
    ];
  }

  const input: string[] = ['-fflags', 'nobuffer', '-flags', 'low_delay', '-analyzeduration', '1000000', '-probesize', '1000000'];
  if (source === 'rtsp') input.push('-rtsp_transport', 'tcp');
  input.push('-i', url);
  return [...common, ...input, '-c:v', 'copy', ...out];
}

export function isStreamable(source: VideoSource): boolean {
  return source === 'rtsp' || source === 'srt' || source === 'demo';
}

export function basename(p: string): string {
  return path.basename(p);
}
