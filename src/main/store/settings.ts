import fs from 'node:fs';
import path from 'node:path';
import type { Settings } from '../../shared/types';

export const DEFAULT_SETTINGS: Settings = {
  osc: { enabled: true, listenPort: 9000, feedbackEnabled: false, feedbackHost: '', feedbackPort: 9001 },
  midi: { disabledDevices: [] },
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
    this.settings = {
      osc: { ...this.settings.osc, ...(patch.osc ?? {}) },
      midi: { ...this.settings.midi, ...(patch.midi ?? {}) },
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
    return this.get();
  }

  private read(): Settings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<Settings>;
      return {
        osc: { ...DEFAULT_SETTINGS.osc, ...(parsed.osc ?? {}) },
        midi: { ...DEFAULT_SETTINGS.midi, ...(parsed.midi ?? {}) },
      };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }
}
