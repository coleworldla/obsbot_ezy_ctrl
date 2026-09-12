/**
 * One VideoStream per camera, fanned out to renderer windows over IPC.
 *
 * Messages sent on channel 'video:event':
 *   { kind: 'start', id, session, codec, init }   new stream session; init segment (ftyp+moov)
 *   { kind: 'segment', id, session, data }         one moof+mdat
 *   { kind: 'end', id, session, reason }           ffmpeg died; a restart follows automatically
 */
import type { WebContents } from 'electron';
import type { CameraConfig, VideoEvent } from '../../shared/types';
import { isStreamable } from './ffmpeg';
import { VideoStream } from './stream';

interface Entry {
  stream: VideoStream;
  cfg: CameraConfig;
  subscribers: Set<WebContents>;
}

export class VideoManager {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly log: (line: string) => void = () => undefined,
    private readonly logError: (line: string) => void = log,
  ) {}

  /** Start (or keep) streaming a camera and deliver frames to `wc`. */
  subscribe(cfg: CameraConfig, wc: WebContents): void {
    if (!isStreamable(cfg.videoSource)) return;
    let entry = this.entries.get(cfg.id);
    if (entry && (entry.cfg.videoUrl !== cfg.videoUrl || entry.cfg.videoSource !== cfg.videoSource)) {
      this.stop(cfg.id);
      entry = undefined;
    }
    if (!entry) {
      entry = { stream: this.createStream(cfg), cfg, subscribers: new Set() };
      this.entries.set(cfg.id, entry);
      entry.stream.start();
    }
    entry.subscribers.add(wc);
    wc.once('destroyed', () => this.unsubscribe(cfg.id, wc));
    // Late joiner: replay the current init segment so it can start decoding immediately.
    if (entry.stream.init) {
      this.send(wc, { kind: 'start', id: cfg.id, session: entry.stream.session, codec: entry.stream.codec, init: entry.stream.init });
    }
  }

  unsubscribe(id: string, wc: WebContents): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.subscribers.delete(wc);
    if (entry.subscribers.size === 0) this.stop(id);
  }

  stop(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.stream.stop();
    this.entries.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.entries.keys()]) this.stop(id);
  }

  /** Config changed (URL / source): restart for the same subscribers. */
  update(cfg: CameraConfig): void {
    const entry = this.entries.get(cfg.id);
    if (!entry) return;
    const subs = [...entry.subscribers];
    this.stop(cfg.id);
    for (const wc of subs) this.subscribe(cfg, wc);
  }

  private createStream(cfg: CameraConfig): VideoStream {
    const stream = new VideoStream(cfg.videoSource, cfg.videoUrl);
    stream.on('init', (init: Buffer, codec: string | null) => {
      this.log(`[${cfg.name}] stream ${stream.session} codec ${codec ?? 'unknown'}`);
      this.broadcast(cfg.id, { kind: 'start', id: cfg.id, session: stream.session, codec, init });
    });
    stream.on('segment', (data: Buffer) => {
      this.broadcast(cfg.id, { kind: 'segment', id: cfg.id, session: stream.session, data });
    });
    stream.on('exit', (reason: string) => {
      this.logError(`[${cfg.name}] stream ${stream.session} ended: ${reason}`);
      this.broadcast(cfg.id, { kind: 'end', id: cfg.id, session: stream.session, reason });
    });
    stream.on('log', (line: string) => {
      if (/error|fail|refused|timed out|unauthorized|invalid|not found|denied/i.test(line)) this.logError(`[${cfg.name}] ffmpeg: ${line}`);
    });
    return stream;
  }

  private broadcast(id: string, ev: VideoEvent): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const wc of entry.subscribers) this.send(wc, ev);
  }

  private send(wc: WebContents, ev: VideoEvent): void {
    if (wc.isDestroyed()) return;
    wc.send('video:event', ev);
  }
}
