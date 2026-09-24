import { describe, expect, it } from 'vitest';
import { defaultMappings } from '../src/shared/mapping';
import { buildShow, parseShow, showFileFromArgv, showFingerprint, showNameFromPath, ShowError, withShowExtension, type ShowContent } from '../src/shared/show';
import type { CameraConfig, Preset } from '../src/shared/types';

const cam = (id: string, name: string, extra: Partial<CameraConfig> = {}): CameraConfig => ({ id, name, host: '10.0.0.21', viscaPort: 52381, videoSource: 'ndi', videoUrl: '', ...extra });
const preset = (id: string, cameraId: string, order: number, extra: Partial<Preset> = {}): Preset => ({
  id,
  cameraId,
  name: `P${order + 1}`,
  panDeg: 10 * order,
  tiltDeg: -2,
  zoomRatio: 1.5,
  thumbnail: 'data:image/jpeg;base64,AAAA',
  order,
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});

const content = (): ShowContent => ({
  cameras: [cam('a', 'Stage Left'), cam('b', 'Encoder', { kind: 'monitor', videoSource: 'ndi' })],
  presets: [preset('p1', 'a', 0), preset('p2', 'a', 1, { cameraSlot: 12 })],
  mappings: defaultMappings(),
  osc: { enabled: true, listenPort: 9000, feedbackEnabled: true, feedbackHost: '10.0.0.50', feedbackPort: 9001, naming: 'name' },
});

describe('show files', () => {
  it('round-trips everything a show carries', () => {
    const c = content();
    const file = buildShow('Sunday', '0.8.8', c, { recallSpeed: { pan: 10, tilt: 9 }, speed: { pan: 12, tilt: 10, zoom: 3 }, trackBox: true }, new Date('2026-09-24T20:00:00Z'));
    const { show, warnings } = parseShow(JSON.stringify(file, null, 2));
    expect(warnings).toEqual([]);
    expect(show).toMatchObject({ format: 'ezy-show', version: 1, name: 'Sunday', appVersion: '0.8.8', savedAt: '2026-09-24T20:00:00.000Z' });
    expect(show.cameras).toEqual(c.cameras);
    expect(show.presets).toEqual(c.presets);
    expect(show.mappings).toEqual(c.mappings);
    expect(show.osc).toEqual(c.osc);
    expect(show.operator).toEqual({ recallSpeed: { pan: 10, tilt: 9 }, speed: { pan: 12, tilt: 10, zoom: 3 }, trackBox: true });
  });

  it('refuses files that are not shows, or come from a newer app', () => {
    expect(() => parseShow('not json')).toThrow(ShowError);
    expect(() => parseShow('{"presets":[]}')).toThrow(/not an EZY CTRL show/);
    expect(() => parseShow(JSON.stringify({ format: 'ezy-show', version: 2, cameras: [] }))).toThrow(/newer EZY CTRL/);
    expect(() => parseShow(JSON.stringify({ format: 'ezy-show', version: 1 }))).toThrow(/no camera list/);
  });

  it('keeps what it can from a damaged or hand-made file and says what it left out', () => {
    const { show, warnings } = parseShow(
      JSON.stringify({
        format: 'ezy-show',
        version: 1,
        cameras: [cam('a', 'A', { videoSource: 'bogus' as never }), { name: 'no id' }, cam('a', 'duplicate id')],
        presets: [preset('p1', 'a', 0, { thumbnail: 'javascript:alert(1)' }), preset('p2', 'gone', 1), { id: 'p3' }],
        mappings: [...defaultMappings().slice(0, 2), { id: 'x' }],
        osc: { listenPort: 70000, feedbackHost: '10.0.0.9', naming: 'weird' },
        operator: { speed: { pan: 99, tilt: 0, zoom: 20 } },
      }),
    );
    expect(show.cameras).toHaveLength(1);
    expect(show.cameras[0].videoSource).toBe('rtsp');
    expect(show.presets.map((p) => p.id)).toEqual(['p1']);
    expect(show.presets[0].thumbnail).toBeUndefined();
    expect(show.mappings).toHaveLength(2);
    expect(show.osc).toEqual({ feedbackHost: '10.0.0.9' });
    expect(show.operator).toEqual({ speed: { pan: 24, tilt: 1, zoom: 8 } });
    expect(show.name).toBe('Untitled show');
    expect(warnings.join(' | ')).toMatch(/2 cameras .* left out/);
    expect(warnings.join(' | ')).toMatch(/1 preset for cameras that are not in the show/);
    expect(warnings.join(' | ')).toMatch(/1 mapping that could not be read/);
  });

  it('leaves the mappings and OSC setup alone when the file has none', () => {
    const { show } = parseShow(JSON.stringify({ format: 'ezy-show', version: 1, cameras: [cam('a', 'A')] }));
    expect(show.mappings).toBeUndefined();
    expect(show.osc).toBeUndefined();
    expect(show.presets).toEqual([]);
  });

  it('fingerprints the setup regardless of key order, and notices changes', () => {
    const c = content();
    const shuffled: ShowContent = {
      osc: { ...c.osc },
      mappings: c.mappings.map((m) => ({ trigger: m.trigger, actionId: m.actionId, id: m.id })),
      presets: [...c.presets].reverse().map((p) => Object.fromEntries(Object.entries(p).reverse()) as unknown as Preset),
      cameras: c.cameras.map((x) => ({ ...x })),
    };
    expect(showFingerprint(shuffled)).toBe(showFingerprint(c));
    const moved = { ...c, presets: [{ ...c.presets[0], panDeg: 11 }, c.presets[1]] };
    expect(showFingerprint(moved)).not.toBe(showFingerprint(c));
    expect(showFingerprint({ ...c, osc: { ...c.osc, feedbackPort: 9002 } })).not.toBe(showFingerprint(c));
  });

  it('names shows after their file and finds them on a command line', () => {
    expect(showNameFromPath('D:\\Shows\\Sunday Service.ezy')).toBe('Sunday Service');
    expect(showNameFromPath('/Users/me/Shows/Gala.EZY')).toBe('Gala');
    expect(withShowExtension('C:\\Shows\\Gala')).toBe('C:\\Shows\\Gala.ezy');
    expect(withShowExtension('C:\\Shows\\Gala.ezy')).toBe('C:\\Shows\\Gala.ezy');
    expect(showFileFromArgv(['--allow-file-access', 'C:\\Shows\\Gala.ezy'])).toBe('C:\\Shows\\Gala.ezy');
    expect(showFileFromArgv(['.', '--inspect'])).toBeNull();
  });
});
