/**
 * One ffmpeg process producing fragmented MP4 for one camera, with automatic restart.
 * Events: 'init' (Buffer, codec), 'segment' (Buffer), 'exit' (reason), 'log' (string).
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import type { VideoSource } from '../../shared/types';
import { ffmpegArgs, ffmpegPath } from './ffmpeg';
import { SegmentAssembler, codecFromInit } from './mp4';

export interface VideoStreamOptions {
  autoRestart?: boolean;
  ffmpeg?: string;
  /** Extra args for tests (e.g. ['-t', '1']). Inserted before the output options. */
  extraInputArgs?: string[];
}

const BACKOFF_MS = [1000, 2000, 4000, 8000];

export class VideoStream extends EventEmitter {
  private proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private assembler = new SegmentAssembler();
  private stderrTail: string[] = [];
  private restartTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private stopped = true;
  session = 0;
  init: Buffer | null = null;
  codec: string | null = null;

  constructor(
    readonly source: VideoSource,
    readonly url: string,
    private readonly opts: VideoStreamOptions = {},
  ) {
    super();
  }

  get running(): boolean {
    return this.proc !== null;
  }

  start(): void {
    this.stopped = false;
    this.spawnProcess();
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.kill();
  }

  /** Last few stderr lines, for error messages. */
  lastLog(): string {
    return this.stderrTail.join('\n');
  }

  private kill(): void {
    const p = this.proc;
    if (!p) return;
    this.proc = null;
    p.stdout.removeAllListeners();
    p.stderr.removeAllListeners();
    p.removeAllListeners();
    p.kill();
  }

  private spawnProcess(): void {
    if (this.proc) return;
    this.session += 1;
    this.init = null;
    this.codec = null;
    this.assembler = new SegmentAssembler();
    this.stderrTail = [];

    let bin: string;
    try {
      bin = this.opts.ffmpeg ?? ffmpegPath();
    } catch (e) {
      this.emit('exit', e instanceof Error ? e.message : String(e));
      return;
    }
    const args = ffmpegArgs(this.source, this.url);
    if (this.opts.extraInputArgs?.length) {
      const i = args.indexOf('-an');
      args.splice(i, 0, ...this.opts.extraInputArgs);
    }
    const session = this.session;
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    this.emit('log', `ffmpeg[${session}] ${args.join(' ')}`);

    proc.stdout.on('data', (chunk: Buffer) => {
      if (this.proc !== proc) return;
      let parsed;
      try {
        parsed = this.assembler.push(chunk);
      } catch (e) {
        this.emit('log', `mp4 parse error: ${e instanceof Error ? e.message : String(e)}`);
        this.kill();
        this.scheduleRestart('mp4 parse error');
        return;
      }
      if (parsed.init) {
        this.init = parsed.init;
        this.codec = codecFromInit(parsed.init);
        this.attempts = 0;
        this.emit('init', parsed.init, this.codec);
      }
      for (const s of parsed.segments) this.emit('segment', s);
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (text: string) => {
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line.trim());
        if (this.stderrTail.length > 8) this.stderrTail.shift();
        this.emit('log', line.trim());
      }
    });

    proc.on('error', (err) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.scheduleRestart(err.message);
    });

    proc.on('close', (code, signal) => {
      if (this.proc !== proc) return;
      this.proc = null;
      const why = this.stderrTail.length ? this.stderrTail[this.stderrTail.length - 1] : `ffmpeg exited (${code ?? signal})`;
      this.scheduleRestart(why);
    });
  }

  private scheduleRestart(reason: string): void {
    this.emit('exit', reason);
    if (this.stopped || this.opts.autoRestart === false) return;
    const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)];
    this.attempts += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.spawnProcess();
    }, delay);
  }
}
