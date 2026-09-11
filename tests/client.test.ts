import dgram from 'node:dgram';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ViscaClient, ViscaError } from '../src/main/visca/client';
import { cmd, inq } from '../src/main/visca/commands';
import { Tail2 } from '../src/main/visca/tail2';
import { PT_CONTROL, PT_CONTROL_REPLY, PT_REPLY, frame, parseFrame, toNibbles16 } from '../src/main/visca/packet';

/** A tiny fake Tail 2 that answers on loopback. */
class FakeCamera {
  socket = dgram.createSocket('udp4');
  port = 0;
  received: Buffer[] = [];
  panSteps = 164; // +12.3 deg
  tiltSteps = -60; // -4.5 deg
  zoom = 2400;

  async start(): Promise<void> {
    this.socket.on('message', (msg, rinfo) => {
      this.received.push(msg);
      const f = parseFrame(msg);
      if (!f) return;
      const reply = (type: number, payload: number[]) => this.socket.send(frame(type, f.seq, Buffer.from(payload)), rinfo.port, rinfo.address);
      if (f.payloadType === PT_CONTROL) return reply(PT_CONTROL_REPLY, [0x01]);
      const p = f.payload;
      // Inquiries: 81 09 ...
      if (p[1] === 0x09) {
        if (p[2] === 0x06 && p[3] === 0x12) return reply(PT_REPLY, [0x90, 0x50, ...toNibbles16(this.panSteps), ...toNibbles16(this.tiltSteps), 0xff]);
        if (p[2] === 0x04 && p[3] === 0x47) return reply(PT_REPLY, [0x90, 0x50, ...toNibbles16(this.zoom), 0xff]);
        return reply(PT_REPLY, [0x90, 0x60, 0x02, 0xff]);
      }
      // Commands: preset 0xEE is our "never answer" trap; 0xEF returns an error.
      if (p[2] === 0x04 && p[3] === 0x3f && p[5] === 0xee) return;
      if (p[2] === 0x04 && p[3] === 0x3f && p[5] === 0xef) return reply(PT_REPLY, [0x90, 0x60, 0x41, 0xff]);
      reply(PT_REPLY, [0x90, 0x41, 0xff]);
      setTimeout(() => reply(PT_REPLY, [0x90, 0x51, 0xff]), 5);
    });
    await new Promise<void>((res) => this.socket.bind(0, '127.0.0.1', res));
    this.port = this.socket.address().port;
  }

  stop(): void {
    this.socket.close();
  }
}

describe('ViscaClient against a fake camera', () => {
  const cam = new FakeCamera();
  let client: ViscaClient;

  beforeAll(async () => {
    await cam.start();
    client = new ViscaClient('127.0.0.1', cam.port, { timeoutMs: 300 });
    await client.open();
  });

  afterAll(() => {
    client.close();
    cam.stop();
  });

  it('sends the reset-sequence control packet on open', () => {
    expect(cam.received.length).toBeGreaterThan(0);
    expect(parseFrame(cam.received[0])!.payloadType).toBe(PT_CONTROL);
  });

  it('resolves a command on completion', async () => {
    await expect(client.command(cmd.home())).resolves.toBeUndefined();
  });

  it('returns inquiry data', async () => {
    const data = await client.inquiry(inq.panTilt());
    expect(data.length).toBe(8);
  });

  it('rejects with the VISCA error message', async () => {
    await expect(client.command(cmd.presetRecall(0xef))).rejects.toThrow('command not executable');
  });

  it('times out when the camera stays silent', async () => {
    await expect(client.command(cmd.presetRecall(0xee))).rejects.toBeInstanceOf(ViscaError);
  });

  it('handles many concurrent commands with distinct sequence numbers', async () => {
    const before = cam.received.length;
    await Promise.all(Array.from({ length: 10 }, (_, i) => client.command(cmd.zoomDirect(1 + i))));
    const seqs = cam.received.slice(before).map((b) => parseFrame(b)!.seq);
    expect(new Set(seqs).size).toBe(10);
  });
});

describe('Tail2 wrapper', () => {
  const cam = new FakeCamera();
  let t2: Tail2;

  beforeAll(async () => {
    await cam.start();
    t2 = new Tail2('127.0.0.1', cam.port, { timeoutMs: 300 });
    await t2.open();
  });

  afterAll(() => {
    t2.close();
    cam.stop();
  });

  it('reads position in degrees and zoom ratio', async () => {
    const pos = await t2.position();
    expect(pos).toEqual({ panDeg: 12.3, tiltDeg: -4.5, zoomRatio: 2.4 });
  });

  it('jogs and stops', async () => {
    await t2.jog('upright', 12, 10);
    await t2.stop();
    const last = parseFrame(cam.received[cam.received.length - 1])!.payload;
    expect([...last]).toEqual([0x81, 0x01, 0x06, 0x01, 0x01, 0x01, 0x03, 0x03, 0xff]);
  });
});
