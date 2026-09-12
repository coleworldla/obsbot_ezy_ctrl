/**
 * Auto-update through GitHub Releases (electron-updater). Downloads in the background and
 * installs when the user restarts. Only does anything in a packaged build.
 */
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { EventEmitter } from 'node:events';
import type { UpdateStatus } from '../shared/types';
import { errMsg, logger } from './log';

export class Updater extends EventEmitter {
  status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', message: app.isPackaged ? undefined : 'updates only work in the installed app' };
  private wired = false;

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // A 404 is the normal answer while the repository is private: keep it out of the error count.
    const isNoFeed = (m: unknown) => /404|not found/i.test(String(m));
    autoUpdater.logger = {
      info: (m: unknown) => logger.info('update', String(m)),
      warn: (m: unknown) => logger.warn('update', String(m)),
      error: (m: unknown) => (isNoFeed(m) ? logger.warn('update', 'no public release feed (repository private?); install updates by hand from GitHub Releases') : logger.error('update', String(m))),
      debug: () => undefined,
    };
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', message: undefined }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'available', version: info.version }));
    autoUpdater.on('update-not-available', (info) => this.set({ state: 'none', version: info.version, checkedAt: Date.now() }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => {
      logger.info('update', `version ${info.version} downloaded; it installs on the next restart`);
      this.set({ state: 'downloaded', version: info.version, percent: 100 });
    });
    autoUpdater.on('error', (e) => {
      const message = errMsg(e);
      this.set({
        state: 'error',
        message: isNoFeed(message) ? 'no public release feed (repository private?); install updates by hand' : message,
        checkedAt: Date.now(),
      });
    });
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status;
    this.wire();
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      this.set({ state: 'error', message: errMsg(e), checkedAt: Date.now() });
    }
    return this.status;
  }

  install(): void {
    if (this.status.state !== 'downloaded') return;
    logger.info('update', 'restarting to install the update');
    setImmediate(() => autoUpdater.quitAndInstall());
  }
}
