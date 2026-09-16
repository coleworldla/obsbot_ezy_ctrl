/**
 * Renderer side of NDI: frames arrive from the main process as RGBX/RGBA buffers; views paint them
 * onto a canvas. One dispatcher, many listeners.
 */
import type { NdiFrame, NdiStateMessage } from '../../../shared/types';

type FrameCb = (f: NdiFrame) => void;
type StateCb = (s: NdiStateMessage) => void;

const frameListeners = new Map<string, Set<FrameCb>>();
const stateListeners = new Map<string, Set<StateCb>>();
const lastState = new Map<string, NdiStateMessage>();

export function dispatchNdiFrame(f: NdiFrame): void {
  const set = frameListeners.get(f.id);
  if (set) for (const cb of set) cb(f);
}

export function dispatchNdiState(s: NdiStateMessage): void {
  lastState.set(s.id, s);
  const set = stateListeners.get(s.id);
  if (set) for (const cb of set) cb(s);
}

export function onNdiFrame(id: string, cb: FrameCb): () => void {
  let set = frameListeners.get(id);
  if (!set) frameListeners.set(id, (set = new Set()));
  set.add(cb);
  return () => set!.delete(cb);
}

export function onNdiState(id: string, cb: StateCb): () => void {
  let set = stateListeners.get(id);
  if (!set) stateListeners.set(id, (set = new Set()));
  set.add(cb);
  const last = lastState.get(id);
  if (last) cb(last);
  return () => set!.delete(cb);
}

/** Paint an RGBX/RGBA frame (with row stride) onto a canvas, forcing alpha to opaque. */
export function paintFrame(canvas: HTMLCanvasElement, f: NdiFrame): void {
  if (canvas.width !== f.width || canvas.height !== f.height) {
    canvas.width = f.width;
    canvas.height = f.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rowBytes = f.width * 4;
  let pixels: Uint8ClampedArray<ArrayBuffer>;
  if (f.stride === rowBytes && f.data.buffer instanceof ArrayBuffer) {
    pixels = new Uint8ClampedArray(f.data.buffer, f.data.byteOffset, rowBytes * f.height);
  } else {
    pixels = new Uint8ClampedArray(rowBytes * f.height);
    for (let y = 0; y < f.height; y++) pixels.set(f.data.subarray(y * f.stride, y * f.stride + rowBytes), y * rowBytes);
  }
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  ctx.putImageData(new ImageData(pixels, f.width, f.height), 0, 0);
}
