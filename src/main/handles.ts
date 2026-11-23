/**
 * Windows: keep this process's sockets out of child processes.
 *
 * Node starts children (ffmpeg) with handle inheritance on, so a child receives every handle marked inheritable.
 * Sockets opened by native libraries (the NDI runtime) are inheritable by default. While ffmpeg holds a copy, NDI
 * cannot stop its discovery thread, and NDIlib_find_destroy blocks the main process for as long as ffmpeg runs: the
 * app froze at startup with an RTSP camera next to NDI cameras. Clearing the flag on our sockets just before each
 * spawn keeps them out of the child. Pipes, events and every other handle are left alone. Elsewhere a no-op.
 */
import koffi from 'koffi';

const HANDLE_FLAG_INHERIT = 1;
const PROCESS_HANDLE_INFORMATION = 51;
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004 | 0;
const SOL_SOCKET = 0xffff;
const SO_TYPE = 0x1008;

interface Api {
  currentProcess: () => number;
  getInfo: (h: number, flags: number[]) => number;
  setInfo: (h: number, mask: number, flags: number) => number;
  query: (process: number, cls: number, buf: Buffer, len: number, needed: number[]) => number;
  getsockopt: (s: number, level: number, name: number, val: Buffer, len: number[]) => number;
}

let api: Api | null | undefined;

function load(): Api | null {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const k = koffi.load('kernel32.dll');
    const n = koffi.load('ntdll.dll');
    const w = koffi.load('ws2_32.dll');
    api = {
      currentProcess: k.func('intptr_t GetCurrentProcess()') as Api['currentProcess'],
      getInfo: k.func('int GetHandleInformation(uintptr_t h, _Out_ uint32_t *flags)') as Api['getInfo'],
      setInfo: k.func('int SetHandleInformation(uintptr_t h, uint32_t mask, uint32_t flags)') as Api['setInfo'],
      query: n.func('int32_t NtQueryInformationProcess(intptr_t process, int32_t cls, _Out_ uint8_t *buf, uint32_t len, _Out_ uint32_t *needed)') as Api['query'],
      getsockopt: w.func('int getsockopt(uintptr_t s, int level, int name, _Out_ uint8_t *val, _Inout_ int *len)') as Api['getsockopt'],
    };
  } catch {
    api = null;
  }
  return api;
}

/** Every handle value this process holds (PROCESS_HANDLE_SNAPSHOT_INFORMATION, x64 layout); [] when Windows will not say. */
function handleValues(a: Api): number[] {
  let size = 64 * 1024;
  for (let tries = 0; tries < 4; tries++) {
    const buf = Buffer.alloc(size);
    const needed = [0];
    const status = a.query(a.currentProcess(), PROCESS_HANDLE_INFORMATION, buf, size, needed);
    if (status === STATUS_INFO_LENGTH_MISMATCH) {
      size = Math.max(needed[0] + 4096, size * 2);
      continue;
    }
    if (status !== 0) return [];
    const count = Number(buf.readBigUInt64LE(0));
    const out: number[] = [];
    for (let i = 0, o = 16; i < count && o + 40 <= buf.length; i++, o += 40) out.push(Number(buf.readBigUInt64LE(o)));
    return out;
  }
  return [];
}

/** Clear the inherit flag on every inheritable socket this process holds. Returns how many it changed. */
export function stopSocketInheritance(): number {
  const a = load();
  if (!a) return 0;
  const val = Buffer.alloc(4);
  let changed = 0;
  for (const h of handleValues(a)) {
    const flags = [0];
    if (!a.getInfo(h, flags) || !(flags[0] & HANDLE_FLAG_INHERIT)) continue;
    if (a.getsockopt(h, SOL_SOCKET, SO_TYPE, val, [4]) !== 0) continue; // not a socket
    if (a.setInfo(h, HANDLE_FLAG_INHERIT, 0)) changed += 1;
  }
  return changed;
}
