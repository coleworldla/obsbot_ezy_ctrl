/**
 * Minimal OSC 1.0 codec: messages with i/f/s/b/T/F/N arguments, and #bundle packets.
 */

export type OscArg = number | string | boolean | null | Uint8Array;
export interface TypedArg {
  type: 'i' | 'f' | 's';
  value: number | string;
}

export interface OscMessage {
  address: string;
  args: OscArg[];
}

const pad4 = (n: number) => (n + 3) & ~3;

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8');
  const out = Buffer.alloc(pad4(bytes.length + 1));
  bytes.copy(out);
  return out;
}

function readString(buf: Buffer, offset: number): [string, number] {
  const end = buf.indexOf(0, offset);
  if (end < 0) throw new Error('unterminated OSC string');
  return [buf.toString('utf8', offset, end), offset + pad4(end - offset + 1)];
}

/** Plain integers become 'i', other numbers 'f'; pass {type, value} to force a type. */
export function encodeMessage(address: string, args: (OscArg | TypedArg)[] = []): Buffer {
  if (!address.startsWith('/')) throw new Error('OSC address must start with /');
  let tags = ',';
  const parts: Buffer[] = [];
  for (const a of args) {
    if (a !== null && typeof a === 'object' && !(a instanceof Uint8Array) && 'type' in a) {
      if (a.type === 'i') {
        tags += 'i';
        const b = Buffer.alloc(4);
        b.writeInt32BE(Math.trunc(a.value as number) | 0);
        parts.push(b);
      } else if (a.type === 'f') {
        tags += 'f';
        const b = Buffer.alloc(4);
        b.writeFloatBE(a.value as number);
        parts.push(b);
      } else {
        tags += 's';
        parts.push(encodeString(String(a.value)));
      }
      continue;
    }
    if (typeof a === 'number') {
      const b = Buffer.alloc(4);
      if (Number.isInteger(a) && Math.abs(a) < 2 ** 31) {
        tags += 'i';
        b.writeInt32BE(a);
      } else {
        tags += 'f';
        b.writeFloatBE(a);
      }
      parts.push(b);
    } else if (typeof a === 'string') {
      tags += 's';
      parts.push(encodeString(a));
    } else if (typeof a === 'boolean') {
      tags += a ? 'T' : 'F';
    } else if (a === null) {
      tags += 'N';
    } else {
      tags += 'b';
      const b = Buffer.alloc(4 + pad4(a.length));
      b.writeInt32BE(a.length);
      Buffer.from(a).copy(b, 4);
      parts.push(b);
    }
  }
  return Buffer.concat([encodeString(address), encodeString(tags), ...parts]);
}

export function decodeMessage(buf: Buffer): OscMessage {
  let [address, p] = readString(buf, 0);
  const args: OscArg[] = [];
  if (p >= buf.length) return { address, args };
  let tags: string;
  [tags, p] = readString(buf, p);
  if (!tags.startsWith(',')) return { address, args };
  for (const t of tags.slice(1)) {
    switch (t) {
      case 'i':
        args.push(buf.readInt32BE(p));
        p += 4;
        break;
      case 'f':
        args.push(buf.readFloatBE(p));
        p += 4;
        break;
      case 'd':
        args.push(buf.readDoubleBE(p));
        p += 8;
        break;
      case 'h': {
        args.push(Number(buf.readBigInt64BE(p)));
        p += 8;
        break;
      }
      case 's':
      case 'S': {
        let s: string;
        [s, p] = readString(buf, p);
        args.push(s);
        break;
      }
      case 'b': {
        const len = buf.readInt32BE(p);
        args.push(new Uint8Array(buf.subarray(p + 4, p + 4 + len)));
        p += 4 + pad4(len);
        break;
      }
      case 'T':
        args.push(true);
        break;
      case 'F':
        args.push(false);
        break;
      case 'N':
        args.push(null);
        break;
      case 'I':
        args.push(Infinity);
        break;
      default:
        throw new Error(`unsupported OSC type tag '${t}'`);
    }
  }
  return { address, args };
}

/** Decode a packet, flattening bundles (timetags are ignored: everything is "now"). */
export function decodePacket(buf: Buffer): OscMessage[] {
  if (buf.length >= 16 && buf.toString('latin1', 0, 8) === '#bundle\0') {
    const out: OscMessage[] = [];
    let p = 16;
    while (p + 4 <= buf.length) {
      const size = buf.readInt32BE(p);
      p += 4;
      if (size < 0 || p + size > buf.length) throw new Error('bad OSC bundle element size');
      out.push(...decodePacket(buf.subarray(p, p + size)));
      p += size;
    }
    return out;
  }
  return [decodeMessage(buf)];
}
