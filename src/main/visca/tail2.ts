/**
 * High-level Tail 2 wrapper: friendly methods over the raw VISCA client.
 */
import type { JogDir, Position, ZoomDir } from '../../shared/types';
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
}
