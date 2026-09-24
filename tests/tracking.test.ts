import { describe, expect, it } from 'vitest';
import { buildPreviewPacket, parsePreviewPacket, PREVIEW_HEADER_BYTES, sameReading } from '../src/shared/tracking';

/** A packet laid out like the camera's: video first, then the 8-byte timestamp, then the target. */
function cameraPacket(videoBytes: number, target: { id: number; alive: number; box: [number, number, number, number]; distance?: number }): Uint8Array {
  const dataLen = videoBytes + 8 + 44;
  const b = new Uint8Array(PREVIEW_HEADER_BYTES + dataLen);
  const v = new DataView(b.buffer);
  v.setUint8(0, 0x5c);
  v.setUint8(1, 1);
  v.setUint32(2, dataLen, true);
  v.setUint8(6, 3);
  [
    [1, 0, videoBytes],
    [3, videoBytes, 8],
    [5, videoBytes + 8, 44],
  ].forEach(([kind, offset, len], i) => {
    v.setUint8(7 + i * 9, kind);
    v.setUint32(8 + i * 9, offset, true);
    v.setUint32(12 + i * 9, len, true);
  });
  for (let i = 0; i < videoBytes; i++) b[PREVIEW_HEADER_BYTES + i] = (i * 7) & 0xff; // noise, including 0x5c bytes
  const p = PREVIEW_HEADER_BYTES + videoBytes + 8;
  v.setUint32(p, target.id, true);
  v.setUint32(p + 4, target.alive, true);
  target.box.forEach((x, i) => v.setFloat32(p + 20 + i * 4, x, true));
  v.setFloat32(p + 36, target.distance ?? 0, true);
  return b;
}

describe('web preview AI target', () => {
  it('reads the tracked box from a camera-shaped packet', () => {
    const r = parsePreviewPacket(cameraPacket(58091, { id: 3, alive: 1, box: [0.25, 0.1, 0.5, 0.9], distance: 2.5 }));
    expect(r?.kind).toBe('target');
    if (r?.kind !== 'target') return;
    expect(r.id).toBe(3);
    expect(r.box.xmin).toBeCloseTo(0.25);
    expect(r.box.ymin).toBeCloseTo(0.1);
    expect(r.box.xmax).toBeCloseTo(0.5);
    expect(r.box.ymax).toBeCloseTo(0.9);
    expect(r.distance).toBeCloseTo(2.5);
  });

  it('accepts an ArrayBuffer and a Uint8Array view with an offset', () => {
    const packet = cameraPacket(100, { id: 1, alive: 1, box: [0.1, 0.1, 0.2, 0.2] });
    expect(parsePreviewPacket(packet.buffer as ArrayBuffer)?.kind).toBe('target');
    const padded = new Uint8Array(packet.length + 16);
    padded.set(packet, 16);
    expect(parsePreviewPacket(padded.subarray(16))?.kind).toBe('target');
  });

  it('id 255 is no target, alive != 1 is a lost target', () => {
    expect(parsePreviewPacket(cameraPacket(500, { id: 255, alive: 0, box: [0, 0, 0, 0] }))).toEqual({ kind: 'none' });
    expect(parsePreviewPacket(cameraPacket(500, { id: 4, alive: 0, box: [0.2, 0.2, 0.4, 0.4] }))).toEqual({ kind: 'lost', id: 4 });
  });

  it('draws nothing for an empty or whole-frame box, and clamps to the frame', () => {
    expect(parsePreviewPacket(cameraPacket(10, { id: 2, alive: 1, box: [0, 0, 1, 1] }))).toEqual({ kind: 'none' });
    expect(parsePreviewPacket(cameraPacket(10, { id: 2, alive: 1, box: [0.5, 0.5, 0.5, 0.7] }))).toEqual({ kind: 'none' });
    const r = parsePreviewPacket(cameraPacket(10, { id: 2, alive: 1, box: [-0.1, 0.2, 1.3, 0.8] }));
    expect(r?.kind === 'target' && [r.box.xmin, r.box.xmax]).toEqual([0, 1]);
  });

  it('ignores other messages and truncated packets', () => {
    expect(parsePreviewPacket(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parsePreviewPacket(new TextEncoder().encode('{"power_on":true}'.padEnd(120, ' ')))).toBeNull();
    const full = cameraPacket(1000, { id: 1, alive: 1, box: [0.1, 0.1, 0.3, 0.3] });
    expect(parsePreviewPacket(full.subarray(0, full.length - 10))).toBeNull();
  });

  it('builds packets the parser reads back (fake camera, tests)', () => {
    const r = parsePreviewPacket(buildPreviewPacket({ id: 7, alive: true, box: { xmin: 0.1, ymin: 0.2, xmax: 0.3, ymax: 0.6 }, distance: 1 }));
    expect(r?.kind === 'target' && r.id).toBe(7);
    expect(parsePreviewPacket(buildPreviewPacket({ id: 255, alive: false }))).toEqual({ kind: 'none' });
  });

  it('compares readings to a thousandth of the frame', () => {
    const a = parsePreviewPacket(buildPreviewPacket({ id: 1, alive: true, box: { xmin: 0.1, ymin: 0.2, xmax: 0.3, ymax: 0.6 } }));
    const b = parsePreviewPacket(buildPreviewPacket({ id: 1, alive: true, box: { xmin: 0.1004, ymin: 0.2, xmax: 0.3, ymax: 0.6 } }));
    const c = parsePreviewPacket(buildPreviewPacket({ id: 1, alive: true, box: { xmin: 0.12, ymin: 0.2, xmax: 0.3, ymax: 0.6 } }));
    expect(sameReading(a, b)).toBe(true);
    expect(sameReading(a, c)).toBe(false);
    expect(sameReading({ kind: 'none' }, { kind: 'none' })).toBe(true);
    expect(sameReading({ kind: 'lost', id: 1 }, { kind: 'lost', id: 2 })).toBe(false);
    expect(sameReading(null, { kind: 'none' })).toBe(false);
  });
});
