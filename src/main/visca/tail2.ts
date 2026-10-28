/**
 * High-level Tail 2 wrapper: friendly methods over the raw VISCA client.
 */
import { stepIso, stepShutter } from '../../shared/exposure';
import type { CameraFullState, CameraImageState, CameraLiveState, CameraSet, JogDir, Position, ZoomDir } from '../../shared/types';
import { ViscaClient, ViscaError, type ViscaClientOptions } from './client';
import { cmd, inq, parse } from './commands';

const LIVE_DEFAULTS: CameraLiveState = { track: false, trackMode: 'single', record: false, portrait: false, focusAuto: true, exposureAuto: true, wbMode: 0 };

type ImageKey = keyof CameraImageState;
type Query<T> = [payload: () => Buffer, parse: (d: Buffer) => T, fallback: T];

/** How each panel setting is read, and what to show when the camera does not say. */
const IMAGE_QUERIES: { [K in ImageKey]: Query<CameraImageState[K]> } = {
  trackSpeed: [inq.trackSpeed, (b) => parse.trackSpeed(b).preset, 3],
  autoZoom: [inq.autoZoom, parse.byte, 0],
  onlyMe: [inq.onlyMe, parse.onOff01, false],
  focusPos: [inq.focusPosition, parse.nib4, 50],
  expComp: [inq.expComp, parse.nib2, 9],
  backlight: [inq.backlight, parse.onOff23, false],
  flicker: [inq.flicker, parse.byte, 0],
  shutter: [inq.shutter, parse.nib2, 0x1e],
  gain: [inq.gain, parse.nib2, 1],
  colorTemp: [inq.colorTemp, parse.nib4, 5500],
  rGain: [inq.rGain, parse.nib2, 128],
  bGain: [inq.bGain, parse.nib2, 128],
  style: [inq.style, parse.byte, 0],
  bright: [inq.bright, parse.nib2, 50],
  contrast: [inq.contrast, parse.nib2, 50],
  saturation: [inq.saturation, parse.nib2, 50],
  sharpness: [inq.sharpness, parse.nib2, 50],
  hue: [inq.hue, parse.nib2, 50],
};
const IMAGE_KEYS = Object.keys(IMAGE_QUERIES) as ImageKey[];

/**
 * What to read back after a change. Slider values the camera simply takes are not read back (a reply racing
 * the drag would pull the slider back), and neither is focus position: the motor is still moving.
 */
const READ_AFTER: Partial<Record<CameraSet['key'], ImageKey[]>> = {
  trackMode: ['autoZoom'], // Group mode has no Close-up
  trackSpeed: ['trackSpeed'],
  autoZoom: ['autoZoom'],
  onlyMe: ['onlyMe'],
  backlight: ['backlight'],
  flicker: ['flicker'],
  exposureAuto: ['shutter', 'gain', 'expComp'],
  expCompReset: ['expComp'],
  shutterUp: ['shutter'],
  shutterDown: ['shutter'],
  gainUp: ['gain'],
  gainDown: ['gain'],
  rGainUp: ['rGain'],
  rGainDown: ['rGain'],
  bGainUp: ['bGain'],
  bGainDown: ['bGain'],
  wbMode: ['colorTemp', 'rGain', 'bGain'],
  wbPush: ['colorTemp', 'rGain', 'bGain'],
  colorTempReset: ['colorTemp'],
  style: ['bright', 'contrast', 'saturation', 'sharpness', 'hue'],
};

type StepKey = 'shutter' | 'gain';
/** Changes sent as one command (everything but the shutter / gain stepping). */
type CommandSet = Exclude<CameraSet, { key: StepKey | 'shutterStep' | 'gainStep' }>;
/** OBSBOT: shutter Up is faster, which is a lower index (0x09 = 1/8000); gain Up raises ISO. */
const STEPPERS: Record<StepKey, { up: () => Buffer; down: () => Buffer; upRaises: boolean }> = {
  shutter: { up: cmd.shutterUp, down: cmd.shutterDown, upRaises: false },
  gain: { up: cmd.gainUp, down: cmd.gainDown, upRaises: true },
};
const MAX_STEPS = 80;
/** A step the camera did not show yet gets one more look after this long. */
const SETTLE_MS = 150;

