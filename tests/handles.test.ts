import koffi from 'koffi';
import { describe, expect, it } from 'vitest';
import { stopSocketInheritance } from '../src/main/handles';

/**
 * Windows: a child process (ffmpeg) inherits every inheritable handle. Sockets opened by native libraries (NDI)
 * are inheritable by default; a copy held by ffmpeg kept NDI's discovery thread from stopping and froze the app.
 */
describe.skipIf(process.platform !== 'win32')('stopSocketInheritance (Windows)', () => {
  const kernel32 = koffi.load('kernel32.dll');
  const ws2 = koffi.load('ws2_32.dll');
  const getInfo = kernel32.func('int GetHandleInformation(uintptr_t h, _Out_ uint32_t *flags)');
  const closeHandle = kernel32.func('int CloseHandle(uintptr_t h)');
  const SA = koffi.struct('SECURITY_ATTRIBUTES_T', { nLength: 'uint32_t', lpSecurityDescriptor: 'void *', bInheritHandle: 'int' });
  const createEvent = kernel32.func('uintptr_t CreateEventW(SECURITY_ATTRIBUTES_T *sa, int manual, int initial, void *name)');
  const socket = ws2.func('uintptr_t socket(int af, int type, int protocol)');
  const closesocket = ws2.func('int closesocket(uintptr_t s)');
  const inherits = (h: unknown) => {
    const flags = [0];
    expect(getInfo(h, flags)).not.toBe(0);
    return (flags[0] & 1) === 1;
  };

  it('makes an inheritable socket non-inheritable and leaves other handles alone', () => {
    const s = socket(2, 2, 17); // AF_INET, SOCK_DGRAM, UDP, inheritable as native libraries open them
    const ev = createEvent({ nLength: koffi.sizeof(SA), lpSecurityDescriptor: null, bInheritHandle: 1 }, 1, 0, null);
    try {
      expect(inherits(s)).toBe(true);
      expect(inherits(ev)).toBe(true);
      expect(stopSocketInheritance()).toBeGreaterThanOrEqual(1);
      expect(inherits(s)).toBe(false);
      expect(inherits(ev)).toBe(true);
    } finally {
      closesocket(s);
      closeHandle(ev);
    }
  });
});
