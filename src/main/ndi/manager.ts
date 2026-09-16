/**
 * NDI receive for the viewport: one receiver per camera, frames fanned out to the renderer as
 * RGBA buffers over IPC ('ndi:frame'), state on 'ndi:state'. Uses the NDI "lowest bandwidth"
 * proxy stream by default: a ~640x360 picture that costs the camera and this machine very little.
 */
import type { WebContents } from 'electron';
import type { CameraConfig, NdiFrame, NdiSource, NdiStateMessage, NdiStatus } from '../../shared/types';
import { errMsg, logger } from '../log';
import { BANDWIDTH_HIGHEST, BANDWIDTH_LOWEST, COLOR_RGBX_RGBA, NDI_FRAME_ERROR, NDI_FRAME_VIDEO, NdiLib, type RawSource } from './lib';
import { findNdiRuntime, NDI_RUNTIME_DOWNLOAD } from './runtime';

const CAPTURE_TIMEOUT_MS = 500;
const STOP_TIMEOUT_MS = 2500; // how long quitting waits for receivers to be destroyed
const RESOLVE_RETRY_MS = 3000;
/** Frame rate delivered to the renderer: full for the camera on stage, a trickle for rack thumbnails. */
const FPS_FOCUSED = 30;
const FPS_BACKGROUND = 8;

interface Receiver {
  cfg: CameraConfig;
  subscribers: Set<WebContents>;
  stop: boolean;
  /** Resolves when the run loop has exited and the receiver instance is destroyed. */
  done: Promise<void>;
  inst: unknown | null;
  source: NdiSource | null;
  /** Names of the NDI sources seen during the last discovery pass (for the status line). */
  seen: string[];
  state: NdiStateMessage;
  lastFrameAt: number;
  frames: number;
}

export class NdiManager {
  private lib: NdiLib | null = null;
  private libError: string | null = null;
  private finder: unknown | null = null;
  private readonly receivers = new Map<string, Receiver>();
  private extraIps = new Set<string>();
  private focusedId: string | null = null;

  constructor(private readonly runtimeOverride?: string) {}

  /** The camera currently on stage gets full frame rate; the others are throttled. */
  focus(id: string | null): void {
    this.focusedId = id;
  }

  /** Load the runtime once; safe to call repeatedly. */
  private ensureLib(): NdiLib | null {
    if (this.lib || this.libError) return this.lib;
    const found = findNdiRuntime(this.runtimeOverride);
    if (!found) {
      this.libError = `NDI runtime not found. Install NDI Tools or the NDI Runtime from ${NDI_RUNTIME_DOWNLOAD} and restart the app.`;
      logger.warn('ndi', this.libError);
      return null;
    }
    try {
      this.lib = new NdiLib(found.path);
      logger.info('ndi', `runtime ${this.lib.version} loaded from ${found.path} (${found.from})`);
    } catch (e) {
      this.libError = `NDI runtime at ${found.path} could not be loaded: ${errMsg(e)}`;
      logger.error('ndi', this.libError);
    }
    return this.lib;
  }

  status(): NdiStatus {
    const lib = this.ensureLib();
    return lib ? { available: true, runtimePath: lib.path, version: lib.version } : { available: false, error: this.libError ?? undefined };
  }

  /** Discover sources on the network (plus the cameras' IPs as hints), waiting up to `waitMs`. */
  async sources(waitMs = 1500): Promise<NdiSource[]> {
    const lib = this.ensureLib();
    if (!lib) return [];
    if (!this.finder) this.finder = lib.findCreate([...this.extraIps]);
    await lib.findWait(this.finder, waitMs).catch(() => false);
    return lib
      .findSources(this.finder)
      .filter((s) => s.p_ndi_name)
      .map((s) => ({ name: s.p_ndi_name!, url: s.p_url_address ?? '' }));
  }

  /** Tell discovery about a camera's IP so it is found even across subnets. */
  private hint(ip: string): void {
    if (!ip || this.extraIps.has(ip)) return;
    this.extraIps.add(ip);
    if (this.finder && this.lib) {
      this.lib.findDestroy(this.finder);
      this.finder = null;
    }
  }

