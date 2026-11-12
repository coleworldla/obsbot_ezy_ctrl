import { describe, expect, it } from 'vitest';
import { createJogBus, driveToStick, stickFromOffset, stickToDrive } from '../src/shared/joystick';

const MAX = { pan: 12, tilt: 10 };

describe('joystick position → camera move', () => {
  it('stops inside the dead zone', () => {
    expect(stickToDrive(0, 0, MAX).dir).toBe('stop');
    expect(stickToDrive(0.05, -0.05, MAX).dir).toBe('stop');
  });

  it('a full push moves at the jog speed sliders', () => {
    expect(stickToDrive(0, 1, MAX)).toEqual({ dir: 'up', pan: 1, tilt: 10 });
    expect(stickToDrive(-1, 0, MAX)).toEqual({ dir: 'left', pan: 12, tilt: 1 });
  });

  it('a half push moves at half speed, never below 1', () => {
    expect(stickToDrive(0.5, 0, MAX)).toEqual({ dir: 'right', pan: 6, tilt: 1 });
    expect(stickToDrive(0.1, 0, MAX).pan).toBe(1);
  });

  it('diagonals set each axis from its own share of the push', () => {
    expect(stickToDrive(0.6, -0.3, MAX)).toEqual({ dir: 'downright', pan: 7, tilt: 3 });
  });

  it('a push close to an axis is a straight move on that axis', () => {
    expect(stickToDrive(0.04, 0.9, MAX).dir).toBe('up');
  });
});

describe('pointer offset → joystick position', () => {
  it('scales by the travel radius and puts up positive', () => {
    expect(stickFromOffset(10, -15, 20)).toEqual({ x: 0.5, y: 0.75 });
  });

  it('keeps a drag past the edge on the rim', () => {
    const { x, y } = stickFromOffset(60, 80, 25);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(x).toBeCloseTo(0.6, 6);
    expect(y).toBeCloseTo(-0.8, 6);
  });
});

describe('camera move → joystick position (following keys, MIDI and OSC)', () => {
  it('a key jog at slider speed is a full push that way', () => {
    expect(driveToStick('left', 12, 10, MAX)).toEqual({ x: -1, y: 0 });
    expect(driveToStick('up', 12, 10, MAX)).toEqual({ x: 0, y: 1 });
  });

  it('a diagonal key jog sits on the rim, not past it', () => {
    const { x, y } = driveToStick('upright', 12, 10, MAX);
    expect(x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(y).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('a slower move is a smaller push, a faster one stays on the rim', () => {
    expect(driveToStick('right', 6, 1, MAX)).toEqual({ x: 0.5, y: 0 });
    expect(driveToStick('down', 1, 20, MAX)).toEqual({ x: 0, y: -1 });
  });

  it('stop is the centre', () => {
    expect(driveToStick('stop', 12, 10, MAX)).toEqual({ x: 0, y: 0 });
  });
});

describe('jog bus', () => {
  it('sends every move and tells listeners about it', async () => {
    const sent: unknown[] = [];
    const seen: unknown[] = [];
    const bus = createJogBus(async (...a) => {
      sent.push(a);
    });
    const off = bus.onDrive((id, d) => seen.push([id, d]));
    await bus.drive('cam-a', 'up', 12, 10);
    off();
    await bus.drive('cam-a', 'stop', 12, 10);
    expect(sent).toEqual([
      ['cam-a', 'up', 12, 10],
      ['cam-a', 'stop', 12, 10],
    ]);
    expect(seen).toEqual([['cam-a', { dir: 'up', pan: 12, tilt: 10 }]]);
  });
});
