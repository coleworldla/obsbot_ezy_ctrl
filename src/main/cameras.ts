/**
 * Owns one Tail2 connection per configured camera and polls position for the UI.
 */
import type { CameraConfig, CameraStatus, TestResult } from '../shared/types';
import { errMsg, logger } from './log';
import type { CameraStore } from './store/cameras';
import { Tail2 } from './visca/tail2';

const POLL_MS = 500;
const FAILS_BEFORE_OFFLINE = 3;

export class CameraManager {
  private readonly cams = new Map<string, Tail2>();
  private readonly status = new Map<string, CameraStatus>();
  private readonly failures = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly store: CameraStore,
    private readonly emit: (s: CameraStatus) => void,
  ) {}

  startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.pollAll(), POLL_MS);
  }

  stopAll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const cam of this.cams.values()) cam.close();
    this.cams.clear();
  }

  async connect(id: string): Promise<CameraStatus> {
    const cfg = this.store.get(id);
    if (!cfg) throw new Error(`camera ${id} not found`);
    let cam = this.cams.get(id);
    if (!cam) {
      cam = new Tail2(cfg.host, cfg.viscaPort);
      this.cams.set(id, cam);
      logger.info('visca', `${cfg.name}: connecting to ${cfg.host}:${cfg.viscaPort}`, id);
    }
    if (!cam.isOpen) await cam.open();
    return this.probe(id, cam);
  }

  disconnect(id: string): void {
    const had = this.cams.has(id);
    this.cams.get(id)?.close();
    this.cams.delete(id);
    this.failures.delete(id);
    if (had) logger.info('visca', `${this.label(id)}: disconnected`, id);
    this.push({ id, connected: false, updatedAt: Date.now() });
  }

  /** Reconnect with a fresh config (host/port may have changed). */
  async reconnect(cfg: CameraConfig): Promise<void> {
    this.disconnect(cfg.id);
    await this.connect(cfg.id).catch(() => undefined);
  }

  get(id: string): Tail2 {
    const cam = this.cams.get(id);
    if (!cam || !cam.isOpen) throw new Error('camera not connected');
    return cam;
  }

  statuses(): CameraStatus[] {
    return [...this.status.values()];
  }

  /** One-off probe used by the Add-camera dialog; does not keep the socket. */
  static async test(host: string, port: number): Promise<TestResult> {
    const cam = new Tail2(host, port, { timeoutMs: 1500 });
    try {
      await cam.open();
      const t0 = Date.now();
      const position = await cam.position();
      logger.info('visca', `test ${host}:${port}: reply in ${Date.now() - t0} ms`);
      return { ok: true, latencyMs: Date.now() - t0, position };
    } catch (e) {
      logger.warn('visca', `test ${host}:${port}: ${errMsg(e)}`);
      return { ok: false, error: errMsg(e) };
    } finally {
      cam.close();
    }
  }

  private label(id: string): string {
    return this.store.get(id)?.name ?? id;
  }

  private async probe(id: string, cam: Tail2): Promise<CameraStatus> {
    const t0 = Date.now();
    const prev = this.status.get(id);
    try {
      const position = await cam.position();
      this.failures.set(id, 0);
      if (!prev?.connected) logger.info('visca', `${this.label(id)}: online, ${Date.now() - t0} ms round trip`, id);
      return this.push({ id, connected: true, latencyMs: Date.now() - t0, position, updatedAt: Date.now() });
    } catch (e) {
      const n = (this.failures.get(id) ?? 0) + 1;
      this.failures.set(id, n);
      const connected = n < FAILS_BEFORE_OFFLINE && (prev?.connected ?? false);
      if (n === 1 && prev?.connected) logger.warn('visca', `${this.label(id)}: ${errMsg(e)}`, id);
      if (n === FAILS_BEFORE_OFFLINE) logger.error('visca', `${this.label(id)}: offline after ${n} failed polls (${errMsg(e)})`, id);
      return this.push({
        id,
        connected,
        lastError: errMsg(e),
        position: prev?.position,
        updatedAt: Date.now(),
      });
    }
  }

  private async pollAll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await Promise.all([...this.cams.entries()].map(([id, cam]) => (cam.isOpen ? this.probe(id, cam) : null)));
    } finally {
      this.polling = false;
    }
  }

  private push(s: CameraStatus): CameraStatus {
    this.status.set(s.id, s);
    this.emit(s);
    return s;
  }
}
