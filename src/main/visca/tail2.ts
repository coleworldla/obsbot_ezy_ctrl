/**
 * High-level Tail 2 wrapper: friendly methods over the raw VISCA client.
 */
import type { CameraFullState, CameraImageState, CameraLiveState, CameraSet, JogDir, Position, ZoomDir } from '../../shared/types';
import { ViscaClient, type ViscaClientOptions } from './client';
import { cmd, inq, parse } from './commands';

const LIVE_DEFAULTS: CameraLiveState = { track: false, trackMode: 'single', record: false, portrait: false, focusAuto: true, exposureAuto: true, wbMode: 0 };

export class Tail2 {
  readonly client: ViscaClient;
  /** Inquiries this camera has rejected or not answered (by name). */
  readonly unsupported = new Set<string>();
  /** Last values we commanded, used when the camera cannot report them back. */
  private assumed: Partial<CameraLiveState & CameraImageState> = {};
  /** Called once per inquiry name the first time it fails (for the log). */
  onUnsupported?: (name: string, error: string) => void;

  constructor(host: string, port = 52381, opts?: ViscaClientOptions) {
    this.client = new ViscaClient(host, port, opts);
  }

  /** Run one inquiry; on failure remember it and fall back to the last commanded value, then the default. */
  private async tryQ<T>(name: string, payload: Buffer, fn: (d: Buffer) => T, fallback: T): Promise<T> {
    try {
      const v = fn(await this.client.inquiry(payload));
      this.unsupported.delete(name);
      return v;
    } catch (e) {
      if (!this.unsupported.has(name)) {
        this.unsupported.add(name);
        this.onUnsupported?.(name, e instanceof Error ? e.message : String(e));
      }
      const assumed = (this.assumed as Record<string, unknown>)[name];
      return (assumed !== undefined ? assumed : fallback) as T;
    }
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

  /** One setter for the camera panel; maps a key/value onto the matching VISCA command. */
  async set(s: CameraSet): Promise<void> {
    await this.send(s);
    // Remember what we asked for, in case the camera cannot report it back.
    if ('value' in s) (this.assumed as Record<string, unknown>)[s.key] = s.value;
  }

  private send(s: CameraSet): Promise<void> {
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
   * Every inquiry is tolerant: an unanswered one falls back to the last commanded value, else `prev`, else a default.
   */
  async liveState(prev?: CameraLiveState): Promise<CameraLiveState> {
    const d = prev ?? LIVE_DEFAULTS;
    const track = await this.tryQ('track', inq.track(), parse.onOff23, d.track);
    const multi = await this.tryQ('trackMode', inq.trackMode(), parse.onOff01, d.trackMode === 'group');
    return {
      track,
      trackMode: typeof multi === 'string' ? multi : multi ? 'group' : 'single',
      record: await this.tryQ('record', inq.record(), parse.onOff01, d.record),
      portrait: await this.tryQ('portrait', inq.orientation(), parse.onOff01, d.portrait),
      focusAuto: await this.tryQ('focusAuto', inq.focusMode(), parse.onOff23, d.focusAuto),
      exposureAuto: await this.tryQ('exposureAuto', inq.exposureMode(), (b) => parse.byte(b) === 0x00, d.exposureAuto),
      wbMode: await this.tryQ('wbMode', inq.wbMode(), parse.byte, d.wbMode),
    };
  }

  /** Everything the camera panel shows. Never throws for an unsupported inquiry; see `unsupported`. */
  async fullState(prev?: CameraLiveState): Promise<CameraFullState> {
    const live = await this.liveState(prev);
    const image: CameraImageState = {
      trackSpeed: await this.tryQ('trackSpeed', inq.trackSpeed(), (b) => parse.trackSpeed(b).preset, 3),
      autoZoom: await this.tryQ('autoZoom', inq.autoZoom(), parse.byte, 0),
      onlyMe: await this.tryQ('onlyMe', inq.onlyMe(), parse.onOff01, false),
      focusPos: await this.tryQ('focusPos', inq.focusPosition(), parse.nib4, 50),
      expComp: await this.tryQ('expComp', inq.expComp(), parse.nib2, 9),
      backlight: await this.tryQ('backlight', inq.backlight(), parse.onOff23, false),
      flicker: await this.tryQ('flicker', inq.flicker(), parse.byte, 0),
      shutter: await this.tryQ('shutter', inq.shutter(), parse.nib2, 0x1e),
      gain: await this.tryQ('gain', inq.gain(), parse.nib2, 1),
      colorTemp: await this.tryQ('colorTemp', inq.colorTemp(), parse.nib4, 5500),
      rGain: await this.tryQ('rGain', inq.rGain(), parse.nib2, 128),
      bGain: await this.tryQ('bGain', inq.bGain(), parse.nib2, 128),
      style: await this.tryQ('style', inq.style(), parse.byte, 0),
      bright: await this.tryQ('bright', inq.bright(), parse.nib2, 50),
      contrast: await this.tryQ('contrast', inq.contrast(), parse.nib2, 50),
      saturation: await this.tryQ('saturation', inq.saturation(), parse.nib2, 50),
      sharpness: await this.tryQ('sharpness', inq.sharpness(), parse.nib2, 50),
      hue: await this.tryQ('hue', inq.hue(), parse.nib2, 50),
    };
    return { ...live, ...image, unsupported: [...this.unsupported] };
  }
}
