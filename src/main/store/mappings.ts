import fs from 'node:fs';
import path from 'node:path';
import { defaultMappings, type Mapping } from '../../shared/mapping';

interface FileShape {
  version: 1;
  mappings: Mapping[];
}

/** mappings.json: the whole mapping table; seeded with the keyboard defaults on first run. */
export class MappingStore {
  private mappings: Mapping[];

  constructor(private readonly file: string) {
    const read = this.read();
    this.mappings = read ?? defaultMappings();
    if (!read) this.write();
  }

  list(): Mapping[] {
    return structuredClone(this.mappings);
  }

  save(list: Mapping[]): Mapping[] {
    this.mappings = list.filter((m) => m && typeof m.id === 'string' && typeof m.actionId === 'string' && m.trigger && typeof m.trigger.type === 'string');
    this.write();
    return this.list();
  }

  resetToDefaults(): Mapping[] {
    this.mappings = defaultMappings();
    this.write();
    return this.list();
  }

  private read(): Mapping[] | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      return Array.isArray(parsed.mappings) ? parsed.mappings : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const data: FileShape = { version: 1, mappings: this.mappings };
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}
