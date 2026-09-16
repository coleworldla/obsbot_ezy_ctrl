import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  defaultMappings,
  describeTrigger,
  keyInputFrom,
  matchMappings,
  noteName,
  oscAddress,
  oscAddressList,
  oscMapRows,
  oscSlug,
  parseBuiltinOsc,
  type Mapping,
} from '../src/shared/mapping';

const defaults = defaultMappings();

describe('keyboard defaults', () => {
  it('W jogs up on press and release', () => {
    const press = matchMappings(defaults, keyInputFrom({ key: 'w', ctrlKey: false, shiftKey: false, altKey: false }, 'press')!);
    expect(press).toEqual([{ actionId: 'ptz.up', phase: 'press', arg: undefined, camera: null }]);
    const rel = matchMappings(defaults, keyInputFrom({ key: 'W', ctrlKey: false, shiftKey: false, altKey: false }, 'release')!);
    expect(rel[0].phase).toBe('release');
  });

  it('digits recall presets, Ctrl+digits select cameras, Ctrl+S saves', () => {
    const d = (key: string, ctrl = false) => matchMappings(defaults, keyInputFrom({ key, ctrlKey: ctrl, shiftKey: false, altKey: false }, 'press')!);
    expect(d('4')).toEqual([{ actionId: 'preset.recall', phase: 'press', arg: 4, camera: null }]);
    expect(d('2', true)).toEqual([{ actionId: 'cam.select', phase: 'press', arg: 2, camera: null }]);
    expect(d('s', true).map((i) => i.actionId)).toEqual(['preset.save']);
    expect(d('s').map((i) => i.actionId)).toEqual(['ptz.down']);
  });

  it('ignores pure modifier presses', () => {
    expect(keyInputFrom({ key: 'Control', ctrlKey: true, shiftKey: false, altKey: false }, 'press')).toBeNull();
  });
});

describe('MIDI mappings', () => {
  const mappings: Mapping[] = [
    { id: 'a', actionId: 'preset.recall', trigger: { type: 'midi', channel: null, kind: 'note', number: 60, span: 64 } },
    { id: 'b', actionId: 'zoom.level', trigger: { type: 'midi', channel: 1, kind: 'cc', number: 21 } },
    { id: 'c', actionId: 'ai.track', trigger: { type: 'midi', channel: null, kind: 'cc', number: 30 } },
    { id: 'd', actionId: 'ptz.home', camera: 2, trigger: { type: 'midi', device: 'nanoKONTROL2', channel: null, kind: 'note', number: 36 } },
  ];

  it('maps a note range onto preset numbers', () => {
    const on = matchMappings(mappings, { type: 'midi', device: 'x', channel: 1, kind: 'note', number: 63, value: 100 });
    expect(on).toEqual([{ actionId: 'preset.recall', phase: 'press', arg: 4, camera: null }]);
    const outOfRange = matchMappings(mappings, { type: 'midi', device: 'x', channel: 1, kind: 'note', number: 59, value: 100 });
    expect(outOfRange).toEqual([]);
  });

  it('CC drives continuous actions with normalized values and respects channel', () => {
    const v = matchMappings(mappings, { type: 'midi', device: 'x', channel: 1, kind: 'cc', number: 21, value: 127 });
    expect(v).toEqual([{ actionId: 'zoom.level', phase: 'value', value: 1, unit: 'normalized', arg: undefined, camera: null }]);
    expect(matchMappings(mappings, { type: 'midi', device: 'x', channel: 2, kind: 'cc', number: 21, value: 127 })).toEqual([]);
  });

  it('CC buttons press at >= 64 and release below', () => {
    expect(matchMappings(mappings, { type: 'midi', device: 'x', channel: 5, kind: 'cc', number: 30, value: 127 })[0].phase).toBe('press');
    expect(matchMappings(mappings, { type: 'midi', device: 'x', channel: 5, kind: 'cc', number: 30, value: 0 })[0].phase).toBe('release');
  });

  it('device-specific triggers only match that device and carry the camera index', () => {
    expect(matchMappings(mappings, { type: 'midi', device: 'APC mini', channel: 1, kind: 'note', number: 36, value: 100 })).toEqual([]);
    const hit = matchMappings(mappings, { type: 'midi', device: 'nanoKONTROL2', channel: 1, kind: 'note', number: 36, value: 100 });
    expect(hit).toEqual([{ actionId: 'ptz.home', phase: 'press', arg: undefined, camera: 2 }]);
  });
});

