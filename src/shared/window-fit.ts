/**
 * Window size and interface zoom for any screen. Pure maths, unit-tested; the main process applies it.
 * Sizes are in screen points (Windows scaling already taken out), as Electron reports them.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The layout is drawn for at least this much room; a smaller window zooms the whole interface out to fit. */
export const COMFORTABLE = { width: 1280, height: 760 };
/** Below this the text gets too small to read; the window stops zooming out. */
export const MIN_ZOOM = 0.6;
/** First launch: this share of the screen's usable area. */
const FIRST_LAUNCH_SHARE = 0.9;

/** How far to zoom the interface for a window this size (1 = normal). */
export function uiZoom(width: number, height: number): number {
  return Math.max(MIN_ZOOM, Math.min(1, width / COMFORTABLE.width, height / COMFORTABLE.height));
}

/** No bigger than the screen's usable area and fully on it. */
export function fitToWorkArea(b: Rect, work: Rect): Rect {
  const width = Math.min(b.width, work.width);
  const height = Math.min(b.height, work.height);
  return {
    x: Math.min(Math.max(b.x, work.x), work.x + work.width - width),
    y: Math.min(Math.max(b.y, work.y), work.y + work.height - height),
    width,
    height,
  };
}

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const centred = (width: number, height: number, work: Rect): Rect => ({
  x: work.x + Math.floor((work.width - width) / 2),
  y: work.y + Math.floor((work.height - height) / 2),
  width,
  height,
});

/**
 * Where the window opens: where it was, if that screen is still there (shrunk to fit it); otherwise centred on the
 * main screen, at its old size or, the first time, most of the screen.
 */
export function placeWindow(saved: Rect | undefined, workAreas: Rect[], primary: Rect): Rect {
  if (saved) {
    const best = workAreas.reduce<{ work: Rect | null; area: number }>((acc, w) => (overlap(saved, w) > acc.area ? { work: w, area: overlap(saved, w) } : acc), { work: null, area: 0 });
    if (best.work) return fitToWorkArea(saved, best.work);
    return fitToWorkArea(centred(Math.min(saved.width, primary.width), Math.min(saved.height, primary.height), primary), primary);
  }
  return centred(Math.floor(primary.width * FIRST_LAUNCH_SHARE), Math.floor(primary.height * FIRST_LAUNCH_SHARE), primary);
}
