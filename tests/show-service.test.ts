import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultMappings } from '../src/shared/mapping';
import { buildShow, parseShow } from '../src/shared/show';
import { BACKUPS_KEEP, ShowService } from '../src/main/show';
import { CameraStore } from '../src/main/store/cameras';
import { MappingStore } from '../src/main/store/mappings';
import { PresetStore } from '../src/main/store/presets';
import { SettingsStore } from '../src/main/store/settings';

let dir: string;
let stopped: string[];

const setup = () => {
  const store = new CameraStore(path.join(dir, 'cameras.json'));
  const presets = new PresetStore(path.join(dir, 'presets.json'));
  const mappings = new MappingStore(path.join(dir, 'mappings.json'));
  const settings = new SettingsStore(path.join(dir, 'settings.json'));
  const shows = new ShowService({
    store,
    presets,
    mappings,
    settings,
    appVersion: '0.8.8',
    backupsDir: path.join(dir, 'backups'),
    stopCamera: async (id) => {
      stopped.push(id);
    },
  });
  return { store, presets, mappings, settings, shows };
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezy-shows-'));
  stopped = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ShowService', () => {
  it('saves the setup to a .ezy file and tracks unsaved changes', () => {
    const { store, presets, shows } = setup();
    const a = store.add({ name: 'Stage Left', host: '10.0.0.21', viscaPort: 52381, videoSource: 'ndi', videoUrl: '' });
    const p = presets.add({ cameraId: a.id, name: 'Podium', panDeg: 12, tiltDeg: -3, zoomRatio: 2 });
    expect(shows.status()).toMatchObject({ name: 'Untitled show', dirty: false, recent: [] });

    const file = path.join(dir, 'Sunday.ezy');
    const st = shows.save(file, { trackBox: true });
    expect(st).toMatchObject({ path: file, name: 'Sunday', dirty: false });
    const { show } = parseShow(fs.readFileSync(file, 'utf8'));
    expect(show.cameras.map((c) => c.name)).toEqual(['Stage Left']);
    expect(show.presets.map((x) => x.name)).toEqual(['Podium']);
    expect(show.operator).toEqual({ trackBox: true });

    presets.update(p.id, { name: 'Pulpit' });
    expect(shows.status().dirty).toBe(true);
    shows.save(file);
    expect(shows.status().dirty).toBe(false);
  });

  it('opens a show in place of the setup, after a backup, and closes the cameras that leave', async () => {
    const { store, presets, mappings, settings, shows } = setup();
    const old = store.add({ name: 'Old cam', host: '10.0.0.30', viscaPort: 52381, videoSource: 'rtsp', videoUrl: '' });
    presets.add({ cameraId: old.id, name: 'Old preset', panDeg: 0, tiltDeg: 0, zoomRatio: 1 });
    settings.set({ osc: { ...settings.get().osc, feedbackHost: '10.0.0.99' } });

    const incoming = buildShow('Gala', '0.8.8', {
      cameras: [{ id: 'g1', name: 'Gala Wide', host: '10.0.0.41', viscaPort: 52381, videoSource: 'ndi', videoUrl: '' }],
      presets: [{ id: 'gp', cameraId: 'g1', name: 'Stage', panDeg: 5, tiltDeg: 1, zoomRatio: 3, order: 0, createdAt: 1, updatedAt: 1 }],
      mappings: defaultMappings().filter((m) => m.actionId === 'ptz.home'),
      osc: { ...settings.get().osc, feedbackHost: '10.0.0.77', feedbackPort: 9555 },
    });
    const file = path.join(dir, 'shows', 'Gala.ezy');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(incoming));

    const { show } = shows.read(file);
    const { status, backup } = await shows.apply(show, file);

    expect(stopped).toEqual([old.id]);
    expect(store.list().map((c) => c.name)).toEqual(['Gala Wide']);
    expect(presets.list().map((p) => p.name)).toEqual(['Stage']);
    expect(mappings.list().map((m) => m.actionId)).toEqual(['ptz.home']);
    expect(settings.get().osc).toMatchObject({ feedbackHost: '10.0.0.77', feedbackPort: 9555 });
    expect(status).toMatchObject({ path: file, name: 'Gala', dirty: false });
    expect(backup).not.toBeNull();
    const saved = parseShow(fs.readFileSync(backup!, 'utf8')).show;
    expect(saved.cameras.map((c) => c.name)).toEqual(['Old cam']);
    expect(saved.presets.map((p) => p.name)).toEqual(['Old preset']);
  });

  it('keeps the current mappings when a hand-made show has none', async () => {
    const { mappings, shows } = setup();
    const before = mappings.list();
    const file = path.join(dir, 'Bare.ezy');
    fs.writeFileSync(file, JSON.stringify({ format: 'ezy-show', version: 1, cameras: [] }));
    await shows.apply(shows.read(file).show, file);
    expect(mappings.list()).toEqual(before);
  });

  it('keeps a short recent list, newest first, without repeats', () => {
    const { store, shows } = setup();
    store.add({ name: 'Cam', host: '10.0.0.21', viscaPort: 52381, videoSource: 'ndi', videoUrl: '' });
    const f = (n: string) => path.join(dir, `${n}.ezy`);
    shows.save(f('One'));
    shows.save(f('Two'));
    shows.save(f('One'));
    expect(shows.status().recent.map((r) => r.name)).toEqual(['One', 'Two']);
    shows.forget(f('Two'));
    expect(shows.status().recent.map((r) => r.name)).toEqual(['One']);
  });

  it('keeps the newest backups only', () => {
    const { store, shows } = setup();
    store.add({ name: 'Cam', host: '10.0.0.21', viscaPort: 52381, videoSource: 'ndi', videoUrl: '' });
    const backups = path.join(dir, 'backups');
    fs.mkdirSync(backups, { recursive: true });
    for (let i = 0; i < BACKUPS_KEEP + 5; i++) fs.writeFileSync(path.join(backups, `2000-01-01 00-00-${String(i).padStart(2, '0')} old.ezy`), '{}');
    const made = shows.backup('test');
    const left = fs.readdirSync(backups);
    expect(left).toHaveLength(BACKUPS_KEEP);
    expect(left).toContain(path.basename(made!));
    expect(left).not.toContain('2000-01-01 00-00-00 old.ezy');
  });

  it('makes no backup of an empty setup', () => {
    const { shows } = setup();
    expect(shows.backup('nothing')).toBeNull();
  });
});