  subscribe(cfg: CameraConfig, wc: WebContents): void {
    if (cfg.videoSource !== 'ndi') return;
    this.hint(cfg.host);
    let r = this.receivers.get(cfg.id);
    if (r && (r.cfg.videoUrl !== cfg.videoUrl || r.cfg.host !== cfg.host)) {
      void this.stop(cfg.id);
      r = undefined;
    }
    if (!r) {
      r = { cfg, subscribers: new Set(), stop: false, done: Promise.resolve(), inst: null, source: null, seen: [], state: { id: cfg.id, state: 'idle' }, lastFrameAt: 0, frames: 0 };
      this.receivers.set(cfg.id, r);
      r.done = this.run(r);
    }
    r.subscribers.add(wc);
    wc.once('destroyed', () => this.unsubscribe(cfg.id, wc));
    this.send(wc, 'ndi:state', r.state);
  }

  unsubscribe(id: string, wc: WebContents): void {
    const r = this.receivers.get(id);
    if (!r) return;
    r.subscribers.delete(wc);
    if (r.subscribers.size === 0) void this.stop(id);
  }

  update(cfg: CameraConfig): void {
    const r = this.receivers.get(cfg.id);
    if (!r) return;
    const subs = [...r.subscribers];
    this.stop(cfg.id);
    for (const wc of subs) this.subscribe(cfg, wc);
  }

  /** Ask the receiver to stop; resolves once its NDI instance has been destroyed. */
  stop(id: string): Promise<void> {
    const r = this.receivers.get(id);
    if (!r) return Promise.resolve();
    r.stop = true;
    this.receivers.delete(id);
    return r.done;
  }

  /**
   * Stop every receiver and wait (bounded) until they are gone, then shut the runtime down.
   * Exiting the process while receivers are still alive hangs it inside the NDI runtime's unload.
   */
  async stopAll(): Promise<void> {
    const pending = [...this.receivers.keys()].map((id) => this.stop(id));
    await Promise.race([Promise.all(pending), sleep(STOP_TIMEOUT_MS)]);
    if (this.finder && this.lib) this.lib.findDestroy(this.finder);
    this.finder = null;
    if (this.lib) {
      try {
        this.lib.destroy();
      } catch {
        /* ignore */
      }
      this.lib = null;
    }
  }

  private setState(r: Receiver, state: NdiStateMessage['state'], message?: string): void {
    if (r.state.state === state && r.state.message === message) return;
    r.state = { id: r.cfg.id, state, message, source: r.source ?? undefined };
    for (const wc of r.subscribers) this.send(wc, 'ndi:state', r.state);
  }

  /** Pick the camera's source: by exact name if configured, else the first source at the camera's IP. */
  private async resolveSource(r: Receiver): Promise<RawSource | null> {
    const list = await this.sources(1500);
    r.seen = list.map((s) => s.name);
    const wanted = r.cfg.videoUrl.trim();
    let match: NdiSource | undefined;
    if (wanted) {
      match = list.find((s) => s.name === wanted);
    } else {
      // Auto: 1. the source advertised from the camera's IP; 2. an NDI name that carries the camera's name;
      // 3. a Tail 2 with Ethernet and Wi-Fi both up may advertise NDI from its other address, so fall back to
      //    the one Tail 2 no other camera in the app has claimed.
      const claimed = new Set([...this.receivers.values()].filter((o) => o !== r).map((o) => o.source?.name).filter((n): n is string => !!n));
      const free = list.filter((s) => !claimed.has(s.name));
      const tails = free.filter((s) => /TAIL/i.test(s.name));
      match =
        free.find((s) => s.url.split(':')[0] === r.cfg.host) ??
        free.find((s) => s.name.toUpperCase().includes(r.cfg.name.toUpperCase())) ??
        (tails.length === 1 ? tails[0] : undefined);
    }
    if (!match) return null;
    r.source = match;
    return { p_ndi_name: match.name, p_url_address: match.url || null };
  }

