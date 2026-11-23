import { describe, expect, it } from 'vitest';
import { actionById, cycleCamera, oscAddressList, oscMapRows, parseBuiltinOsc } from '../src/shared/mapping';

const RACK = ['cam-1', 'cam-2', 'cam-3'];

describe('next / previous camera', () => {
  it('steps through the rack in order and wraps at the ends', () => {
    expect(cycleCamera(RACK, 'cam-1', 1)).toBe('cam-2');
    expect(cycleCamera(RACK, 'cam-3', 1)).toBe('cam-1');
    expect(cycleCamera(RACK, 'cam-2', -1)).toBe('cam-1');
    expect(cycleCamera(RACK, 'cam-1', -1)).toBe('cam-3');
  });

  it('with nothing selected, next picks the first and previous the last', () => {
    expect(cycleCamera(RACK, null, 1)).toBe('cam-1');
    expect(cycleCamera(RACK, null, -1)).toBe('cam-3');
  });

  it('a camera no longer in the rack counts as nothing selected', () => {
    expect(cycleCamera(RACK, 'gone', 1)).toBe('cam-1');
  });

  it('stays on a lone camera and has nothing to pick in an empty rack', () => {
    expect(cycleCamera(['cam-1'], 'cam-1', 1)).toBe('cam-1');
    expect(cycleCamera([], null, 1)).toBeNull();
  });
});

describe('next / previous camera actions', () => {
  it('are mappable triggers in the Cameras group with their OSC addresses', () => {
    expect(actionById('cam.next')).toMatchObject({ group: 'Cameras', kind: 'trigger', osc: '/cam/next' });
    expect(actionById('cam.prev')).toMatchObject({ group: 'Cameras', kind: 'trigger', osc: '/cam/prev' });
  });

  it('parse from OSC, and a 0 (button release) does nothing', () => {
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/next', args: [] })).toEqual({ actionId: 'cam.next', phase: 'press' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/prev', args: [1] })).toEqual({ actionId: 'cam.prev', phase: 'press' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/next', args: [0] })).toBeNull();
  });
});

describe('next / previous camera in the OSC lists', () => {
  it("appear in the OSC map's Global section and the copied address list", () => {
    const rows = oscMapRows([{ id: 'c1', name: 'Stage Left' }, { id: 'c2', name: 'Wide' }], [], 'name');
    expect(rows.filter((r) => r.section === 'Global').map((r) => r.address)).toEqual(expect.arrayContaining(['/cam/next', '/cam/prev']));
    expect(oscAddressList(2)).toEqual(expect.arrayContaining(['/cam/next', '/cam/prev']));
  });
});
