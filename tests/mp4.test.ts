import { describe, expect, it } from 'vitest';
import { BoxSplitter, SegmentAssembler, codecFromInit } from '../src/main/video/mp4';

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const b = Buffer.alloc(8 + body.length);
  b.writeUInt32BE(8 + body.length, 0);
  b.write(type, 4, 'latin1');
  body.copy(b, 8);
  return b;
}

function fullBox(type: string, ...payload: Buffer[]): Buffer {
  return box(type, Buffer.alloc(4), ...payload); // version + flags
}

/** A fake avc1 sample entry with an avcC: profile 0x64, compat 0x00, level 0x28. */
function avc1Entry(profile = 0x64, compat = 0x00, level = 0x28): Buffer {
  const avcC = box('avcC', Buffer.from([1, profile, compat, level, 0xff, 0xe1, 0, 0, 1, 0, 0]));
  return box('avc1', Buffer.alloc(78), avcC);
}

function initSegment(entry: Buffer): Buffer {
  const stsd = fullBox('stsd', Buffer.from([0, 0, 0, 1]), entry);
  const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd)))));
  return Buffer.concat([box('ftyp', Buffer.from('isom')), moov]);
}

describe('BoxSplitter', () => {
  it('reassembles boxes split across arbitrary chunks', () => {
    const data = Buffer.concat([box('ftyp', Buffer.from('isom')), box('moov', Buffer.alloc(20)), box('moof', Buffer.alloc(5)), box('mdat', Buffer.alloc(100))]);
    const s = new BoxSplitter();
    const types: string[] = [];
    for (let i = 0; i < data.length; i += 7) types.push(...s.push(data.subarray(i, i + 7)).map((b) => b.type));
    expect(types).toEqual(['ftyp', 'moov', 'moof', 'mdat']);
  });

  it('rejects size-0 boxes', () => {
    const s = new BoxSplitter();
    expect(() => s.push(Buffer.from([0, 0, 0, 0, 0x6d, 0x64, 0x61, 0x74]))).toThrow();
  });
});

describe('SegmentAssembler', () => {
  it('yields an init segment then moof+mdat pairs', () => {
    const init = initSegment(avc1Entry());
    const seg1 = Buffer.concat([box('moof', Buffer.alloc(9)), box('mdat', Buffer.alloc(50))]);
    const seg2 = Buffer.concat([box('moof', Buffer.alloc(9)), box('mdat', Buffer.alloc(60))]);
    const a = new SegmentAssembler();
    const r1 = a.push(Buffer.concat([init, seg1.subarray(0, 30)]));
    expect(r1.init?.equals(init)).toBe(true);
    expect(r1.segments).toHaveLength(0);
    const r2 = a.push(Buffer.concat([seg1.subarray(30), seg2]));
    expect(r2.init).toBeUndefined();
    expect(r2.segments).toHaveLength(2);
    expect(r2.segments[0].equals(seg1)).toBe(true);
    expect(r2.segments[1].equals(seg2)).toBe(true);
  });
});

describe('codecFromInit', () => {
  it('reads avc1 profile/compat/level from avcC', () => {
    expect(codecFromInit(initSegment(avc1Entry(0x64, 0x00, 0x28)))).toBe('avc1.640028');
    expect(codecFromInit(initSegment(avc1Entry(0x42, 0xe0, 0x1e)))).toBe('avc1.42E01E');
  });

  it('builds an hvc1 string', () => {
    const hvcC = box('hvcC', Buffer.from([1, 0x01, 0x60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x78, 0]));
    const entry = box('hvc1', Buffer.alloc(78), hvcC);
    expect(codecFromInit(initSegment(entry))).toBe('hvc1.1.6.L120.B0');
  });

  it('returns null for unknown sample entries', () => {
    expect(codecFromInit(initSegment(box('mp4a', Buffer.alloc(28))))).toBeNull();
    expect(codecFromInit(Buffer.from('nope'))).toBeNull();
  });
});
