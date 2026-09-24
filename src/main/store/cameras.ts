import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CameraConfig, CameraInput } from '../../shared/types';

interface FileShape {
  version: 1;
  cameras: CameraConfig[];
}

/** JSON-file backed camera list. No Electron imports so it can be unit-tested. */
export class CameraStore {
  constructor(private readonly file: string) {}

  list(): CameraConfig[] {
    return this.read().cameras;
  }

  get(id: string): CameraConfig | undefined {
    return this.list().find((c) => c.id === id);
  }

  add(input: CameraInput): CameraConfig {
    const cam: CameraConfig = { ...input, id: randomUUID() };
    const data = this.read();
    data.cameras.push(cam);
    this.write(data);
    return cam;
  }

  update(cam: CameraConfig): CameraConfig {
    const data = this.read();
    const i = data.cameras.findIndex((c) => c.id === cam.id);
    if (i < 0) throw new Error(`camera ${cam.id} not found`);
    data.cameras[i] = cam;
    this.write(data);
    return cam;
  }

  remove(id: string): void {
    const data = this.read();
    data.cameras = data.cameras.filter((c) => c.id !== id);
    this.write(data);
  }

  /** The whole list at once (opening a show). */
  replaceAll(cameras: CameraConfig[]): void {
    this.write({ version: 1, cameras });
  }

  private read(): FileShape {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      return { version: 1, cameras: Array.isArray(parsed.cameras) ? parsed.cameras : [] };
    } catch {
      return { version: 1, cameras: [] };
    }
  }

  private write(data: FileShape): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}