describe('built-in OSC scheme', () => {
  it('parses preset recall, select, jog, continuous and app addresses', () => {
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/preset/4', args: [] })).toEqual({ actionId: 'preset.recall', phase: 'press', camera: 1, arg: 4 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/preset/4', args: [0] })).toBeNull();
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/sel/preset', args: [7] })).toEqual({ actionId: 'preset.recall', phase: 'press', camera: null, arg: 7 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/select', args: [3] })).toEqual({ actionId: 'cam.select', phase: 'press', arg: 3 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/ptz/upleft', args: [1] })).toMatchObject({ actionId: 'ptz.upleft', phase: 'press', camera: 2 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/ptz/upleft', args: [0] })).toMatchObject({ actionId: 'ptz.upleft', phase: 'release' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/zoom', args: [4.5] })).toEqual({ actionId: 'zoom.level', phase: 'value', camera: 1, value: 4.5, unit: 'natural' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/zoom', args: [] })).toBeNull();
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/track', args: ['1'] })).toMatchObject({ actionId: 'ai.track', phase: 'press', value: 1 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/app/log', args: [] })).toEqual({ actionId: 'log.toggle', phase: 'press' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/nope', args: [] })).toBeNull();
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/1/nope', args: [] })).toBeNull();
  });

  it('addresses cameras and presets by name', () => {
    expect(oscSlug('Stage Left  (wide)')).toBe('stage_left_wide');
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/stage_left/home', args: [] })).toMatchObject({ actionId: 'ptz.home', phase: 'press', camera: null, cameraName: 'stage_left' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/Stage_Left/preset/podium', args: [] })).toMatchObject({ actionId: 'preset.recall', cameraName: 'stage_left', presetName: 'podium' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/preset/podium', args: [] })).toMatchObject({ actionId: 'preset.recall', camera: 2, presetName: 'podium' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/sel/preset', args: ['Podium'] })).toMatchObject({ actionId: 'preset.recall', camera: null, presetName: 'podium' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/select', args: ['stage left'] })).toEqual({ actionId: 'cam.select', phase: 'press', cameraName: 'stage_left' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/tally/pgm', args: ['zowiebox_sdi'] })).toMatchObject({ actionId: 'tally.pgm', cameraName: 'zowiebox_sdi' });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/nope', args: [] })).toBeNull();
    const cams = [{ id: 'a', name: 'Stage Left' }];
    const ps = [{ cameraId: 'a', name: 'Podium' }];
    expect(oscMapRows(cams, ps, 'name').some((r) => r.address === '/cam/stage_left/preset/podium')).toBe(true);
    expect(oscMapRows(cams, ps, 'index').some((r) => r.address === '/cam/1/preset/1')).toBe(true);
  });

  it('parses tally addresses', () => {
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/tally', args: [1] })).toEqual({ actionId: 'tally.pgm', phase: 'press', camera: 2 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/tally', args: [2] })).toEqual({ actionId: 'tally.pvw', phase: 'press', camera: 2 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/tally', args: [0] })).toEqual({ actionId: 'tally.clear', phase: 'press', camera: 2 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/2/tally', args: [] })).toBeNull();
    expect(parseBuiltinOsc({ type: 'osc', address: '/tally/pgm', args: [3] })).toEqual({ actionId: 'tally.pgm', phase: 'press', camera: 3 });
    expect(parseBuiltinOsc({ type: 'osc', address: '/cam/sel/tally/clear', args: [] })).toMatchObject({ actionId: 'tally.clear', phase: 'press', camera: null });
    expect(parseBuiltinOsc({ type: 'osc', address: '/app/panel', args: [] })).toEqual({ actionId: 'panel.toggle', phase: 'press' });
  });

  it('builds addresses and the address list', () => {
    const recall = ACTIONS.find((a) => a.id === 'preset.recall')!;
    expect(oscAddress(recall, 2, 5)).toBe('/cam/2/preset/5');
    expect(oscAddress(ACTIONS.find((a) => a.id === 'zoom.level')!, 'sel')).toBe('/cam/sel/zoom');
    const list = oscAddressList(2);
    expect(list).toContain('/cam/1/preset/<n>');
    expect(list).toContain('/cam/2/zoom <1..12>');
    expect(list).toContain('/cam/sel/track [0|1]');
  });
});

describe('describeTrigger / noteName', () => {
  it('prints readable trigger names', () => {
    expect(noteName(60)).toBe('C3');
    expect(noteName(61)).toBe('C#3');
    expect(describeTrigger({ type: 'midi', channel: 1, kind: 'cc', number: 21 })).toBe('CC 21 · ch1');
    expect(describeTrigger({ type: 'midi', channel: null, kind: 'note', number: 60, span: 64 })).toBe('C3 … D#8');
    expect(describeTrigger({ type: 'key', key: '1', ctrl: true, span: 9 })).toBe('Ctrl+1 … 9');
    expect(describeTrigger({ type: 'key', key: '=' })).toBe('=');
    expect(describeTrigger({ type: 'osc', address: '/cam/1/home' })).toBe('/cam/1/home');
  });
});
