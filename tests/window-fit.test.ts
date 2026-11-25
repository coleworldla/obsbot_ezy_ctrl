import { describe, expect, it } from 'vitest';
import { fitToWorkArea, placeWindow, uiZoom } from '../src/shared/window-fit';

const LAPTOP = { x: 0, y: 0, width: 1707, height: 1018 }; // 2560 × 1600 at 150 %, taskbar excluded
const TV = { x: 1707, y: 0, width: 1280, height: 680 }; // a small second screen to the right

describe('interface zoom', () => {
  it('is 1 at or above the comfortable size', () => {
    expect(uiZoom(1280, 760)).toBe(1);
    expect(uiZoom(1920, 1080)).toBe(1);
  });

  it('scales down by the tighter side below it', () => {
    expect(uiZoom(1024, 760)).toBeCloseTo(0.8, 5);
    expect(uiZoom(1280, 570)).toBeCloseTo(0.75, 5);
    expect(uiZoom(800, 500)).toBeCloseTo(0.625, 5);
  });

  it('never goes below 60 %, so text stays readable', () => {
    expect(uiZoom(400, 300)).toBe(0.6);
  });
});

describe('fitting the window to a screen', () => {
  it('leaves a window that fits alone', () => {
    expect(fitToWorkArea({ x: 100, y: 50, width: 1200, height: 800 }, LAPTOP)).toEqual({ x: 100, y: 50, width: 1200, height: 800 });
  });

  it('shrinks a window bigger than the screen and keeps it on it', () => {
    expect(fitToWorkArea({ x: 1707, y: 0, width: 1440, height: 900 }, TV)).toEqual({ x: 1707, y: 0, width: 1280, height: 680 });
  });

  it('pulls a window hanging off the edge back in', () => {
    expect(fitToWorkArea({ x: 1500, y: 600, width: 800, height: 600 }, LAPTOP)).toEqual({ x: 907, y: 418, width: 800, height: 600 });
  });
});

describe('placing the window at launch', () => {
  it('first launch: most of the main screen, centred', () => {
    expect(placeWindow(undefined, [LAPTOP, TV], LAPTOP)).toEqual({ x: 85, y: 51, width: 1536, height: 916 });
  });

  it('reopens where it was when that screen is still there', () => {
    const saved = { x: 1750, y: 20, width: 1100, height: 600 };
    expect(placeWindow(saved, [LAPTOP, TV], LAPTOP)).toEqual(saved);
  });

  it('a saved window on a screen that is gone reopens centred on the main screen', () => {
    expect(placeWindow({ x: 4000, y: 100, width: 1200, height: 700 }, [LAPTOP], LAPTOP)).toEqual({ x: 253, y: 159, width: 1200, height: 700 });
  });

  it('a saved window bigger than its screen now is shrunk to fit it', () => {
    expect(placeWindow({ x: 1710, y: 0, width: 1600, height: 1000 }, [LAPTOP, TV], LAPTOP)).toEqual({ x: 1707, y: 0, width: 1280, height: 680 });
  });
});
