import dgram from 'node:dgram';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isoChoices, shutterIndexFor, stepIso, stepShutter } from '../src/shared/exposure';
import { parseBuiltinOsc } from '../src/shared/mapping';
import { pickAutoSource } from '../src/main/ndi/pick';
import { PT_CONTROL, PT_CONTROL_REPLY, PT_REPLY, frame, parseFrame, toNibbles16 } from '../src/main/visca/packet';
import { Tail2 } from '../src/main/visca/tail2';

/** A fake Tail 2 for exposure: shutter / gain that step, and ways to go quiet. */
class ExposureCam {
  socket = dgram.createSocket('udp4');
  port = 0;
  shutter = 0x1e;
  gain = 1;
  /** When set, gain moves along these values instead of ±1. */
  gainSteps: number[] | null = null;
  /** OBSBOT: shutter Up is faster (a lower index). False makes a camera that counts the other way. */
  upFaster = true;
  /** Inquiries ("04:4a") this camera never answers. */
  silent = new Set<string>();
  dead = false;
  inquiries: string[] = [];
  commands: string[] = [];
  outstanding = 0;
  maxOutstanding = 0;

  async start(): Promise<void> {
    this.socket.on('message', (msg, rinfo) => {
      if (this.dead) return;
      const f = parseFrame(msg);
      if (!f) return;
      const reply = (type: number, payload: number[]) => this.socket.send(frame(type, f.seq, Buffer.from(payload)), rinfo.port, rinfo.address);
      if (f.payloadType === PT_CONTROL) return reply(PT_CONTROL_REPLY, [0x01]);
      const p = f.payload;
      const name = `${p[2].toString(16).padStart(2, '0')}:${p[3].toString(16).padStart(2, '0')}`;
      if (p[1] === 0x09) {
        this.inquiries.push(name);
        if (this.silent.has(name)) return;
        const nib2 = (v: number) => reply(PT_REPLY, [0x90, 0x50, 0x00, 0x00, (v >> 4) & 0x0f, v & 0x0f, 0xff]);
        if (name === '04:4a') return nib2(this.shutter);
        if (name === '04:4c') return nib2(this.gain);
        if (name === '04:39') return reply(PT_REPLY, [0x90, 0x50, 0x03, 0xff]);
        if (name === '04:47') return reply(PT_REPLY, [0x90, 0x50, ...toNibbles16(1000), 0xff]);
        if (name === '06:12') return reply(PT_REPLY, [0x90, 0x50, ...toNibbles16(0), ...toNibbles16(0), 0xff]);
        return reply(PT_REPLY, [0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff]);
      }
      this.commands.push(name);
      this.outstanding += 1;
      this.maxOutstanding = Math.max(this.maxOutstanding, this.outstanding);
      const up = p[4] === 0x02;
      if (name === '04:0a') this.shutter = Math.min(0x22, Math.max(0x09, this.shutter + (up === this.upFaster ? -1 : 1)));
      if (name === '04:0c') {
        if (this.gainSteps) {
          const i = this.gainSteps.indexOf(this.gain);
          this.gain = this.gainSteps[Math.min(this.gainSteps.length - 1, Math.max(0, i + (up ? 1 : -1)))];
        } else this.gain = Math.min(64, Math.max(1, this.gain + (up ? 1 : -1)));
      }
      reply(PT_REPLY, [0x90, 0x41, 0xff]);
      setTimeout(() => {
        this.outstanding -= 1;
        reply(PT_REPLY, [0x90, 0x51, 0xff]);
      }, 3);
    });
    await new Promise<void>((res) => this.socket.bind(0, '127.0.0.1', res));
    this.port = this.socket.address().port;
  }

  stop(): void {
    this.socket.close();
  }
}

const TIMEOUT = 150;

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not reached');
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('shutter / ISO helpers', () => {
  it('finds the nearest shutter speed for an OSC value', () => {
    expect(shutterIndexFor(60)).toBe(0x1e);
    expect(shutterIndexFor(250)).toBe(0x18); // 1/240
    expect(shutterIndexFor(100000)).toBe(0x09);
    expect(shutterIndexFor(1)).toBe(0x22);
  });

  it('steps shutter within its range and ISO by stops', () => {
    expect(stepShutter(0x1e, true)).toBe(0x1d);
    expect(stepShutter(0x09, true)).toBe(0x09);
    expect(stepShutter(0x22, false)).toBe(0x22);
    expect(stepIso(4, true)).toBe(8);
    expect(stepIso(5, true)).toBe(8);
    expect(stepIso(5, false)).toBe(4);
    expect(stepIso(64, true)).toBe(64);
    expect(stepIso(1, false)).toBe(1);
    expect(isoChoices(5)).toEqual([1, 2, 4, 5, 8, 16, 32, 64]);
  });
});

