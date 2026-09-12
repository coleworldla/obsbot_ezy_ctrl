/**
 * One MediaSource-backed <video> per camera. The element lives outside React so it can be
 * re-parented between the stage and the rack without restarting the stream.
 */
import type { VideoEvent } from '../../../shared/types';

export type PlayerState = 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'error';

export interface PlayerStats {
  state: PlayerState;
  reason?: string;
  codec: string | null;
  width: number;
  height: number;
  fps: number;
  /** Seconds between the live edge of the buffer and the playhead. */
  bufferSec: number;
  dropped: number;
}

const MAX_QUEUE = 600; // segments (one per frame); ~10 s at 60 fps before we start dropping

/** SourceBuffer wants a plain ArrayBuffer; IPC hands us a Uint8Array view. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  if (u8.buffer instanceof ArrayBuffer && u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) return u8.buffer;
  return u8.slice().buffer as ArrayBuffer;
}
const LIVE_EDGE_SEC = 0.25;
const CATCHUP_SEC = 0.45;
const MAX_LAG_SEC = 1.2;

export class VideoPlayer {
  readonly el: HTMLVideoElement;
  stats: PlayerStats = { state: 'idle', codec: null, width: 0, height: 0, fps: 0, bufferSec: 0, dropped: 0 };

  private ms: MediaSource | null = null;
  private sb: SourceBuffer | null = null;
  private queue: Uint8Array[] = [];
  private session = -1;
  private readonly listeners = new Set<(s: PlayerStats) => void>();
  private lastFrames = 0;
  private lastTick = performance.now();
  private readonly ticker: number;

  constructor(readonly id: string) {
    const el = document.createElement('video');
    el.muted = true;
    el.autoplay = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.addEventListener('playing', () => this.setState('playing'));
    el.addEventListener('error', () => this.setState('error', el.error?.message ?? 'video element error'));
    this.el = el;
    this.ticker = window.setInterval(() => this.tick(), 1000);
  }

  onStats(cb: (s: PlayerStats) => void): () => void {
    this.listeners.add(cb);
    cb(this.stats);
    return () => this.listeners.delete(cb);
  }

  handle(ev: VideoEvent): void {
    switch (ev.kind) {
      case 'start':
        this.startSession(ev.session, ev.codec, ev.init);
        break;
      case 'segment':
        if (ev.session !== this.session) return;
        this.queue.push(ev.data);
        if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
        this.pump();
        break;
      case 'end':
        if (ev.session !== this.session) return;
        this.setState('reconnecting', ev.reason);
        break;
    }
  }

  /** JPEG data URL of the current frame, for preset thumbnails. */
  snapshot(maxWidth = 320): string | null {
    const { videoWidth: w, videoHeight: h } = this.el;
    if (!w || !h || this.el.readyState < 2) return null;
    const scale = Math.min(1, maxWidth / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext('2d')?.drawImage(this.el, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  }

  destroy(): void {
    window.clearInterval(this.ticker);
    this.teardown();
    this.listeners.clear();
    this.el.remove();
  }

  private startSession(session: number, codec: string | null, init: Uint8Array): void {
    this.teardown();
    this.session = session;
    this.stats.codec = codec;
    const mime = `video/mp4; codecs="${codec ?? 'avc1.640028'}"`;
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mime)) {
      this.setState('error', `unsupported codec ${codec ?? '(unknown)'}`);
      return;
    }
    const ms = new MediaSource();
    this.ms = ms;
    this.el.src = URL.createObjectURL(ms);
    ms.addEventListener(
      'sourceopen',
      () => {
        if (this.ms !== ms) return;
        let sb: SourceBuffer;
        try {
          sb = ms.addSourceBuffer(mime);
        } catch (e) {
          this.setState('error', e instanceof Error ? e.message : String(e));
          return;
        }
        sb.mode = 'segments';
        sb.addEventListener('updateend', () => this.onUpdateEnd());
        sb.addEventListener('error', () => this.setState('error', 'source buffer error'));
        this.sb = sb;
        this.queue.unshift(init);
        this.pump();
      },
      { once: true },
    );
    this.setState('connecting');
  }

  private pump(): void {
    const sb = this.sb;
    if (!sb || sb.updating || !this.queue.length || this.ms?.readyState !== 'open') return;
    const chunk = this.queue.shift()!;
    try {
      sb.appendBuffer(toArrayBuffer(chunk));
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'QuotaExceededError') {
        // Flush everything except the last couple of seconds and retry.
        this.queue.unshift(chunk);
        const b = this.el.buffered;
        if (b.length && !sb.updating) sb.remove(b.start(0), Math.max(b.start(0), b.end(b.length - 1) - 2));
        return;
      }
      this.setState('error', e instanceof Error ? e.message : String(e));
    }
  }

  private onUpdateEnd(): void {
    const v = this.el;
    const sb = this.sb;
    const b = v.buffered;
    if (sb && b.length) {
      const start = b.start(0);
      const end = b.end(b.length - 1);
      // First data, or fell out of the buffered range: jump to the live edge.
      if (v.currentTime < start || v.currentTime > end) {
        v.currentTime = Math.max(start, end - LIVE_EDGE_SEC);
      }
      const lag = end - v.currentTime;
      if (lag > MAX_LAG_SEC) v.currentTime = end - LIVE_EDGE_SEC;
      // Gentle catch-up: play slightly fast while more than ~0.45 s behind the live edge.
      const rate = lag > CATCHUP_SEC ? 1.08 : lag < LIVE_EDGE_SEC ? 1 : v.playbackRate;
      if (v.playbackRate !== rate) v.playbackRate = rate;
      this.stats.bufferSec = Math.max(0, end - v.currentTime);
      if (v.paused) void v.play().catch(() => undefined);
      // Keep memory bounded: drop everything older than 10 s behind the playhead.
      if (v.currentTime - start > 20 && !sb.updating) {
        sb.remove(start, v.currentTime - 10);
        return; // updateend fires again and pumps
      }
    }
    this.pump();
  }

  private tick(): void {
    const v = this.el;
    const q = v.getVideoPlaybackQuality?.();
    const now = performance.now();
    if (q) {
      const dt = (now - this.lastTick) / 1000;
      this.stats.fps = dt > 0 ? Math.round((q.totalVideoFrames - this.lastFrames) / dt) : 0;
      this.stats.dropped = q.droppedVideoFrames;
      this.lastFrames = q.totalVideoFrames;
    }
    this.lastTick = now;
    this.stats.width = v.videoWidth;
    this.stats.height = v.videoHeight;
    const b = v.buffered;
    if (b.length) this.stats.bufferSec = Math.max(0, b.end(b.length - 1) - v.currentTime);
    this.notify();
  }

  private teardown(): void {
    this.queue = [];
    this.sb = null;
    const ms = this.ms;
    this.ms = null;
    if (ms && ms.readyState === 'open') {
      try {
        ms.endOfStream();
      } catch {
        /* ignore */
      }
    }
    if (this.el.src) {
      URL.revokeObjectURL(this.el.src);
      this.el.removeAttribute('src');
      this.el.load();
    }
  }

  private setState(state: PlayerState, reason?: string): void {
    if (this.stats.state === state && this.stats.reason === reason) return;
    this.stats = { ...this.stats, state, reason };
    if (state === 'error') void window.ezy?.log.report('error', `video player ${this.id}: ${reason ?? 'error'}`);
    this.notify();
  }

  private notify(): void {
    const snapshot = { ...this.stats };
    for (const cb of this.listeners) cb(snapshot);
  }
}

const players = new Map<string, VideoPlayer>();

export function getPlayer(id: string): VideoPlayer {
  let p = players.get(id);
  if (!p) {
    p = new VideoPlayer(id);
    players.set(id, p);
  }
  return p;
}

export function dropPlayer(id: string): void {
  players.get(id)?.destroy();
  players.delete(id);
}

export function dispatchVideoEvent(ev: VideoEvent): void {
  getPlayer(ev.id).handle(ev);
}
