import fs from 'node:fs';
import path from 'node:path';
import type { Settings } from '../../shared/types';

export const DEFAULT_SETTINGS: Settings = {
  osc: { enabled: true, listenPort: 9000, feedbackEnabled: false, feedbackHost: '', feedbackPort: 9001 },
  midi: { disabledDevices: [] },
  updates: { autoCheck: true },
};

/** settings.json: small, merged with defaults on read so new keys always exist. */
export class SettingsStore {
  private settings: Settings;

  constructor(private readonly file: string) {
    this.settings = this.read();
  }

  get(): Settings {
    return structuredClone(this.settings);
  }

  set(patch: Partial<Settings>): Settings {
    this.settings = merge(this.settings, patch);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
    return this.get();
  }

  private read(): Settings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<Settings>;
      return merge(structuredClone(DEFAULT_SETTINGS), parsed);
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }
}

function merge(base: Settings, patch: Partial<Settings>): Settings {
  return {
    osc: { ...base.osc, ...(patch.osc ?? {}) },
    midi: { ...base.midi, ...(patch.midi ?? {}) },
    updates: { ...base.updates, ...(patch.updates ?? {}) },
  };
}
