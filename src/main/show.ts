/**
 * Shows (.ezy files): save the whole setup to a file, open one back, remember the current show
 * and its recent siblings, and back up the setup before a show replaces it.
 * No Electron imports: the dialogs live in show-dialogs.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildShow, parseShow, showFingerprint, showNameFromPath, UNTITLED_SHOW, type ShowContent, type ShowFile, type ShowOperator } from '../shared/show';
import type { ShowStatus } from '../shared/types';
import type { CameraStore } from './store/cameras';
import type { MappingStore } from './store/mappings';
import type { PresetStore } from './store/presets';
import type { SettingsStore } from './store/settings';

const RECENT_MAX = 8;
export const BACKUPS_KEEP = 20;

export interface ShowServiceDeps {
  store: CameraStore;
  presets: PresetStore;
  mappings: MappingStore;
  settings: SettingsStore;
  appVersion: string;
  /** Where the setup is copied before a show replaces it. */
  backupsDir: string;
  /** Close control and video for a camera that is leaving. */
  stopCamera: (id: string) => Promise<void>;
}

const samePath = (a: string, b: string) => {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' || process.platform === 'darwin' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

/** Write through a temporary file so a crash never leaves half a show. */
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const fileSafe = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').slice(0, 60).trim() || 'show';

export class ShowService {
  constructor(private readonly d: ShowServiceDeps) {}

  /** What a show file would contain right now. */
  content(): ShowContent {
    return { cameras: this.d.store.list(), presets: this.d.presets.list(), mappings: this.d.mappings.list(), osc: this.d.settings.get().osc };
  }

  status(): ShowStatus {
    const s = this.d.settings.get().show ?? {};
    const recent = (s.recent ?? []).map((p) => ({ path: p, name: showNameFromPath(p) }));
    if (!s.path) return { name: UNTITLED_SHOW, dirty: false, recent };
    return { path: s.path, name: showNameFromPath(s.path), dirty: s.savedPrint !== showFingerprint(this.content()), recent };
  }

  /** Write the current setup to `file` and make it the current show. */
  save(file: string, operator?: ShowOperator): ShowStatus {
    const content = this.content();
    writeAtomic(file, JSON.stringify(buildShow(showNameFromPath(file), this.d.appVersion, content, operator), null, 2));
    this.remember(file, showFingerprint(content));
    return this.status();
  }

  read(file: string): { show: ShowFile; warnings: string[] } {
    return parseShow(fs.readFileSync(file, 'utf8'));
  }

  /**
   * Replace the setup with `show`: back up the current one, close every camera, swap cameras,
   * presets, mappings and the OSC setup, and make `file` the current show.
   */
  async apply(show: ShowFile, file: string): Promise<{ status: ShowStatus; backup: string | null }> {
    const backup = this.backup(`before ${show.name}`);
    await Promise.all(this.d.store.list().map((c) => this.d.stopCamera(c.id)));
    this.d.store.replaceAll(show.cameras);
    this.d.presets.replaceAll(show.presets);
    if (show.mappings) this.d.mappings.save(show.mappings);
    if (show.osc) this.d.settings.set({ osc: { ...this.d.settings.get().osc, ...show.osc } });
    this.remember(file, showFingerprint(this.content()));
    return { status: this.status(), backup };
  }

  /** Copy the current setup into the backups folder (newest BACKUPS_KEEP kept). Null when there is nothing to keep. */
  backup(label: string): string | null {
    const content = this.content();
    if (!content.cameras.length && !content.presets.length) return null;
    const current = this.d.settings.get().show?.path;
    const name = current ? showNameFromPath(current) : UNTITLED_SHOW;
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
    const file = path.join(this.d.backupsDir, `${stamp} ${fileSafe(name)} (${fileSafe(label)}).ezy`);
    writeAtomic(file, JSON.stringify(buildShow(name, this.d.appVersion, content), null, 2));
    this.prune();
    return file;
  }

  /** Drop a path from the recent list (the file is gone). */
  forget(file: string): void {
    const s = this.d.settings.get().show ?? {};
    this.d.settings.set({ show: { ...s, recent: (s.recent ?? []).filter((p) => !samePath(p, file)) } });
  }

  private remember(file: string, savedPrint: string): void {
    const s = this.d.settings.get().show ?? {};
    const recent = [file, ...(s.recent ?? []).filter((p) => !samePath(p, file))].slice(0, RECENT_MAX);
    this.d.settings.set({ show: { path: file, savedPrint, recent } });
  }

  private prune(): void {
    try {
      const files = fs
        .readdirSync(this.d.backupsDir)
        .filter((f) => /\.ezy$/i.test(f))
        .sort();
      for (const f of files.slice(0, Math.max(0, files.length - BACKUPS_KEEP))) fs.rmSync(path.join(this.d.backupsDir, f), { force: true });
    } catch {
      /* a backup that cannot be pruned is not worth failing over */
    }
  }
}