  private async run(r: Receiver): Promise<void> {
    const lib = this.ensureLib();
    if (!lib) {
      this.setState(r, 'unavailable', this.libError ?? 'NDI runtime not available');
      return;
    }
    const wantHigh = /[?&]bandwidth=high/.test(r.cfg.videoUrl);
    try {
      while (!r.stop) {
        // ---- find the source ----
        this.setState(r, 'searching', r.cfg.videoUrl.trim() ? `looking for "${r.cfg.videoUrl}"` : `looking for an NDI source at ${r.cfg.host}`);
        let src: RawSource | null = null;
        while (!r.stop && !(src = await this.resolveSource(r))) {
          this.setState(
            r,
            'no-source',
            r.seen.length
              ? `no NDI source matches ${r.cfg.host}; on the network: ${r.seen.join(', ')} (pick one by name under Edit)`
              : `no NDI source found for ${r.cfg.host} yet (is the camera in NDI mode?)`,
          );
          await sleep(RESOLVE_RETRY_MS);
        }
        if (r.stop || !src) break;
        // ---- connect ----
        this.setState(r, 'connecting', `connecting to ${src.p_ndi_name}`);
        logger.info('ndi', `${r.cfg.name}: connecting to "${src.p_ndi_name}" (${src.p_url_address ?? 'no url'})`, r.cfg.id);
        r.inst = lib.recvCreate(src, { colorFormat: COLOR_RGBX_RGBA, bandwidth: wantHigh ? BANDWIDTH_HIGHEST : BANDWIDTH_LOWEST, name: `EZY CTRL ${r.cfg.name}` });
        lib.recvConnect(r.inst, src);
        r.lastFrameAt = Date.now();
        let idleSince = Date.now();
        // ---- capture loop ----
        while (!r.stop) {
          const { type, frame } = await lib.recvCapture(r.inst, CAPTURE_TIMEOUT_MS);
          if (r.stop) {
            if (type === NDI_FRAME_VIDEO) lib.recvFreeVideo(r.inst, frame);
            break;
          }
          if (type === NDI_FRAME_VIDEO) {
            idleSince = Date.now();
            const now = Date.now();
            const fps = this.focusedId === r.cfg.id || r.subscribers.size === 0 ? FPS_FOCUSED : FPS_BACKGROUND;
            if (now - r.lastFrameAt >= 1000 / fps - 2) {
              try {
                const data = lib.copyVideo(frame);
                r.lastFrameAt = now;
                r.frames += 1;
                if (r.frames === 1) {
                  logger.info('ndi', `${r.cfg.name}: receiving ${frame.xres}x${frame.yres} @ ${frame.frame_rate_N}/${frame.frame_rate_D} fps`, r.cfg.id);
                  this.setState(r, 'receiving', `${frame.xres}×${frame.yres}`);
                }
                const msg: NdiFrame = { id: r.cfg.id, width: frame.xres, height: frame.yres, stride: frame.line_stride_in_bytes, data, ts: now };
                for (const wc of r.subscribers) this.send(wc, 'ndi:frame', msg);
              } finally {
                lib.recvFreeVideo(r.inst, frame);
              }
            } else {
              lib.recvFreeVideo(r.inst, frame);
            }
          } else if (type === NDI_FRAME_ERROR) {
            logger.warn('ndi', `${r.cfg.name}: receiver reported an error; reconnecting`, r.cfg.id);
            break;
          } else if (Date.now() - idleSince > 5000) {
            // Nothing for 5 s: the source may have gone (camera switched mode, network change). Re-resolve.
            this.setState(r, 'no-source', `no video from ${src.p_ndi_name} for 5 s; looking again`);
            if (lib.recvConnections(r.inst) === 0 || Date.now() - idleSince > 10000) break;
          }
        }
        lib.recvDestroy(r.inst);
        r.inst = null;
        r.source = null;
        r.frames = 0;
      }
    } catch (e) {
      logger.error('ndi', `${r.cfg.name}: ${errMsg(e)}`, r.cfg.id);
      this.setState(r, 'error', errMsg(e));
      if (r.inst) {
        try {
          lib.recvDestroy(r.inst);
        } catch {
          /* ignore */
        }
        r.inst = null;
      }
    }
  }

  private send(wc: WebContents, channel: string, payload: unknown): void {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
