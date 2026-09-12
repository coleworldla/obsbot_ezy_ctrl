import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PresetStore } from '../src/main/store/presets';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezy-presets-'));
  file = path.join(dir, 'presets.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const input = (cameraId: string, name: string, pan = 0) => ({ cameraId, name, panDeg: pan, tiltDeg: -4.5, zoomRatio: 2.4 });

describe('PresetStore', () => {
  it('adds with increasing order per camera and persists', () => {
    const s = new PresetStore(file);
    const a = s.add(input('cam1', 'Wide'));
    const b = s.add(input('cam1', 'Podium'));
    const c = s.add(input('cam2', 'Other'));
    expect([a.order, b.order, c.order]).toEqual([0, 1, 0]);
    const again = new PresetStore(file);
    expect(again.list('cam1').map((p) => p.name)).toEqual(['Wide', 'Podium']);
    expect(again.list()).toHaveLength(3);
  });

  it('updates, reorders and removes', () => {
    const s = new PresetStore(file);
    const a = s.add(input('cam1', 'A'));
    const b = s.add(input('cam1', 'B'));
    const c = s.add(input('cam1', 'C'));
    s.update(b.id, { name: 'Bee', cameraSlot: 7 });
    expect(s.get(b.id)?.name).toBe('Bee');
    expect(s.get(b.id)?.cameraSlot).toBe(7);
    s.reorder('cam1', [c.id, a.id]);
    expect(s.list('cam1').map((p) => p.name)).toEqual(['C', 'A', 'Bee']);
    s.remove(a.id);
    expect(s.list('cam1').map((p) => p.name)).toEqual(['C', 'Bee']);
    s.removeForCamera('cam1');
    expect(s.list()).toHaveLength(0);
  });

  it('exports and imports with fresh ids onto another camera', () => {
    const s = new PresetStore(file);
    s.add({ ...input('cam1', 'Wide'), thumbnail: 'data:image/jpeg;base64,AAAA' });
    s.add(input('cam1', 'Tight', 12.3));
    const exported = s.exportJson('cam1');
    expect(exported.presets).toHaveLength(2);
    const n = s.import(JSON.parse(JSON.stringify(exported)), 'cam2');
    expect(n).toBe(2);
    const imported = s.list('cam2');
    expect(imported.map((p) => p.name)).toEqual(['Wide', 'Tight']);
    expect(imported[0].id).not.toBe(exported.presets[0].id);
    expect(imported[0].thumbnail).toBe('data:image/jpeg;base64,AAAA');
    expect(imported[1].panDeg).toBe(12.3);
  });

  it('rejects garbage imports', () => {
    const s = new PresetStore(file);
    expect(() => s.import({ nope: true }, 'cam1')).toThrow();
    expect(s.import([{ name: 'bad' }], 'cam1')).toBe(0);
  });

  it('survives a corrupt file', () => {
    fs.writeFileSync(file, '{not json');
    const s = new PresetStore(file);
    expect(s.list()).toEqual([]);
  });
});
