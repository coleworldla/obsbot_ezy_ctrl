import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PresetStore } from '../src/main/store/presets';
import { PT_CONTROL, PT_CONTROL_REPLY, PT_REPLY, frame, parseFrame, toNibbles16 } from '../src/main/visca/packet';
import { Tail2 } from '../src/main/visca/tail2';
import { parseShow } from '../src/shared/show';
import { presetFocusFrom } from '../src/shared/types';

/** A fake Tail 2 for focus: mode and position, and a log of the commands it got (moves take 30 ms). */
class FocusCam {
  socket = dgram.createSocket('udp4');
  port = 0;
  focusAuto = true;
  focusPos = 50;
  /** "06:02" pan/tilt, "04:47" zoom, "04:38:auto|manual", "04:48:<pos>", each with when it arrived and completed. */
  log: { cmd: string; at: number; done?: number }[] = [];

  async start(): Promise<void> {
    this.socket.on('message', (msg, rinfo) => {
      const f = parseFrame(msg);
      if (!f) return;
      const reply = (payload: number[]) => this.socket.send(frame(PT_REPLY, f.seq, Buffer.from(payload)), rinfo.port, rinfo.address);
      if (f.payloadType === PT_CONTROL) return this.socket.send(frame(PT_CONTROL_REPLY, f.seq, Buffer.from([0x01])), rinfo.port, rinfo.address);
      const p = f.payload;
      const name = `${p[2].toString(16).padStart(2, '0')}:${p[3].toString(16).padStart(2, '0')}`;
      if (p[1] === 0x09) {
        if (name === '04:38') return reply([0x90, 0x50, this.focusAuto ? 0x02 : 0x03, 0xff]);
        if (name === '04:48') return reply([0x90, 0x50, ...toNibbles16(this.focusPos), 0xff]);
        return reply([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff]);
      }
      let cmd = name;
      if (name === '04:38') {
        this.focusAuto = p[4] === 0x02;
        cmd = `04:38:${this.focusAuto ? 'auto' : 'manual'}`;
      }
      if (name === '04:48') {
        this.focusPos = ((p[4] & 15) << 12) | ((p[5] & 15) << 8) | ((p[6] & 15) << 4) | (p[7] & 15);
        cmd = `04:48:${this.focusPos}`;
      }
      const entry: { cmd: string; at: number; done?: number } = { cmd, at: Date.now() };
      this.log.push(entry);
      reply([0x90, 0x41, 0xff]);
      setTimeout(
        () => {
          entry.done = Date.now();
          reply([0x90, 0x51, 0xff]);
        },
        name === '06:02' || name === '04:47' ? 30 : 2,
      );
    });
    await new Promise<void>((res) => this.socket.bind(0, '127.0.0.1', res));
    this.port = this.socket.address().port;
  }

  stop(): void {
    this.socket.close();
  }

  cmds(): string[] {
    return this.log.map((e) => e.cmd);
  }
}

describe('preset focus values', () => {
  it('accepts a 0-100 position or "auto" and nothing else', () => {
    expect(presetFocusFrom(42)).toBe(42);
    expect(presetFocusFrom('auto')).toBe('auto');
    expect(presetFocusFrom(4096)).toBeUndefined();
    expect(presetFocusFrom(12.5)).toBeUndefined();
    expect(presetFocusFrom('manual')).toBeUndefined();
    expect(presetFocusFrom(undefined)).toBeUndefined();
  });

  it('survives a show file and a preset import', () => {
    const preset = (id: string, focus: unknown) => ({ id, cameraId: 'c1', panDeg: 0, tiltDeg: 0, zoomRatio: 1, focus });
    const { show } = parseShow(
      JSON.stringify({ format: 'ezy-show', version: 1, cameras: [{ id: 'c1', name: 'A' }], presets: [preset('p1', 42), preset('p2', 'auto'), preset('p3', 4096)] }),
    );
    expect(show.presets.map((p) => p.focus)).toEqual([42, 'auto', undefined]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezy-focus-'));
    try {
      const store = new PresetStore(path.join(dir, 'presets.json'));
      expect(store.import({ presets: [preset('x', 7), preset('y', 'nope')] }, 'c1')).toBe(2);
      expect(store.list('c1').map((p) => p.focus)).toEqual([7, undefined]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Tail2 focus with presets, against a fake camera', () => {
  let cam: FocusCam;
  let t: Tail2;
  const at = { panDeg: 10, tiltDeg: -5, zoomRatio: 5.7 };

  beforeEach(async () => {
    cam = new FocusCam();
    await cam.start();
    t = new Tail2('127.0.0.1', cam.port, { timeoutMs: 300 });
    await t.open();
  });

  afterEach(() => {
    t.close();
    cam.stop();
  });

  it('reads the focus mode, and the position only on Manual', async () => {
    expect(await t.focusState()).toEqual({ auto: true });
    cam.focusAuto = false;
    cam.focusPos = 42;
    expect(await t.focusState()).toEqual({ auto: false, pos: 42 });
  });

  it('a locked preset goes to Manual as the move starts and to its position once there', async () => {
    expect(await t.recall({ ...at, focus: 42 }, 18, 17)).toBe('focus Manual at 42');
    expect(cam.cmds()).toEqual(expect.arrayContaining(['04:38:manual', '06:02', '04:47', '04:48:42']));
    const when = (c: string) => cam.log.find((e) => e.cmd === c)!;
    expect(when('04:38:manual').at).toBeLessThanOrEqual(when('06:02').at);
    expect(when('04:48:42').at).toBeGreaterThanOrEqual(Math.max(when('06:02').done!, when('04:47').done!));
    expect(cam.focusAuto).toBe(false);
    expect(cam.focusPos).toBe(42);
  });

  it('an Auto preset hands focus back to the camera once there, only when it is on Manual', async () => {
    cam.focusAuto = false;
    await t.focusState();
    expect(await t.recall({ ...at, focus: 'auto' }, 18, 17)).toBe('focus Auto');
    expect(cam.cmds().slice(-1)).toEqual(['04:38:auto']);
    cam.log.length = 0;
    expect(await t.recall({ ...at, focus: 'auto' }, 18, 17)).toBeNull();
    expect(cam.cmds()).not.toContain('04:38:auto');
  });

  it('a preset from before focus was saved leaves focus alone', async () => {
    expect(await t.recall(at, 18, 17)).toBeNull();
    expect(cam.cmds().sort()).toEqual(['04:47', '06:02']);
  });
});
