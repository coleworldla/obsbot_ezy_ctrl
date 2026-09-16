/**
 * Locate the NDI runtime library on this machine. We never ship it: NDI's redistributable model is
 * that apps load the runtime the user installed (NDI Tools or the standalone NDI Runtime).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface NdiRuntimeLocation {
  path: string;
  from: string;
}

const LIB_NAME: Partial<Record<NodeJS.Platform, string>> = {
  win32: process.arch === 'arm64' ? 'Processing.NDI.Lib.ARM64.dll' : 'Processing.NDI.Lib.x64.dll',
  darwin: 'libndi.dylib',
  linux: 'libndi.so',
};

/** Windows: read the machine-wide NDI_RUNTIME_DIR_* variables even if this process inherited an older environment. */
function registryRuntimeDirs(): string[] {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    return out
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*NDI_RUNTIME_DIR_V(\d)\s+REG_\w+\s+(.+?)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map((m) => m[2]);
  } catch {
    return [];
  }
}

export function findNdiRuntime(override?: string): NdiRuntimeLocation | null {
  const lib = LIB_NAME[process.platform];
  if (!lib) return null;
  const candidates: { dir: string; from: string }[] = [];
  if (override) candidates.push({ dir: override, from: 'settings' });
  for (const v of ['6', '5', '4']) {
    const dir = process.env[`NDI_RUNTIME_DIR_V${v}`];
    if (dir) candidates.push({ dir, from: `NDI_RUNTIME_DIR_V${v}` });
  }
  for (const dir of registryRuntimeDirs()) candidates.push({ dir, from: 'registry NDI_RUNTIME_DIR' });
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    for (const dir of [
      path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6'),
      path.join(pf, 'NDI', 'NDI 6 Tools', 'Runtime'),
      path.join(pf, 'NDI', 'NDI 5 Runtime', 'v5'),
      path.join(pf, 'NewTek', 'NDI 5 Runtime', 'v5'),
    ])
      candidates.push({ dir, from: 'default install folder' });
  } else if (process.platform === 'darwin') {
    for (const dir of ['/usr/local/lib', '/Library/NDI SDK for Apple/lib/macOS', '/Library/NDI Advanced SDK for Apple/lib/macOS']) candidates.push({ dir, from: 'default install folder' });
  } else {
    for (const dir of ['/usr/lib', '/usr/local/lib', '/usr/lib/x86_64-linux-gnu']) candidates.push({ dir, from: 'default install folder' });
  }
  for (const c of candidates) {
    const direct = path.join(c.dir, lib);
    if (fs.existsSync(direct)) return { path: direct, from: c.from };
    // A file path was given instead of a folder.
    if (c.dir.toLowerCase().endsWith(lib.toLowerCase()) && fs.existsSync(c.dir)) return { path: c.dir, from: c.from };
  }
  return null;
}

/** Where to get the runtime, for error messages and the dialog. */
export const NDI_RUNTIME_DOWNLOAD = 'https://ndi.video/tools/';
