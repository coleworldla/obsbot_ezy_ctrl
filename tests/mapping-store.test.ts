import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultMappings, type Mapping } from '../src/shared/mapping';
import { MappingStore } from '../src/main/store/mappings';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezy-mappings-'));
  file = path.join(dir, 'mappings.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (version: number | undefined, mappings: Mapping[]) => fs.writeFileSync(file, JSON.stringify(version === undefined ? { mappings } : { version, mappings }));
const ids = (s: MappingStore) => s.list().map((m) => m.id);
const v1Defaults = () => defaultMappings().filter((m) => m.actionId !== 'show.save' && m.actionId !== 'show.open');

describe('MappingStore', () => {
  it('starts a new file with every default key, Save show and Open show included', () => {
    const s = new MappingStore(file);
    expect(ids(s)).toContain('key:show.save');
    expect(ids(s)).toContain('key:show.open');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(2);
  });

  it('gives an older file the new show keys once', () => {
    write(1, v1Defaults());
    const s = new MappingStore(file);
    expect(ids(s).filter((id) => id.startsWith('key:show.'))).toEqual(['key:show.save', 'key:show.open']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(2);
    // Deleting them afterwards sticks.
    s.save(s.list().filter((m) => !m.id.startsWith('key:show.')));
    expect(ids(new MappingStore(file)).some((id) => id.startsWith('key:show.'))).toBe(false);
  });

  it('does not take a key the user already mapped to something else', () => {
    const custom: Mapping = { id: 'key:preset.save', actionId: 'preset.save', trigger: { type: 'key', key: 'o', ctrl: true } };
    write(undefined, [...v1Defaults().filter((m) => m.id !== 'key:preset.save'), custom]);
    const s = new MappingStore(file);
    expect(ids(s)).toContain('key:show.save');
    expect(ids(s)).not.toContain('key:show.open');
    expect(s.list().find((m) => m.id === 'key:preset.save')?.trigger).toEqual(custom.trigger);
  });

  it('drops malformed rows when reading and saving', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 2, mappings: [defaultMappings()[0], { id: 'broken' }] }));
    const s = new MappingStore(file);
    expect(s.list()).toHaveLength(1);
  });
});