/** One read pass. Once the camera stops answering, the rest of the pass is not asked. */
interface Pass {
  dead: boolean;
  /** Ask again for settings this camera has never answered. */
  recheck?: boolean;
}

/** No reply at all (or the socket closed), as opposed to the camera answering with an error. */
const isSilence = (e: unknown) => e instanceof ViscaError && e.code === undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Tail2 {
  readonly client: ViscaClient;
  /** Inquiries this camera has rejected or not answered (by name). */
  readonly unsupported = new Set<string>();
  /** Inquiries that went unanswered while the camera answered others: not asked again until a recheck. */
  private readonly silent = new Set<string>();
  /** Last value read or commanded per setting, shown when the camera cannot report it. */
  private known: Partial<CameraLiveState & CameraImageState> = {};
  /** Settings changes run one at a time, so quick clicks never overflow the camera's command buffer. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Where a shutter / gain run is heading; a newer target redirects a run that is still going. */
  private readonly targets = new Map<StepKey, number>();
  private readonly stepping = new Map<StepKey, Promise<number>>();
  /** Called once per inquiry name the first time it fails (for the log). */
  onUnsupported?: (name: string, error: string) => void;

  constructor(host: string, port = 52381, opts?: ViscaClientOptions) {
    this.client = new ViscaClient(host, port, opts);
  }

  /** Run one inquiry; on failure remember it and fall back to the last known value, then the default. */
  private async tryQ<T>(name: string, payload: Buffer, fn: (d: Buffer) => T, fallback: T, pass: Pass): Promise<T> {
    const known = (this.known as Record<string, unknown>)[name];
    const fb = (known !== undefined ? known : fallback) as T;
    if (pass.dead || (this.silent.has(name) && !pass.recheck)) return fb;
    try {
      const v = fn(await this.client.inquiry(payload));
      this.unsupported.delete(name);
      this.silent.delete(name);
      (this.known as Record<string, unknown>)[name] = v;
      return v;
    } catch (e) {
      if (isSilence(e)) {
        // This one inquiry, or the whole camera? One quick question tells.
        if (!(await this.answers())) {
          pass.dead = true;
          return fb;
        }
        this.silent.add(name);
      }
      if (!this.unsupported.has(name)) {
        this.unsupported.add(name);
        this.onUnsupported?.(name, e instanceof Error ? e.message : String(e));
      }
      return fb;
    }
  }

  /** Does the camera answer at all right now? Every Tail 2 answers the zoom position. */
  private async answers(): Promise<boolean> {
    try {
      await this.client.inquiry(inq.zoom());
      return true;
    } catch {
      return false;
    }
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  open(): Promise<void> {
    return this.client.open();
  }

  close(): void {
    this.client.close();
  }

  get isOpen(): boolean {
    return this.client.isOpen;
  }

  jog(dir: JogDir, panSpeed: number, tiltSpeed: number): Promise<void> {
    return this.client.command(cmd.ptDrive(dir, panSpeed, tiltSpeed));
  }

  stop(): Promise<void> {
    return this.client.command(cmd.ptStop());
  }

  home(): Promise<void> {
    return this.client.command(cmd.home());
  }

  moveTo(panDeg: number, tiltDeg: number, panSpeed: number, tiltSpeed: number): Promise<void> {
    return this.client.command(cmd.ptAbsolute(panDeg, tiltDeg, panSpeed, tiltSpeed));
  }

  zoom(dir: ZoomDir, speed = 3): Promise<void> {
    if (dir === 'stop') return this.client.command(cmd.zoomStop());
    return this.client.command(dir === 'tele' ? cmd.zoomTele(speed) : cmd.zoomWide(speed));
  }

  zoomTo(ratio: number): Promise<void> {
    return this.client.command(cmd.zoomDirect(ratio));
  }

  focusOnePush(): Promise<void> {
    return this.client.command(cmd.focusOnePush());
  }

  track(on: boolean): Promise<void> {
    return this.client.command(cmd.aiTrack(on));
  }

  record(on: boolean): Promise<void> {
    return this.client.command(cmd.record(on));
  }

  orientation(vertical: boolean): Promise<void> {
    return this.client.command(cmd.orientation(vertical));
  }

  presetRecall(n: number): Promise<void> {
    return this.client.command(cmd.presetRecall(n));
  }

  presetSet(n: number): Promise<void> {
    return this.client.command(cmd.presetSet(n));
  }

  /**
   * One setter for the camera panel and the exposure actions. Resolves with what the camera reports
   * afterwards for the settings the change affects (just those, not the whole panel).
   */
  async set(s: CameraSet): Promise<Partial<CameraImageState>> {
    if (s.key === 'shutter' || s.key === 'gain') return { [s.key]: await this.stepTo(s.key, s.value) };
    if (s.key === 'shutterStep' || s.key === 'gainStep') {
      const key = s.key === 'shutterStep' ? 'shutter' : 'gain';
      const next = (from: number) => (key === 'shutter' ? stepShutter(from, s.value > 0) : stepIso(from, s.value > 0));
      // Already heading somewhere: one more stop from there. Otherwise read where the camera is, in turn, so
      // two quick presses make two stops.
      const pending = this.targets.get(key);
      const done =
        pending !== undefined
          ? this.stepTo(key, next(pending))
          : (await this.serial(async () => ({ done: this.stepTo(key, next(this.targets.get(key) ?? (await this.readStep(key)))) }))).done;
      return { [key]: await done };
    }
    await this.serial(() => this.send(s as CommandSet));
    // Remember what we asked for, in case the camera cannot report it back.
    if ('value' in s) (this.known as Record<string, unknown>)[s.key] = s.value;
    const keys = READ_AFTER[s.key] ?? [];
    return keys.length ? this.serial(() => this.readImage(keys, { dead: false })) : {};
  }

  private async readStep(key: StepKey): Promise<number> {
    const v = parse.nib2(await this.client.inquiry(key === 'shutter' ? inq.shutter() : inq.gain()));
    this.known[key] = v;
    return v;
  }

  /** Step shutter or gain one notch at a time until the camera reports `target`, or the nearest value it has. */
  private stepTo(key: StepKey, target: number): Promise<number> {
    this.targets.set(key, target);
    let run = this.stepping.get(key);
    if (!run) {
      run = this.serial(() => this.stepLoop(key)).finally(() => {
        this.stepping.delete(key);
        this.targets.delete(key);
      });
      this.stepping.set(key, run);
    }
    return run;
  }

  private async stepLoop(key: StepKey): Promise<number> {
    const st = STEPPERS[key];
    let v = await this.readStep(key);
    let flipped = false;
    for (let i = 0; i < MAX_STEPS; i++) {
      const target = this.targets.get(key) ?? v;
      if (v === target) break;
      const raise = target > v;
      await this.client.command((raise === st.upRaises) !== flipped ? st.up() : st.down());
      let next = await this.readStep(key);
      if (next === v) {
        await sleep(SETTLE_MS);
        next = await this.readStep(key);
      }
      if (next === v) break; // the end of the camera's range (or exposure is not on Manual)
      const rose = next > v;
      v = next;
      if (rose !== raise) {
        if (flipped) break;
        flipped = true; // this camera counts the other way round; the next step goes back
        continue;
      }
      // Stepped past the target: this is the nearest value the camera has on that side.
      if (this.targets.get(key) === target && (raise ? v > target : v < target)) break;
    }
    return v;
  }

  private send(s: CommandSet): Promise<void> {
    const c = this.client;
    switch (s.key) {
      case 'track':
        return c.command(cmd.aiTrack(s.value));
      case 'trackMode':
        return c.command(cmd.aiTrackMode(s.value === 'group'));
      case 'trackSpeed':
        return c.command(cmd.aiTrackSpeed(s.value));
      case 'autoZoom':
        return c.command(cmd.aiAutoZoom(s.value));
      case 'onlyMe':
        return c.command(cmd.aiOnlyMe(s.value));
      case 'focusAuto':
        return c.command(cmd.focusAuto(s.value));
      case 'focusPush':
        return c.command(cmd.focusOnePush());
      case 'focusPos':
        return c.command(cmd.focusDirect(s.value));
      case 'exposureAuto':
        return c.command(cmd.exposureAuto(s.value));
      case 'expComp':
        return c.command(cmd.expCompDirect(s.value));
      case 'expCompReset':
        return c.command(cmd.expCompReset());
      case 'backlight':
        return c.command(cmd.backlight(s.value));
      case 'flicker':
        return c.command(cmd.flicker(s.value));
      case 'shutterUp':
        return c.command(cmd.shutterUp());
      case 'shutterDown':
        return c.command(cmd.shutterDown());
      case 'gainUp':
        return c.command(cmd.gainUp());
      case 'gainDown':
        return c.command(cmd.gainDown());
      case 'wbMode':
        return c.command(cmd.wbMode(s.value));
      case 'wbPush':
        return c.command(cmd.wbOnePush());
      case 'colorTemp':
        return c.command(cmd.colorTempDirect(s.value));
      case 'colorTempReset':
        return c.command(cmd.colorTempReset());
      case 'rGainUp':
        return c.command(cmd.rGainUp());
      case 'rGainDown':
        return c.command(cmd.rGainDown());
      case 'bGainUp':
        return c.command(cmd.bGainUp());
      case 'bGainDown':
        return c.command(cmd.bGainDown());
      case 'style':
        return c.command(cmd.style(s.value));
      case 'bright':
        return c.command(cmd.brightDirect(s.value));
      case 'contrast':
        return c.command(cmd.contrastDirect(s.value));
      case 'saturation':
        return c.command(cmd.saturationDirect(s.value));
      case 'sharpness':
        return c.command(cmd.sharpnessDirect(s.value));
      case 'hue':
        return c.command(cmd.hueDirect(s.value));
      case 'record':
        return c.command(cmd.record(s.value));
      case 'portrait':
        return c.command(cmd.orientation(s.value));
    }
  }

  async position(): Promise<Position> {
    const pt = parse.panTilt(await this.client.inquiry(inq.panTilt()));
    const zoomRatio = parse.zoom(await this.client.inquiry(inq.zoom()));
    return { panDeg: pt.panDeg, tiltDeg: pt.tiltDeg, zoomRatio };
  }

  async isTracking(): Promise<boolean> {
    return parse.onOff23(await this.client.inquiry(inq.track()));
  }

  async isRecording(): Promise<boolean> {
    return parse.onOff01(await this.client.inquiry(inq.record()));
  }

  /**
   * The handful of states shown on the stage; polled every couple of seconds.
   * Every inquiry is tolerant: an unanswered one falls back to the last known value, else `prev`, else a default.
   */
  async liveState(prev?: CameraLiveState, pass: Pass = { dead: false }): Promise<CameraLiveState> {
    const d = prev ?? LIVE_DEFAULTS;
    const track = await this.tryQ('track', inq.track(), parse.onOff23, d.track, pass);
    const multi = await this.tryQ<boolean | CameraLiveState['trackMode']>('trackMode', inq.trackMode(), parse.onOff01, d.trackMode === 'group', pass);
    return {
      track,
      trackMode: typeof multi === 'string' ? multi : multi ? 'group' : 'single',
      record: await this.tryQ('record', inq.record(), parse.onOff01, d.record, pass),
      portrait: await this.tryQ('portrait', inq.orientation(), parse.onOff01, d.portrait, pass),
      focusAuto: await this.tryQ('focusAuto', inq.focusMode(), parse.onOff23, d.focusAuto, pass),
      exposureAuto: await this.tryQ('exposureAuto', inq.exposureMode(), (b) => parse.byte(b) === 0x00, d.exposureAuto, pass),
      wbMode: await this.tryQ('wbMode', inq.wbMode(), parse.byte, d.wbMode, pass),
    };
  }

  private async readImage(keys: ImageKey[], pass: Pass): Promise<Partial<CameraImageState>> {
    const out: Partial<Record<ImageKey, unknown>> = {};
    for (const k of keys) {
      const [payload, fn, fallback] = IMAGE_QUERIES[k] as Query<unknown>;
      out[k] = await this.tryQ(k, payload(), fn, fallback, pass);
    }
    return out as Partial<CameraImageState>;
  }

  /**
   * Everything the camera panel shows. Never throws for an unsupported inquiry (see `unsupported`), and gives
   * up early when the camera stops answering (`stale`). `recheck` asks again for what it never answered.
   */
  async fullState(prev?: CameraLiveState, recheck = false): Promise<CameraFullState> {
    const pass: Pass = { dead: false, recheck };
    const live = await this.liveState(prev, pass);
    const image = (await this.readImage(IMAGE_KEYS, pass)) as CameraImageState;
    return { ...live, ...image, unsupported: [...this.unsupported], ...(pass.dead ? { stale: true } : {}) };
  }
}
