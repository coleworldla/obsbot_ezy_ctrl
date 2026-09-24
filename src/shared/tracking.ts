/**
 * The AI tracking target of a Tail 2, read from the camera's web preview stream (ws://<camera>:9001):
 * the same data the camera's own web page uses to draw its tracking box. Pure code, unit-tested.
 *
 * Every binary message is one preview packet with a 79-byte header, little-endian:
 *   0x5C magic · u8 type · u32 data length · u8 entry count · entries of { u8 kind, u32 offset, u32 length }
 * Offsets count from the end of the header. Entry kind 1 is video, 3 an 8-byte timestamp, 5 the target:
 *   u32 id, alive, real, st_type, cst_type · f32 xmin, ymin, xmax, ymax (fractions of the frame), distance, score
 * id 255 means no target is selected; alive != 1 means the camera has lost the target it was following.
 * See docs/protocol/web-preview.md.
 */

export const PREVIEW_PORT = 9001;
export const PREVIEW_HEADER_BYTES = 79;
const MAGIC = 0x5c;
const ENTRY_TARGET = 5;
const TARGET_BYTES = 44;
export const NO_TARGET_ID = 255;

export interface TrackBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export type TrackReading =
  | { kind: 'none' }
  | { kind: 'lost'; id: number }
  | { kind: 'target'; id: number; box: TrackBox; distance: number };

const unit = (n: number) => Math.min(1, Math.max(0, n));

/** The tracking state carried by one preview packet, or null when the message is not a preview packet with a target entry. */
export function parsePreviewPacket(data: ArrayBuffer | Uint8Array): TrackReading | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.byteLength < PREVIEW_HEADER_BYTES || v.getUint8(0) !== MAGIC) return null;
  const count = v.getUint8(6);
  for (let i = 0, o = 7; i < count && o + 9 <= PREVIEW_HEADER_BYTES; i++, o += 9) {
    if (v.getUint8(o) !== ENTRY_TARGET) continue;
    const p = PREVIEW_HEADER_BYTES + v.getUint32(o + 1, true);
    if (p + TARGET_BYTES > v.byteLength) return null;
    const id = v.getUint32(p, true);
    if (id === NO_TARGET_ID) return { kind: 'none' };
    if (v.getUint32(p + 4, true) !== 1) return { kind: 'lost', id };
    const [xmin, ymin, xmax, ymax] = [20, 24, 28, 32].map((k) => v.getFloat32(p + k, true));
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return { kind: 'none' };
    const box = { xmin: unit(xmin), ymin: unit(ymin), xmax: unit(xmax), ymax: unit(ymax) };
    // The web page draws nothing for an empty box or one that is the whole frame.
    if (box.xmax - box.xmin <= 0 || box.ymax - box.ymin <= 0 || (box.xmin === 0 && box.ymin === 0 && box.xmax === 1 && box.ymax === 1)) return { kind: 'none' };
    return { kind: 'target', id, box, distance: v.getFloat32(p + 36, true) };
  }
  return null;
}

/** Same reading for display purposes (boxes compared to 1/1000 of the frame). */
export function sameReading(a: TrackReading | null, b: TrackReading | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none') return true;
  if (a.kind === 'lost') return a.id === (b as typeof a).id;
  const c = b as typeof a;
  const near = (x: number, y: number) => Math.abs(x - y) < 0.001;
  return a.id === c.id && near(a.box.xmin, c.box.xmin) && near(a.box.ymin, c.box.ymin) && near(a.box.xmax, c.box.xmax) && near(a.box.ymax, c.box.ymax);
}

/** Build a preview packet (no video), for tests and the fake camera. */
export function buildPreviewPacket(target: { id: number; alive: boolean; box?: TrackBox; distance?: number }): Uint8Array {
  const buf = new Uint8Array(PREVIEW_HEADER_BYTES + 8 + TARGET_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MAGIC);
  v.setUint8(1, 1);
  v.setUint32(2, 8 + TARGET_BYTES, true);
  v.setUint8(6, 3);
  const entry = (i: number, kind: number, offset: number, len: number) => {
    v.setUint8(7 + i * 9, kind);
    v.setUint32(8 + i * 9, offset, true);
    v.setUint32(12 + i * 9, len, true);
  };
  entry(0, 1, 0, 0);
  entry(1, 3, 0, 8);
  entry(2, ENTRY_TARGET, 8, TARGET_BYTES);
  const p = PREVIEW_HEADER_BYTES + 8;
  v.setUint32(p, target.id, true);
  v.setUint32(p + 4, target.alive ? 1 : 0, true);
  const b = target.box ?? { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  [b.xmin, b.ymin, b.xmax, b.ymax, target.distance ?? 0].forEach((x, i) => v.setFloat32(p + 20 + i * 4, x, true));
  return buf;
}
