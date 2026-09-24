/**
 * The Save / Open show flows with their file pickers and confirmation, used from the renderer
 * (menu, keys, MIDI, OSC) and from the OS (double-clicking a .ezy file).
 */
import { dialog, shell, type BrowserWindow, type MessageBoxOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { SHOW_EXTENSION, showNameFromPath, withShowExtension, type ShowOperator } from '../shared/show';
import type { ShowStatus } from '../shared/types';
import { errMsg, logger } from './log';
import type { ShowService } from './show';

const FILTERS = [{ name: 'EZY CTRL show', extensions: [SHOW_EXTENSION] }];
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export interface ShowActions {
  /** Save to the current show file, or ask for one. */
  save(operator?: ShowOperator): Promise<ShowStatus | null>;
  saveAs(operator?: ShowOperator): Promise<ShowStatus | null>;
  /** Open `file`, or ask for one; always confirms before replacing the setup. */
  open(file?: string): Promise<ShowStatus | null>;
  revealBackups(): Promise<void>;
}

export interface ShowActionsDeps {
  shows: ShowService;
  window: () => BrowserWindow | null;
  /** Default folder for the file pickers (created on first use). */
  showsDir: string;
  backupsDir: string;
  /** Re-apply what the show changed outside the stores (the OSC listener). */
  afterApply: () => Promise<void>;
  /** Scripted checks only (EZY_AUTOTEST=shows): save untitled shows to the default file and open without asking. */
  noPrompt?: boolean;
}

export function createShowActions(d: ShowActionsDeps): ShowActions {
  let busy = false;
  const win = () => d.window() ?? undefined;
  const box = (opts: MessageBoxOptions) => {
    const w = win();
    return w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
  };
  /** One file dialog at a time: a double key press or an OSC burst must not stack pickers. */
  const once = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (busy) return null;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  };

  const writeTo = async (file: string, operator?: ShowOperator): Promise<ShowStatus | null> => {
    try {
      const st = d.shows.save(file, operator);
      logger.info('show', `saved "${st.name}" to ${file}`);
      return st;
    } catch (e) {
      logger.error('show', `could not save ${file}: ${errMsg(e)}`);
      await box({ type: 'error', message: 'Could not save the show', detail: errMsg(e) });
      return null;
    }
  };

  const pickSavePath = async (): Promise<string | null> => {
    const current = d.shows.status().path;
    fs.mkdirSync(d.showsDir, { recursive: true });
    const defaultPath = current ?? path.join(d.showsDir, `Show ${new Date().toISOString().slice(0, 10)}.${SHOW_EXTENSION}`);
    if (d.noPrompt) return defaultPath;
    const opts = { title: 'Save show', defaultPath, filters: FILTERS, properties: ['createDirectory', 'showOverwriteConfirmation'] as ('createDirectory' | 'showOverwriteConfirmation')[] };
    const w = win();
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    return r.canceled || !r.filePath ? null : withShowExtension(r.filePath);
  };

  const saveAs = (operator?: ShowOperator) =>
    once(async () => {
      const file = await pickSavePath();
      return file ? writeTo(file, operator) : null;
    });

  const save = (operator?: ShowOperator) =>
    once(async () => {
      const current = d.shows.status().path;
      const file = current && fs.existsSync(path.dirname(current)) ? current : await pickSavePath();
      return file ? writeTo(file, operator) : null;
    });

  const open = (given?: string) =>
    once(async () => {
      let file = given;
      if (!file) {
        if (d.noPrompt) return null;
        fs.mkdirSync(d.showsDir, { recursive: true });
        const opts = { title: 'Open show', defaultPath: d.showsDir, filters: FILTERS, properties: ['openFile'] as 'openFile'[] };
        const w = win();
        const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
        if (r.canceled || !r.filePaths[0]) return null;
        file = r.filePaths[0];
      }
      const name = showNameFromPath(file);
      let parsed: ReturnType<ShowService['read']>;
      try {
        parsed = d.shows.read(file);
      } catch (e) {
        const gone = (e as NodeJS.ErrnoException).code === 'ENOENT';
        if (gone) d.shows.forget(file);
        logger.warn('show', `could not open ${file}: ${errMsg(e)}`);
        await box({ type: 'error', message: `Could not open "${name}"`, detail: gone ? `The file is no longer at ${file}.` : errMsg(e) });
        return null;
      }
      const { show, warnings } = parsed;
      const current = d.shows.status();
      const replaced = ['cameras', 'presets', ...(show.mappings ? ['mappings'] : []), ...(show.osc ? ['OSC setup'] : [])];
      const detail = [
        `"${name}" has ${plural(show.cameras.length, 'camera')} and ${plural(show.presets.length, 'preset')}. It replaces the ${replaced.slice(0, -1).join(', ')} and ${replaced[replaced.length - 1]} in EZY CTRL.`,
        `The current setup${current.dirty ? ` (with changes not saved to "${current.name}")` : ''} is copied to the backups folder first.`,
        ...(warnings.length ? [`Note: ${warnings.join('; ')}.`] : []),
      ].join('\n\n');
      const { response } = d.noPrompt ? { response: 0 } : await box({ type: 'question', buttons: ['Open show', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true, message: `Open the show "${name}"?`, detail });
      if (response !== 0) return null;
      const { status, backup } = await d.shows.apply(show, file);
      logger.info('show', `opened "${status.name}" (${plural(show.cameras.length, 'camera')}, ${plural(show.presets.length, 'preset')})${backup ? `; the previous setup is in ${backup}` : ''}`);
      if (warnings.length) logger.warn('show', `"${status.name}": ${warnings.join('; ')}`);
      await d.afterApply();
      d.window()?.webContents.send('show:loaded', { status, operator: show.operator ?? null });
      return status;
    });

  const revealBackups = async () => {
    fs.mkdirSync(d.backupsDir, { recursive: true });
    await shell.openPath(d.backupsDir);
  };

  return { save, saveAs, open, revealBackups };
}
