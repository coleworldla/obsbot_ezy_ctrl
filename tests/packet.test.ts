import { describe, expect, it } from 'vitest';
import { cmd, inq, parse } from '../src/main/visca/commands';
import {
  PT_COMMAND,
  classifyReply,
  degToSteps,
  frame,
  fromNibbles16,
  hex,
  parseFrame,
  resetSequencePacket,
  stepsToDeg,
  toNibbles16,
} from '../src/main/visca/packet';

describe('framing', () => {
  it('wraps a VISCA payload in the Sony IP header', () => {
    const b = frame(PT_COMMAND, 0, cmd.presetRecall(1));
    // 7-byte VISCA payload, sequence 0.
    expect(hex(b)).toBe('01 00 00 07 00 00 00 00 81 01 04 3f 02 01 ff');
  });

  it('round-trips through parseFrame', () => {
    const b = frame(0x0110, 0x01020304, inq.panTilt());
    const f = parseFrame(b)!;
    expect(f.payloadType).toBe(0x0110);
    expect(f.seq).toBe(0x01020304);
    expect(hex(f.payload)).toBe('81 09 06 12 ff');
  });

  it('builds the reset-sequence control packet', () => {
    expect(hex(resetSequencePacket())).toBe('02 00 00 01 00 00 00 00 01');
  });

  it('rejects short buffers', () => {
    expect(parseFrame(Buffer.from([1, 2, 3]))).toBeNull();
  });
});

describe('nibbles and units', () => {
  it('splits positive and negative 16-bit values', () => {
    expect(toNibbles16(0x854)).toEqual([0, 8, 5, 4]);
    expect(toNibbles16(-2133)).toEqual([0xf, 7, 0xa, 0xb]); // 0xf7ab
    expect(fromNibbles16(Buffer.from([0, 8, 5, 4]))).toBe(0x854);
    expect(fromNibbles16(Buffer.from([0xf, 7, 0xa, 0xb]))).toBe(-2133);
  });

  it('converts degrees to steps with clamping', () => {
    expect(degToSteps(159.9, 0x854)).toBe(0x854);
    expect(degToSteps(500, 0x854)).toBe(0x854);
    expect(degToSteps(-159.9, 0x854)).toBe(-0x854);
    expect(degToSteps(12.3, 0x854)).toBe(164);
    expect(stepsToDeg(164)).toBe(12.3);
  });
});

describe('commands', () => {
  it('pan/tilt drive encodes direction and speed', () => {
    expect(hex(cmd.ptDrive('upleft', 12, 10))).toBe('81 01 06 01 0c 0a 01 01 ff');
    expect(hex(cmd.ptDrive('stop', 1, 1))).toBe('81 01 06 01 01 01 03 03 ff');
    expect(hex(cmd.ptDrive('right', 99, 99))).toBe('81 01 06 01 18 17 02 03 ff'); // clamped
  });

  it('absolute position encodes signed nibbles', () => {
    expect(hex(cmd.ptAbsolute(-159.9, 62.85, 24, 23))).toBe('81 01 06 02 18 17 0f 07 0a 0c 00 03 04 06 ff');
  });

  it('zoom direct is ratio x 1000', () => {
    expect(hex(cmd.zoomDirect(2.4))).toBe('81 01 04 47 00 09 06 00 ff');
    expect(hex(cmd.zoomDirect(50))).toBe('81 01 04 47 02 0e 0e 00 ff'); // clamped to 12x = 0x2ee0
  });

  it('zoom variable speed', () => {
    expect(hex(cmd.zoomTele(7))).toBe('81 01 04 07 27 ff');
    expect(hex(cmd.zoomWide())).toBe('81 01 04 07 03 ff');
  });

  it('AI and video toggles', () => {
    expect(hex(cmd.aiTrack(true))).toBe('81 01 8e 00 02 ff');
    expect(hex(cmd.record(true))).toBe('81 01 04 66 01 ff');
    expect(hex(cmd.orientation(true))).toBe('81 01 04 67 01 ff');
    expect(hex(cmd.home())).toBe('81 01 06 04 ff');
  });
});

describe('replies', () => {
  it('classifies ack, completion, error and inquiry replies', () => {
    expect(classifyReply(Buffer.from([0x90, 0x41, 0xff])).kind).toBe('ack');
    expect(classifyReply(Buffer.from([0x90, 0x51, 0xff])).kind).toBe('completion');
    const err = classifyReply(Buffer.from([0x90, 0x60, 0x02, 0xff]));
    expect(err.kind).toBe('error');
    expect(err.errorCode).toBe(0x02);
    const inqReply = classifyReply(Buffer.from([0x90, 0x50, 0x00, 0x00, 0x0a, 0x04, 0x0f, 0x0f, 0x0c, 0x04, 0xff]));
    expect(inqReply.kind).toBe('inquiry');
    expect(inqReply.data.length).toBe(8);
  });

  it('parses pan/tilt and zoom positions', () => {
    const pt = parse.panTilt(Buffer.from([0x00, 0x00, 0x0a, 0x04, 0x0f, 0x0f, 0x0c, 0x04]));
    expect(pt.panSteps).toBe(0xa4);
    expect(pt.panDeg).toBe(12.3);
    expect(pt.tiltSteps).toBe(-60);
    expect(pt.tiltDeg).toBe(-4.5);
    expect(parse.zoom(Buffer.from([0x00, 0x09, 0x06, 0x00]))).toBe(2.4);
  });
});
