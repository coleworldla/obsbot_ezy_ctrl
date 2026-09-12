/**
 * Web MIDI input manager: lists inputs, honours per-device enable switches, hot-plugs,
 * and turns note / CC messages into MidiInput events for the mapper.
 */
import type { MidiInput } from '../../../shared/mapping';

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
  enabled: boolean;
}

export class MidiManager {
  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  error: string | null = null;
  private access: MIDIAccess | null = null;
  private disabled = new Set<string>();
  private readonly msgHandlers = new Set<(m: MidiInput) => void>();
  private readonly devHandlers = new Set<(d: MidiDeviceInfo[]) => void>();

  async init(disabledNames: string[]): Promise<void> {
    this.disabled = new Set(disabledNames);
    if (!this.supported) {
      this.error = 'Web MIDI is not available in this build';
      return;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return;
    }
    this.access.onstatechange = () => {
      this.attachAll();
      this.notifyDevices();
    };
    this.attachAll();
    this.notifyDevices();
  }

  devices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({
      id: i.id,
      name: i.name ?? i.id,
      manufacturer: i.manufacturer ?? '',
      connected: i.state === 'connected',
      enabled: !this.disabled.has(i.name ?? i.id),
    }));
  }

  /** Returns the updated list of disabled device names (persist it in settings). */
  setEnabled(name: string, on: boolean): string[] {
    if (on) this.disabled.delete(name);
    else this.disabled.add(name);
    this.notifyDevices();
    return [...this.disabled];
  }

  onMessage(cb: (m: MidiInput) => void): () => void {
    this.msgHandlers.add(cb);
    return () => this.msgHandlers.delete(cb);
  }

  onDevices(cb: (d: MidiDeviceInfo[]) => void): () => void {
    this.devHandlers.add(cb);
    cb(this.devices());
    return () => this.devHandlers.delete(cb);
  }

  private attachAll(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (ev: MIDIMessageEvent) => this.handle(input, ev);
    }
  }

  private handle(input: MIDIInput, ev: MIDIMessageEvent): void {
    const name = input.name ?? input.id;
    if (this.disabled.has(name)) return;
    const d = ev.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    const channel = (d[0] & 0x0f) + 1;
    let msg: Pick<MidiInput, 'kind' | 'number' | 'value'> | null = null;
    if (status === 0x90) msg = { kind: 'note', number: d[1], value: d[2] ?? 0 };
    else if (status === 0x80) msg = { kind: 'note', number: d[1], value: 0 };
    else if (status === 0xb0) msg = { kind: 'cc', number: d[1], value: d[2] ?? 0 };
    if (!msg) return;
    const full: MidiInput = { type: 'midi', device: name, channel, ...msg };
    for (const h of this.msgHandlers) h(full);
  }

  private notifyDevices(): void {
    const list = this.devices();
    for (const h of this.devHandlers) h(list);
  }
}
