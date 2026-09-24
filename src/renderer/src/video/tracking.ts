/**
 * Live AI tracking target per camera, from the Tail 2's web preview stream (ws://<camera>:9001).
 * One WebSocket per camera, opened only while something subscribes: the camera serves at most two
 * web previews at a time (its own web page included), and each one is a few Mbit/s of video we throw away.
 */
import { parsePreviewPacket, PREVIEW_PORT, sameReading, type TrackReading } from '../../../shared/tracking';

export type TrackFeedStatus = 'connecting' | 'live' | 'retrying';

export interface TrackFeedState {
  status: TrackFeedStatus;
  reading: TrackReading | null;
  /** Why the last connection failed or dropped, while retrying. */
  error?: string;
}

type Listener = (s: TrackFeedState) => void;

const RETRY_MS = 3000;
/** The camera sends ~30 packets a second; silence this long means the stream is gone. */
const SILENCE_MS = 2500;

class TrackFeed {
  private ws: WebSocket | null = null;
  private retryTimer: number | null = null;
  private watchdog: number | null = null;
  private frame: number | null = null;
  private lastMessage = 0;
  private reported = false;
  state: TrackFeedState = { status: 'connecting', reading: null };
  readonly listeners = new Set<Listener>();

  constructor(
    readonly host: string,
    private readonly label: string,
  ) {
    this.connect();
  }

  private connect(): void {
    this.retryTimer = null;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://${this.host}:${PREVIEW_PORT}`);
    } catch (e) {
      this.retry(e instanceof Error ? e.message : String(e));
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.lastMessage = Date.now();
      this.watchdog = window.setInterval(() => {
        if (Date.now() - this.lastMessage > SILENCE_MS) ws.close();
      }, 1000);
    };
    ws.onmessage = (m) => {
      this.lastMessage = Date.now();
      if (!(m.data instanceof ArrayBuffer)) return;
      const reading = parsePreviewPacket(m.data);
      if (!reading) return;
      if (this.reported) {
        this.reported = false;
        void window.ezy?.log.report('info', `tracking box for ${this.label}: preview stream connected`);
      }
      if (this.state.status === 'live' && sameReading(reading, this.state.reading)) return;
      this.set({ status: 'live', reading });
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // closed by stop()
      this.ws = null;
      this.clearWatchdog();
      this.retry(opened ? 'the preview stream stopped' : `no answer on port ${PREVIEW_PORT}`);
    };
  }

  private retry(error: string): void {
    this.set({ status: 'retrying', reading: null, error });
    if (!this.reported) {
      this.reported = true;
      void window.ezy?.log.report('warn', `tracking box for ${this.label}: ${error}; retrying every ${RETRY_MS / 1000} s (the camera allows two web previews at a time)`);
    }
    if (this.retryTimer === null) this.retryTimer = window.setTimeout(() => this.connect(), RETRY_MS);
  }

  /** Coalesce to one update per frame: the camera sends a packet per video frame. */
  private set(next: TrackFeedState): void {
    this.state = next;
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      for (const l of this.listeners) l(this.state);
    });
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    this.watchdog = null;
  }

  stop(): void {
    const ws = this.ws;
    this.ws = null;
    this.clearWatchdog();
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    ws?.close(1000);
  }
}

const feeds = new Map<string, TrackFeed>();

/** Follow a camera's tracking target; the stream closes when the last subscriber leaves. */
export function subscribeTracking(cameraId: string, host: string, label: string, cb: Listener): () => void {
  let feed = feeds.get(cameraId);
  if (feed && feed.host !== host) {
    feed.stop();
    feeds.delete(cameraId);
    feed = undefined;
  }
  if (!feed) {
    feed = new TrackFeed(host, label);
    feeds.set(cameraId, feed);
  }
  const f = feed;
  f.listeners.add(cb);
  cb(f.state);
  return () => {
    f.listeners.delete(cb);
    if (f.listeners.size === 0 && feeds.get(cameraId) === f) {
      f.stop();
      feeds.delete(cameraId);
    }
  };
}
