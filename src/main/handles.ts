/**
 * Windows: keep this process's sockets out of child processes.
 *
 * Node starts children (ffmpeg) with handle inheritance on, so a child receives every handle marked inheritable.
 * Sockets opened by native libraries (the NDI runtime) are inheritable by default. While ffmpeg holds a copy, NDI
 * cannot stop its discovery thread, and NDIlib_find_destroy blocks the main process for as long as ffmpeg runs: the
 * app froze at startup with an RTSP camera next to NDI cameras. Clearing the flag on our sockets just before each
 * spawn keeps them out of the child. Elsewhere a no-op.
 *
 * Sockets are recognised by a fingerprint, never by asking about each handle: a socket made here shows the object type
 * and access rights every socket has, and only handles that match it are touched. (Asking Winsock about an arbitrary
 * handle waits on a synchronous pipe that another thread is blocked reading, which hung the test run.) Reading the
 * handle list and changing a handle's inherit flag do no I/O, so nothing here can block.
 */
import koffi from 'koffi';

const HANDLE_FLAG_INHERIT = 1;
const PROCESS_HANDLE_INFORMATION = 51;
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004 | 0;
const AF_INET = 2;
const SOCK_DGRAM = 2;
const IPPROTO_UDP = 17;

interface Api {
  currentProcess: () => number;
  getInfo: (h: number, flags: number[]) => number;
  setInfo: (h: number, mask: number, flags: number) => number;
  query: (process: number, cls: number, buf: Buffer, len: number, needed: number[]) => number;
  socket: (af: number, type: number, protocol: number) => number | bigint;
  closesocket: (s: number) => number;
}

interface Entry {
  handle: number;
  access: number;
  type: number;
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
      socket: w.func('uintptr_t socket(int af, int type, int protocol)') as Api['socket'],
      closesocket: w.func('int closesocket(uintptr_t s)') as Api['closesocket'],
    };
  } catch {
    api = null;
  }
  return api;
}

/** Every handle this process holds, with its access rights and object type (PROCESS_HANDLE_SNAPSHOT_INFORMATION, x64). */
function handleList(a: Api): Entry[] {
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
    const out: Entry[] = [];
    // Entry: HandleValue, HandleCount, PointerCount (8 bytes each), GrantedAccess, ObjectTypeIndex, HandleAttributes, Reserved (4 each).
    for (let i = 0, o = 16; i < count && o + 40 <= buf.length; i++, o += 40) {
      out.push({ handle: Number(buf.readBigUInt64LE(o)), access: buf.readUInt32LE(o + 24), type: buf.readUInt32LE(o + 28) });
    }
    return out;
  }
  return [];
}

/** Clear the inherit flag on every inheritable socket this process holds. Returns how many it changed. */
export function stopSocketInheritance(): number {
  const a = load();
  if (!a) return 0;
  const probe = a.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (typeof probe !== 'number' || probe <= 0 || probe >= 2 ** 48) return 0; // INVALID_SOCKET
  try {
    const list = handleList(a);
    const mine = list.find((e) => e.handle === probe);
    if (!mine) return 0;
    let changed = 0;
    for (const e of list) {
      if (e.handle === probe || e.type !== mine.type || e.access !== mine.access) continue;
      const flags = [0];
      if (a.getInfo(e.handle, flags) && flags[0] & HANDLE_FLAG_INHERIT && a.setInfo(e.handle, HANDLE_FLAG_INHERIT, 0)) changed += 1;
    }
    return changed;
  } finally {
    a.closesocket(probe);
  }
}
