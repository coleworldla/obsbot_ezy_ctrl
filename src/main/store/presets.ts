import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Preset, PresetExport, PresetInput, PresetPatch } from '../../shared/types';

interface FileShape {
  version: 1;
  presets: Preset[];
}

/** JSON-file backed preset list, cached in memory, written through on every change. */
export class PresetStore {
  private presets: Preset[];

  constructor(private readonly file: string) {
    this.presets = this.read();
  }

  list(cameraId?: string): Preset[] {
    const all = cameraId ? this.presets.filter((p) => p.cameraId === cameraId) : this.presets;
    return [...all].sort((a, b) => a.cameraId.localeCompare(b.cameraId) || a.order - b.order);
  }

  get(id: string): Preset | undefined {
    return this.presets.find((p) => p.id === id);
  }

  add(input: PresetInput): Preset {
    const now = Date.now();
    const order = this.presets.filter((p) => p.cameraId === input.cameraId).reduce((m, p) => Math.max(m, p.order), -1) + 1;
    const preset: Preset = { ...input, id: randomUUID(), order, createdAt: now, updatedAt: now };
    this.presets.push(preset);
    this.write();
    return preset;
  }

  update(id: string, patch: PresetPatch): Preset {
    const i = this.presets.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`preset ${id} not found`);
    const next: Preset = { ...this.presets[i], ...patch, updatedAt: Date.now() };
    this.presets[i] = next;
    this.write();
    return next;
  }

  remove(id: string): void {
    this.presets = this.presets.filter((p) => p.id !== id);
    this.write();
  }

  /** Delete several presets with a single write. Returns how many went. */
  removeMany(ids: string[]): number {
    const drop = new Set(ids);
    const before = this.presets.length;
    this.presets = this.presets.filter((p) => !drop.has(p.id));
    if (this.presets.length !== before) this.write();
    return before - this.presets.length;
  }

  /** Every preset at once (opening a show). */
  replaceAll(presets: Preset[]): void {
    this.presets = presets.map((p) => ({ ...p }));
    this.write();
  }

  removeForCamera(cameraId: string): void {
    this.presets = this.presets.filter((p) => p.cameraId !== cameraId);
    this.write();
  }

  /** New order for one camera; ids not listed keep their relative order after the listed ones. */
  reorder(cameraId: string, ids: string[]): Preset[] {
    const mine = this.list(cameraId);
    const listed = ids.map((id) => mine.find((p) => p.id === id)).filter((p): p is Preset => !!p);
    const rest = mine.filter((p) => !ids.includes(p.id));
    [...listed, ...rest].forEach((p, i) => {
      p.order = i;
    });
    this.write();
    return this.list(cameraId);
  }

  exportJson(cameraId?: string): PresetExport {
    return { version: 1, app: 'obsbot-ezy-ctrl', exportedAt: new Date().toISOString(), presets: this.list(cameraId) };
  }

  /** Append presets from an export (or a bare array) to `cameraId`, with fresh ids. Returns how many were added. */
  import(data: unknown, cameraId: string): number {
    const list = Array.isArray(data) ? data : (data as Partial<PresetExport>)?.presets;
    if (!Array.isArray(list)) throw new Error('not a preset export');
    let n = 0;
    for (const raw of list) {
      const p = raw as Partial<Preset>;
      if (typeof p.panDeg !== 'number' || typeof p.tiltDeg !== 'number' || typeof p.zoomRatio !== 'number') continue;
      this.add({
        cameraId,
        name: typeof p.name === 'string' && p.name.trim() ? p.name : `Preset ${n + 1}`,
        panDeg: p.panDeg,
        tiltDeg: p.tiltDeg,
        zoomRatio: p.zoomRatio,
        thumbnail: typeof p.thumbnail === 'string' && p.thumbnail.startsWith('data:image/') ? p.thumbnail : undefined,
      });
      n += 1;
    }
    return n;
  }

  private read(): Preset[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      return Array.isArray(parsed.presets) ? parsed.presets : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const data: FileShape = { version: 1, presets: this.presets };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
  }
}
