/**
 * VISCA over IP framing (Sony-compatible) and nibble helpers.
 * Pure functions, no Node/Electron imports beyond Buffer, so they are unit-testable.
 *
 * Wire format: 2-byte payload type, 2-byte payload length, 4-byte sequence number, payload.
 * See docs/protocol/visca-over-ip.md for the OBSBOT Tail 2 command set.
 */

export const PT_COMMAND = 0x0100;
export const PT_INQUIRY = 0x0110;
export const PT_REPLY = 0x0111;
export const PT_DEVICE_SETTING = 0x0120;
export const PT_CONTROL = 0x0200;
export const PT_CONTROL_REPLY = 0x0201;

/** Degrees per pan/tilt step on the Tail 2. */
export const STEP_DEG = 0.075;
/** 0x854 steps = 159.9 deg. */
export const PAN_MAX_STEPS = 0x854;
/** 0x346 steps = 62.85 deg (the VISCA table's range; the gimbal itself is -65..+32 deg). */
export const TILT_MAX_STEPS = 0x346;
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 12;

export interface Frame {
  payloadType: number;
  seq: number;
  payload: Buffer;
}

export function frame(payloadType: number, seq: number, payload: Uint8Array): Buffer {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt16BE(payloadType & 0xffff, 0);
  b.writeUInt16BE(payload.length & 0xffff, 2);
  b.writeUInt32BE(seq >>> 0, 4);
  Buffer.from(payload).copy(b, 8);
  return b;
}

export function parseFrame(buf: Buffer): Frame | null {
  if (buf.length < 8) return null;
  const payloadType = buf.readUInt16BE(0);
  const length = buf.readUInt16BE(2);
  const seq = buf.readUInt32BE(4);
  if (buf.length < 8 + length) return null;
  return { payloadType, seq, payload: buf.subarray(8, 8 + length) };
}

/** Control command that resets the camera's expected sequence number. */
export function resetSequencePacket(seq = 0): Buffer {
  return frame(PT_CONTROL, seq, Buffer.from([0x01]));
}

export type ReplyKind = 'ack' | 'completion' | 'error' | 'inquiry' | 'unknown';

export interface Reply {
  kind: ReplyKind;
  socket: number;
  errorCode?: number;
  /** For inquiry replies: the data bytes between `90 50` and `FF`. Otherwise the raw payload. */
  data: Buffer;
}

export const VISCA_ERRORS: Record<number, string> = {
  0x01: 'message length error',
  0x02: 'syntax error',
  0x03: 'command buffer full',
  0x04: 'command cancelled',
  0x05: 'no socket',
  0x41: 'command not executable',
};

export function classifyReply(p: Buffer): Reply {
  if (p.length < 3 || p[p.length - 1] !== 0xff) return { kind: 'unknown', socket: 0, data: p };
  const hi = p[1] >> 4;
  const socket = p[1] & 0x0f;
  if (hi === 4) return { kind: 'ack', socket, data: p };
  if (hi === 5) {
    if (p.length === 3) return { kind: 'completion', socket, data: p };
    return { kind: 'inquiry', socket, data: p.subarray(2, p.length - 1) };
  }
  if (hi === 6) return { kind: 'error', socket, errorCode: p[2], data: p };
  return { kind: 'unknown', socket, data: p };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Split a 16-bit value (two's complement for negatives) into four low nibbles, MSB first. */
export function toNibbles16(value: number): [number, number, number, number] {
  const v = value & 0xffff;
  return [(v >> 12) & 0xf, (v >> 8) & 0xf, (v >> 4) & 0xf, v & 0xf];
}

/** Read four nibbles (MSB first) back into a signed 16-bit value. */
export function fromNibbles16(b: Uint8Array, offset = 0): number {
  const v =
    ((b[offset] & 0xf) << 12) |
    ((b[offset + 1] & 0xf) << 8) |
    ((b[offset + 2] & 0xf) << 4) |
    (b[offset + 3] & 0xf);
  return v >= 0x8000 ? v - 0x10000 : v;
}

export function degToSteps(deg: number, maxSteps: number): number {
  return clamp(Math.round(deg / STEP_DEG), -maxSteps, maxSteps);
}

export function stepsToDeg(steps: number): number {
  return Math.round(steps * STEP_DEG * 100) / 100;
}

export function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
}
