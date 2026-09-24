import fs from 'node:fs';
import path from 'node:path';
import { defaultMappings, isMapping, type KeyTrigger, type Mapping } from '../../shared/mapping';

/** Mapping file format. 2 = the Save show / Open show keys exist. */
const VERSION = 2;

/**
 * Default keys that came after a mapping file could already exist. A file older than `since`
 * gets them once, when that key combination is still free; deleting them later sticks.
 */
const ADDED_DEFAULTS: { since: number; actionIds: string[] }[] = [{ since: 2, actionIds: ['show.save', 'show.open'] }];

interface FileShape {
  version: number;
  mappings: Mapping[];
}

const sameKey = (a: KeyTrigger, b: KeyTrigger) => a.key === b.key && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;

/** Add the defaults introduced after `version` whose key combination nobody uses yet. */
export function upgradeMappings(list: Mapping[], version: number): Mapping[] {
  const out = [...list];
  const defaults = defaultMappings();
  for (const added of ADDED_DEFAULTS) {
    if (version >= added.since) continue;
    for (const actionId of added.actionIds) {
      const def = defaults.find((m) => m.actionId === actionId);
      if (!def || def.trigger.type !== 'key' || out.some((m) => m.id === def.id)) continue;
      const trigger = def.trigger;
      if (out.some((m) => m.trigger.type === 'key' && sameKey(m.trigger, trigger))) continue;
      out.push(def);
    }
  }
  return out;
}

/** mappings.json: the whole mapping table; seeded with the keyboard defaults on first run. */
export class MappingStore {
  private mappings: Mapping[];

  constructor(private readonly file: string) {
    const read = this.read();
    if (!read) {
      this.mappings = defaultMappings();
      this.write();
    } else if (read.version < VERSION) {
      this.mappings = upgradeMappings(read.mappings, read.version);
      this.write();
    } else {
      this.mappings = read.mappings;
    }
  }

  list(): Mapping[] {
    return structuredClone(this.mappings);
  }

  save(list: Mapping[]): Mapping[] {
    this.mappings = list.filter(isMapping);
    this.write();
    return this.list();
  }

  resetToDefaults(): Mapping[] {
    this.mappings = defaultMappings();
    this.write();
    return this.list();
  }

  private read(): FileShape | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      if (!Array.isArray(parsed.mappings)) return null;
      return { version: typeof parsed.version === 'number' ? parsed.version : 1, mappings: parsed.mappings.filter(isMapping) };
    } catch {
      return null;
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const data: FileShape = { version: VERSION, mappings: this.mappings };
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}
