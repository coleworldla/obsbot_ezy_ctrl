/**
 * App-wide logger: in-memory ring buffer for the in-app Log panel, mirrored to the console
 * and appended to a log file under userData/logs so problems can be looked at after the fact.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { LogEntry, LogLevel } from '../shared/types';

const MAX_ENTRIES = 2000;
const ROTATE_BYTES = 5 * 1024 * 1024;

export class Logger extends EventEmitter {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private stream: fs.WriteStream | null = null;
  filePath: string | null = null;

  attachFile(file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > ROTATE_BYTES) fs.renameSync(file, `${file}.1`);
    } catch {
      /* ignore rotation problems */
    }
    this.filePath = file;
    this.stream = fs.createWriteStream(file, { flags: 'a' });
    this.stream.on('error', () => {
      this.stream = null;
    });
  }

  log(level: LogLevel, source: string, message: string, cameraId?: string): LogEntry {
    const entry: LogEntry = { id: this.nextId++, ts: Date.now(), level, source, message, cameraId };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    const line = `${new Date(entry.ts).toISOString()} ${level.toUpperCase().padEnd(5)} [${source}] ${message}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
    this.stream?.write(`${line}\n`);
    this.emit('entry', entry);
    return entry;
  }

  info(source: string, message: string, cameraId?: string): LogEntry {
    return this.log('info', source, message, cameraId);
  }

  warn(source: string, message: string, cameraId?: string): LogEntry {
    return this.log('warn', source, message, cameraId);
  }

  error(source: string, message: string, cameraId?: string): LogEntry {
    return this.log('error', source, message, cameraId);
  }

  list(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

export const logger = new Logger();

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
