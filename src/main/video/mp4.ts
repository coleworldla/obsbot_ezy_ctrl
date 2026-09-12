/**
 * Minimal fragmented-MP4 helpers: a streaming top-level box splitter and a codec-string
 * reader for the init segment. Pure functions, unit-tested without ffmpeg.
 */

export interface Box {
  type: string;
  /** Whole box including its header. */
  data: Buffer;
}

/** Feed arbitrary byte chunks, get complete top-level boxes back in order. */
export class BoxSplitter {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Box[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out: Box[] = [];
    for (;;) {
      if (this.buf.length < 8) break;
      let size = this.buf.readUInt32BE(0);
      let header = 8;
      if (size === 1) {
        if (this.buf.length < 16) break;
        const big = this.buf.readBigUInt64BE(8);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('mp4 box too large');
        size = Number(big);
        header = 16;
      } else if (size === 0) {
        throw new Error('mp4 box with size 0 (extends to EOF) is not supported in a live stream');
      }
      if (size < header) throw new Error(`invalid mp4 box size ${size}`);
      if (this.buf.length < size) break;
      out.push({ type: this.buf.toString('latin1', 4, 8), data: this.buf.subarray(0, size) });
      this.buf = this.buf.subarray(size);
    }
    return out;
  }

  reset(): void {
    this.buf = Buffer.alloc(0);
  }
}

/** Groups boxes into an init segment (ftyp+moov) and media segments (moof..mdat). */
export class SegmentAssembler {
  private readonly splitter = new BoxSplitter();
  private initParts: Buffer[] = [];
  private segParts: Buffer[] = [];
  private inSegment = false;

  push(chunk: Buffer): { init?: Buffer; segments: Buffer[] } {
    const segments: Buffer[] = [];
    let init: Buffer | undefined;
    for (const box of this.splitter.push(chunk)) {
      switch (box.type) {
        case 'ftyp':
          this.initParts = [box.data];
          break;
        case 'moov':
          this.initParts.push(box.data);
          init = Buffer.concat(this.initParts);
          this.initParts = [];
          break;
        case 'moof':
          this.segParts = [box.data];
          this.inSegment = true;
          break;
        case 'mdat':
          if (this.inSegment) {
            this.segParts.push(box.data);
            segments.push(Buffer.concat(this.segParts));
            this.segParts = [];
            this.inSegment = false;
          }
          break;
        default:
          // styp / sidx / free etc. ride along with whatever segment is open.
          if (this.inSegment) this.segParts.push(box.data);
          else if (this.initParts.length) this.initParts.push(box.data);
          break;
      }
    }
    return { init, segments };
  }
}

interface Child {
  type: string;
  start: number; // offset of payload
  end: number;
}

function children(buf: Buffer, start: number, end: number): Child[] {
  const out: Child[] = [];
  let p = start;
  while (p + 8 <= end) {
    const size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size < 8 || p + size > end) break;
    out.push({ type, start: p + 8, end: p + size });
    p += size;
  }
  return out;
}

function find(buf: Buffer, start: number, end: number, path: string[]): Child | null {
  let range = { start, end };
  let found: Child | null = null;
  for (const type of path) {
    found = children(buf, range.start, range.end).find((c) => c.type === type) ?? null;
    if (!found) return null;
    range = { start: found.start, end: found.end };
  }
  return found;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

/**
 * Derive the MSE codec string ("avc1.640028", "hvc1.1.6.L120.B0") from an init segment.
 * Returns null when the sample entry is not recognised.
 */
export function codecFromInit(init: Buffer): string | null {
  const moov = children(init, 0, init.length).find((c) => c.type === 'moov');
  if (!moov) return null;
  for (const trak of children(init, moov.start, moov.end).filter((c) => c.type === 'trak')) {
    const stsd = find(init, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'stsd']);
    if (!stsd) continue;
    // stsd payload: version(1) flags(3) entry_count(4) then sample entries
    const entries = children(init, stsd.start + 8, stsd.end);
    for (const e of entries) {
      if (e.type === 'avc1' || e.type === 'avc3') {
        // VisualSampleEntry: 6 reserved + 2 data_ref + 70 bytes of fields = 78 bytes before child boxes
        const avcC = children(init, e.start + 78, e.end).find((c) => c.type === 'avcC');
        if (!avcC || avcC.end - avcC.start < 4) return 'avc1.640028';
        const p = avcC.start;
        return `avc1.${hex2(init[p + 1])}${hex2(init[p + 2])}${hex2(init[p + 3])}`;
      }
      if (e.type === 'hvc1' || e.type === 'hev1') {
        const hvcC = children(init, e.start + 78, e.end).find((c) => c.type === 'hvcC');
        if (!hvcC || hvcC.end - hvcC.start < 13) return `${e.type}.1.6.L120.B0`;
        const p = hvcC.start;
        const profileIdc = init[p + 1] & 0x1f;
        const levelIdc = init[p + 12];
        const compat = profileIdc === 2 ? 4 : 6;
        return `${e.type}.${profileIdc}.${compat}.L${levelIdc}.B0`;
      }
    }
  }
  return null;
}