describe('Tail2 shutter / ISO against a fake camera', () => {
  let cam: ExposureCam;
  let t: Tail2;

  beforeEach(async () => {
    cam = new ExposureCam();
    await cam.start();
    t = new Tail2('127.0.0.1', cam.port, { timeoutMs: TIMEOUT });
    await t.open();
  });

  afterEach(() => {
    t.close();
    cam.stop();
  });

  it('steps the shutter to a chosen speed and reports where it landed', async () => {
    expect(await t.set({ key: 'shutter', value: 0x15 })).toEqual({ shutter: 0x15 });
    expect(cam.shutter).toBe(0x15);
    expect(cam.commands.filter((c) => c === '04:0a')).toHaveLength(9);
  });

  it('works out a camera that counts the other way round', async () => {
    cam.upFaster = false;
    expect(await t.set({ key: 'shutter', value: 0x15 })).toEqual({ shutter: 0x15 });
  });

  it('stops at the end of the range instead of going on', async () => {
    cam.gain = 60;
    expect(await t.set({ key: 'gain', value: 80 })).toEqual({ gain: 64 });
  });

  it('stops at the nearest value when the camera has no step at the one asked for', async () => {
    cam.gainSteps = [1, 2, 4, 8, 16];
    expect(await t.set({ key: 'gain', value: 3 })).toEqual({ gain: 4 });
  });

  it('a newer target redirects a run that is still going', async () => {
    const first = t.set({ key: 'shutter', value: 0x09 });
    await until(() => cam.shutter <= 0x1a);
    const second = t.set({ key: 'shutter', value: 0x1c });
    expect(await second).toEqual({ shutter: 0x1c });
    expect(await first).toEqual({ shutter: 0x1c });
    expect(cam.shutter).toBe(0x1c);
  });

  it('two quick one-step presses make two steps', async () => {
    await Promise.all([t.set({ key: 'shutterStep', value: 1 }), t.set({ key: 'shutterStep', value: 1 })]);
    expect(cam.shutter).toBe(0x1c);
  });

  it('ISO one stop up goes to the next stop', async () => {
    cam.gain = 5;
    expect(await t.set({ key: 'gainStep', value: 1 })).toEqual({ gain: 8 });
  });

  it('sends settings changes one at a time', async () => {
    await Promise.all(Array.from({ length: 6 }, () => t.set({ key: 'shutterUp' })));
    expect(cam.shutter).toBe(0x1e - 6);
    expect(cam.maxOutstanding).toBe(1);
  });

  it('reads back only what a change affects', async () => {
    cam.inquiries.length = 0;
    const back = await t.set({ key: 'exposureAuto', value: false });
    expect(Object.keys(back).sort()).toEqual(['expComp', 'gain', 'shutter']);
    expect(cam.inquiries).toHaveLength(3);
    cam.inquiries.length = 0;
    expect(await t.set({ key: 'bright', value: 60 })).toEqual({});
    expect(cam.inquiries).toHaveLength(0);
  });

  it('skips a setting the camera never answers, and asks again on Refresh', async () => {
    cam.silent.add('04:4e'); // exposure compensation
    const first = await t.fullState();
    expect(first.stale).toBeUndefined();
    expect(first.unsupported).toContain('expComp');
    cam.inquiries.length = 0;
    const t0 = Date.now();
    await t.fullState();
    expect(Date.now() - t0).toBeLessThan(TIMEOUT);
    expect(cam.inquiries).not.toContain('04:4e');
    await t.fullState(undefined, true);
    expect(cam.inquiries).toContain('04:4e');
  });

  it('gives up at once when the whole camera stops answering, keeping the last values', async () => {
    cam.shutter = 0x15;
    await t.fullState();
    cam.dead = true;
    const t0 = Date.now();
    const st = await t.fullState();
    // One unanswered setting plus one "anyone there?" question, not 25 timeouts.
    expect(Date.now() - t0).toBeLessThan(TIMEOUT * 2 + 100);
    expect(st.stale).toBe(true);
    expect(st.shutter).toBe(0x15);
  });
});

describe('Auto NDI source matching', () => {
  const a = { name: 'TAIL 2_AAAA (cam_a)', url: '<ip a>:5961' };
  const b = { name: 'TAIL 2_BBBB (cam_b)', url: '<ip b>:5961' };
  const cfg = { host: '<ip x>', name: 'Stage Left', kind: 'tail2' as const };

  it('takes the source at the camera’s own address first', () => {
    expect(pickAutoSource([a, b], { ...cfg, host: '<ip b>' }, [{ host: '<ip a>', source: b.name }], true)).toBe(b);
  });

  it('borrows the one Tail 2 left only while the camera’s control answers', () => {
    expect(pickAutoSource([a], cfg, [], true)).toBe(a);
    expect(pickAutoSource([a], cfg, [], false)).toBeUndefined();
  });

  it('never takes a source another camera receives or that comes from another camera’s address', () => {
    expect(pickAutoSource([a], cfg, [{ host: '<ip y>', source: a.name }], true)).toBeUndefined();
    expect(pickAutoSource([a], cfg, [{ host: '<ip a>', source: null }], true)).toBeUndefined();
  });

  it('matches by name, and a video-only source never borrows a Tail 2', () => {
    expect(pickAutoSource([a, b], { ...cfg, name: 'cam_b' }, [], false)).toBe(b);
    expect(pickAutoSource([a], { ...cfg, kind: 'monitor' }, [], true)).toBeUndefined();
  });
});

describe('exposure OSC addresses', () => {
  it('parse to the exposure actions', () => {
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/shutter', args: [250] })).toMatchObject({ actionId: 'exp.shutter', phase: 'value', camera: 1, value: 250, unit: 'natural' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/stage_left/iso', args: [800] })).toMatchObject({ actionId: 'exp.iso', cameraName: 'stage_left', value: 800 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/sel/iso/up', args: [] })).toMatchObject({ actionId: 'exp.iso.up', phase: 'press', camera: null });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/shutter/faster', args: [1] })).toMatchObject({ actionId: 'exp.shutter.faster', phase: 'press', camera: 2 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/exposure/auto', args: [0] })).toMatchObject({ actionId: 'exp.auto', phase: 'release', value: 0 });
  });
});
