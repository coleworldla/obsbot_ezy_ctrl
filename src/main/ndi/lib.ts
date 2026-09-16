/**
 * Thin koffi bindings over the NDI runtime (Processing.NDI.Lib). Only what a receiver needs:
 * initialise, discover sources, connect, capture video frames. Loaded lazily so the app runs
 * without NDI installed.
 */
import koffi, { type LibraryHandle } from 'koffi';

type CType = ReturnType<typeof koffi.struct>;
type CFunction = ReturnType<LibraryHandle['func']>;

export const NDI_FRAME_NONE = 0;
export const NDI_FRAME_VIDEO = 1;
export const NDI_FRAME_AUDIO = 2;
export const NDI_FRAME_METADATA = 3;
export const NDI_FRAME_ERROR = 4;
export const NDI_FRAME_STATUS_CHANGE = 100;

/** NDIlib_recv_color_format_e */
export const COLOR_BGRX_BGRA = 0;
export const COLOR_RGBX_RGBA = 2;
/** NDIlib_recv_bandwidth_e */
export const BANDWIDTH_LOWEST = 0;
export const BANDWIDTH_HIGHEST = 100;

export interface RawSource {
  p_ndi_name: string | null;
  p_url_address: string | null;
}

export interface RawVideoFrame {
  xres: number;
  yres: number;
  FourCC: number;
  frame_rate_N: number;
  frame_rate_D: number;
  picture_aspect_ratio: number;
  frame_format_type: number;
  timecode: number | bigint;
  p_data: unknown;
  line_stride_in_bytes: number;
  p_metadata: unknown;
  timestamp: number | bigint;
}

let structsDeclared = false;
let Source: CType;
let FindCreate: CType;
let RecvCreate: CType;
let VideoFrame: CType;

function declareStructs(): void {
  if (structsDeclared) return;
  structsDeclared = true;
  Source = koffi.struct('NDIlib_source_t', { p_ndi_name: 'const char *', p_url_address: 'const char *' });
  FindCreate = koffi.struct('NDIlib_find_create_t', { show_local_sources: 'bool', p_groups: 'const char *', p_extra_ips: 'const char *' });
  RecvCreate = koffi.struct('NDIlib_recv_create_v3_t', {
    source_to_connect_to: Source,
    color_format: 'int32',
    bandwidth: 'int32',
    allow_video_fields: 'bool',
    p_ndi_recv_name: 'const char *',
  });
  VideoFrame = koffi.struct('NDIlib_video_frame_v2_t', {
    xres: 'int32',
    yres: 'int32',
    FourCC: 'int32',
    frame_rate_N: 'int32',
    frame_rate_D: 'int32',
    picture_aspect_ratio: 'float',
    frame_format_type: 'int32',
    timecode: 'int64',
    p_data: 'uint8_t *',
    line_stride_in_bytes: 'int32',
    p_metadata: 'const char *',
    timestamp: 'int64',
  });
}

export class NdiLib {
  private readonly lib: LibraryHandle;
  readonly version: string;
  private readonly fn: {
    findCreate: CFunction;
    findDestroy: CFunction;
    findWait: CFunction;
    findSources: CFunction;
    recvCreate: CFunction;
    recvDestroy: CFunction;
    recvConnect: CFunction;
    recvCapture: CFunction;
    recvFreeVideo: CFunction;
    recvConnections: CFunction;
    destroy: CFunction;
  };

  constructor(readonly path: string) {
    declareStructs();
    this.lib = koffi.load(path);
    const initialize = this.lib.func('bool NDIlib_initialize()');
    if (!initialize()) throw new Error('NDIlib_initialize() returned false (CPU not supported?)');
    this.version = String(this.lib.func('const char *NDIlib_version()')());
    this.fn = {
      findCreate: this.lib.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *p)'),
      findDestroy: this.lib.func('void NDIlib_find_destroy(void *inst)'),
      findWait: this.lib.func('bool NDIlib_find_wait_for_sources(void *inst, uint32_t timeout)'),
      findSources: this.lib.func('const NDIlib_source_t *NDIlib_find_get_current_sources(void *inst, _Out_ uint32_t *count)'),
      recvCreate: this.lib.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *p)'),
      recvDestroy: this.lib.func('void NDIlib_recv_destroy(void *inst)'),
      recvConnect: this.lib.func('void NDIlib_recv_connect(void *inst, const NDIlib_source_t *src)'),
      recvCapture: this.lib.func('int NDIlib_recv_capture_v3(void *inst, _Out_ NDIlib_video_frame_v2_t *video, void *audio, void *meta, uint32_t timeout)'),
      recvFreeVideo: this.lib.func('void NDIlib_recv_free_video_v2(void *inst, const NDIlib_video_frame_v2_t *video)'),
      recvConnections: this.lib.func('int NDIlib_recv_get_no_connections(void *inst, uint32_t timeout)'),
      destroy: this.lib.func('void NDIlib_destroy()'),
    };
  }

  /** Shut the runtime down. Only call once every finder and receiver has been destroyed. */
  destroy(): void {
    this.fn.destroy();
  }

  // ---- discovery ----
  findCreate(extraIps: string[] = []): unknown {
    return this.fn.findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: extraIps.length ? extraIps.join(',') : null });
  }

  findDestroy(inst: unknown): void {
    this.fn.findDestroy(inst);
  }

  /** Wait up to timeoutMs for the source list to change, then return it (non-blocking via the thread pool). */
  findWait(inst: unknown, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, reject) => this.fn.findWait.async(inst, timeoutMs, (err: Error | null, r: unknown) => (err ? reject(err) : resolve(Boolean(r)))));
  }

  findSources(inst: unknown): RawSource[] {
    const count = [0];
    const ptr = this.fn.findSources(inst, count);
    if (!count[0] || !ptr) return [];
    return koffi.decode(ptr, koffi.array(Source, count[0])) as RawSource[];
  }

  // ---- receiving ----
  recvCreate(source: RawSource, opts: { colorFormat: number; bandwidth: number; name: string }): unknown {
    const inst = this.fn.recvCreate({
      source_to_connect_to: source,
      color_format: opts.colorFormat,
      bandwidth: opts.bandwidth,
      allow_video_fields: false,
      p_ndi_recv_name: opts.name,
    });
    if (!inst) throw new Error('NDIlib_recv_create_v3 failed');
    return inst;
  }

  recvDestroy(inst: unknown): void {
    this.fn.recvDestroy(inst);
  }

  recvConnect(inst: unknown, source: RawSource | null): void {
    this.fn.recvConnect(inst, source);
  }

  recvConnections(inst: unknown): number {
    return Number(this.fn.recvConnections(inst, 0));
  }

  /** Capture one frame of any type; resolves with the frame type and (for video) the filled struct. */
  recvCapture(inst: unknown, timeoutMs: number): Promise<{ type: number; frame: RawVideoFrame }> {
    const frame = {} as RawVideoFrame;
    return new Promise((resolve, reject) =>
      this.fn.recvCapture.async(inst, frame, null, null, timeoutMs, (err: Error | null, type: unknown) => (err ? reject(err) : resolve({ type: Number(type), frame }))),
    );
  }

  /** Copy the pixel data of a captured video frame out of NDI memory. */
  copyVideo(frame: RawVideoFrame): Uint8Array {
    const size = frame.yres * frame.line_stride_in_bytes;
    return koffi.decode(frame.p_data, koffi.array('uint8_t', size, 'Typed')) as Uint8Array;
  }

  recvFreeVideo(inst: unknown, frame: RawVideoFrame): void {
    this.fn.recvFreeVideo(inst, frame);
  }
}
