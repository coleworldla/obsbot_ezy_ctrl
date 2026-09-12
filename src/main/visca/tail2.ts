/**
 * High-level Tail 2 wrapper: friendly methods over the raw VISCA client.
 */
import type { CameraFullState, CameraImageState, CameraLiveState, CameraSet, JogDir, Position, ZoomDir } from '../../shared/types';
import { ViscaClient, type ViscaClientOptions } from './client';
import { cmd, inq, parse } from './commands';

export class Tail2 {
  readonly client: ViscaClient;

  constructor(host: string, port = 52381, opts?: ViscaClientOptions) {
    this.client = new ViscaClient(host, port, opts);
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
  set(s: CameraSet): Promise<void> {
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

  /** The handful of states shown on the stage; polled every couple of seconds. */
  async liveState(): Promise<CameraLiveState> {
    const q = this.client;
    return {
      track: parse.onOff23(await q.inquiry(inq.track())),
      trackMode: parse.onOff01(await q.inquiry(inq.trackMode())) ? 'group' : 'single',
      record: parse.onOff01(await q.inquiry(inq.record())),
      portrait: parse.onOff01(await q.inquiry(inq.orientation())),
      focusAuto: parse.onOff23(await q.inquiry(inq.focusMode())),
      exposureAuto: parse.byte(await q.inquiry(inq.exposureMode())) === 0x00,
      wbMode: parse.byte(await q.inquiry(inq.wbMode())),
    };
  }

  /** Everything the camera panel shows; each inquiry is tolerant so one unsupported query does not sink the rest. */
  async fullState(): Promise<CameraFullState> {
    const q = this.client;
    const live = await this.liveState();
    const tryQ = async <T>(payload: Buffer, fn: (d: Buffer) => T, fallback: T): Promise<T> => {
      try {
        return fn(await q.inquiry(payload));
      } catch {
        return fallback;
      }
    };
    const image: CameraImageState = {
      trackSpeed: (await tryQ(inq.trackSpeed(), parse.trackSpeed, { preset: 3, panAuto: true, panSpeed: 5, tiltAuto: true, tiltSpeed: 5 })).preset,
      autoZoom: await tryQ(inq.autoZoom(), parse.byte, 0),
      onlyMe: await tryQ(inq.onlyMe(), parse.onOff01, false),
      focusPos: await tryQ(inq.focusPosition(), parse.nib4, 50),
      expComp: await tryQ(inq.expComp(), parse.nib2, 9),
      backlight: await tryQ(inq.backlight(), parse.onOff23, false),
      flicker: await tryQ(inq.flicker(), parse.byte, 0),
      shutter: await tryQ(inq.shutter(), parse.nib2, 0x1e),
      gain: await tryQ(inq.gain(), parse.nib2, 1),
      colorTemp: await tryQ(inq.colorTemp(), parse.nib4, 5500),
      rGain: await tryQ(inq.rGain(), parse.nib2, 128),
      bGain: await tryQ(inq.bGain(), parse.nib2, 128),
      style: await tryQ(inq.style(), parse.byte, 0),
      bright: await tryQ(inq.bright(), parse.nib2, 50),
      contrast: await tryQ(inq.contrast(), parse.nib2, 50),
      saturation: await tryQ(inq.saturation(), parse.nib2, 50),
      sharpness: await tryQ(inq.sharpness(), parse.nib2, 50),
      hue: await tryQ(inq.hue(), parse.nib2, 50),
    };
    return { ...live, ...image };
  }
}
