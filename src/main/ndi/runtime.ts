/**
 * Locate the NDI runtime library on this machine. We never ship it: NDI's redistributable model is
 * that apps load the runtime the user installed (NDI Tools on Windows, the NDI Runtime for Apple on macOS).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

/** libndi.dylib also lives inside the NDI Tools app bundles on macOS; scanning them is the last resort. */
function macBundleDirs(): string[] {
  const roots = ['/Applications', '/Applications/NDI Tools', '/Applications/NDI', path.join(os.homedir(), 'Applications')];
  const out: string[] = [];
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.endsWith('.app') || !/ndi/i.test(e)) continue;
      out.push(path.join(root, e, 'Contents', 'Frameworks'), path.join(root, e, 'Contents', 'MacOS'));
    }
  }
  return out;
}

function candidateDirs(override?: string): { dir: string; from: string }[] {
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
    for (const dir of ['/usr/local/lib', '/opt/homebrew/lib', '/Library/NDI SDK for Apple/lib/macOS', '/Library/NDI Advanced SDK for Apple/lib/macOS']) candidates.push({ dir, from: 'default install folder' });
    for (const dir of macBundleDirs()) candidates.push({ dir, from: 'inside an NDI app bundle' });
  } else {
    for (const dir of ['/usr/lib', '/usr/local/lib', '/usr/lib/x86_64-linux-gnu']) candidates.push({ dir, from: 'default install folder' });
  }
  return candidates;
}

/** Folders the app looks in, for the "not found" message. */
export function ndiSearchDirs(override?: string): string[] {
  return [...new Set(candidateDirs(override).map((c) => c.dir))];
}

/** Matches the plain library name and versioned variants (libndi.6.dylib, libndi.so.6). */
function libNameMatcher(lib: string): RegExp {
  const [base, ...rest] = lib.split('.');
  const ext = rest.join('.');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(base)}(\\.\\d+)*\\.${esc(ext)}(\\.\\d+)*$`, 'i');
}

export function findNdiRuntime(override?: string): NdiRuntimeLocation | null {
  const lib = LIB_NAME[process.platform];
  if (!lib) return null;
  const versioned = libNameMatcher(lib);
  for (const c of candidateDirs(override)) {
    const direct = path.join(c.dir, lib);
    if (fs.existsSync(direct)) return { path: direct, from: c.from };
    // A file path was given instead of a folder.
    if (/\.(dll|dylib|so)(\.\d+)*$/i.test(c.dir) && fs.existsSync(c.dir)) return { path: c.dir, from: c.from };
    // Versioned file without the plain symlink.
    try {
      const hit = fs.readdirSync(c.dir).find((f) => versioned.test(f));
      if (hit) return { path: path.join(c.dir, hit), from: c.from };
    } catch {
      /* folder missing */
    }
  }
  return null;
}

/** Where to get the runtime, for error messages and the dialog. */
export const NDI_RUNTIME_DOWNLOAD = 'https://ndi.video/tools/';
export const NDI_RUNTIME_DOWNLOAD_MAC = 'https://ndi.link/NDIRedistV6Apple';

export function ndiRuntimeDownloadUrl(): string {
  return process.platform === 'darwin' ? NDI_RUNTIME_DOWNLOAD_MAC : NDI_RUNTIME_DOWNLOAD;
}

/** Platform-specific "not found" explanation. NDI Tools installs the runtime on Windows but not on macOS. */
export function ndiNotFoundMessage(override?: string): string {
  const dirs = ndiSearchDirs(override).join(', ');
  if (process.platform === 'darwin') {
    return `NDI runtime not found. On macOS, NDI Tools does not install the runtime library: install the NDI Runtime for Apple (${NDI_RUNTIME_DOWNLOAD_MAC}, or in Terminal: brew install --cask libndi), then press Refresh. Looked in: ${dirs}. If it is somewhere else, use Locate runtime…`;
  }
  if (process.platform === 'win32') {
    return `NDI runtime not found. Install NDI Tools or the NDI Runtime from ${NDI_RUNTIME_DOWNLOAD}, then press Refresh. Looked in: ${dirs}. If it is somewhere else, use Locate runtime…`;
  }
  return `NDI runtime (libndi.so) not found. Install the NDI SDK / runtime for Linux, then press Refresh. Looked in: ${dirs}.`;
}
