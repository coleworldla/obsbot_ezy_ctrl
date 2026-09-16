#!/usr/bin/env node
/**
 * Talk to the NDI runtime directly: list the NDI sources on the network and pull a few proxy frames
 * from the first Tail 2 (or the one at --ip). Useful when the app's NDI source stays on "searching".
 *
 *   npm run ndi-probe                       # auto-detect the runtime (NDI Tools / NDI Runtime)
 *   npm run ndi-probe -- --ip <ip address>
 *   npm run ndi-probe -- "C:/Program Files/NDI/NDI 6 Tools/Runtime/Processing.NDI.Lib.x64.dll"
 */
import koffi from 'koffi';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ipArg = args.includes('--ip') ? args[args.indexOf('--ip') + 1] : null;
const dllArg = args.find((a) => a.toLowerCase().endsWith('.dll') || a.endsWith('.dylib') || a.endsWith('.so'));
const libName = process.platform === 'win32' ? 'Processing.NDI.Lib.x64.dll' : process.platform === 'darwin' ? 'libndi.dylib' : 'libndi.so';
const pf = process.env.ProgramFiles ?? 'C:/Program Files';
const candidates = [
  dllArg,
  process.env.NDI_RUNTIME_DIR_V6 && path.join(process.env.NDI_RUNTIME_DIR_V6, libName),
  process.env.NDI_RUNTIME_DIR_V5 && path.join(process.env.NDI_RUNTIME_DIR_V5, libName),
  path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6', libName),
  path.join(pf, 'NDI', 'NDI 6 Tools', 'Runtime', libName),
  '/usr/local/lib/libndi.dylib',
].filter(Boolean);
const dll = candidates.find((p) => fs.existsSync(p));
if (!dll) {
  console.error('NDI runtime not found. Install NDI Tools (https://ndi.video/tools/) or pass the library path.');
  process.exit(1);
}
console.log('runtime:', dll);
const lib = koffi.load(dll);

const Source = koffi.struct('NDIlib_source_t', { p_ndi_name: 'const char *', p_url_address: 'const char *' });
koffi.struct('NDIlib_find_create_t', { show_local_sources: 'bool', p_groups: 'const char *', p_extra_ips: 'const char *' });
koffi.struct('NDIlib_recv_create_v3_t', { source_to_connect_to: Source, color_format: 'int32', bandwidth: 'int32', allow_video_fields: 'bool', p_ndi_recv_name: 'const char *' });
const VideoFrame = koffi.struct('NDIlib_video_frame_v2_t', {
  xres: 'int32', yres: 'int32', FourCC: 'int32', frame_rate_N: 'int32', frame_rate_D: 'int32', picture_aspect_ratio: 'float', frame_format_type: 'int32',
  timecode: 'int64', p_data: 'uint8_t *', line_stride_in_bytes: 'int32', p_metadata: 'void *', timestamp: 'int64',
});
console.log('sizeof video frame', koffi.sizeof(VideoFrame), '(expect 72)');

const init = lib.func('bool NDIlib_initialize()');
const version = lib.func('const char *NDIlib_version()');
const findCreate = lib.func('void *NDIlib_find_create_v2(const NDIlib_find_create_t *p)');
const findWait = lib.func('bool NDIlib_find_wait_for_sources(void *inst, uint32_t timeout)');
const findSources = lib.func('const NDIlib_source_t *NDIlib_find_get_current_sources(void *inst, _Out_ uint32_t *count)');
const findDestroy = lib.func('void NDIlib_find_destroy(void *inst)');
const recvCreate = lib.func('void *NDIlib_recv_create_v3(const NDIlib_recv_create_v3_t *p)');
const recvConnect = lib.func('void NDIlib_recv_connect(void *inst, const NDIlib_source_t *src)');
const recvCapture = lib.func('int NDIlib_recv_capture_v3(void *inst, _Out_ NDIlib_video_frame_v2_t *video, void *audio, void *meta, uint32_t timeout)');
const recvFree = lib.func('void NDIlib_recv_free_video_v2(void *inst, const NDIlib_video_frame_v2_t *video)');
const recvDestroy = lib.func('void NDIlib_recv_destroy(void *inst)');
const destroy = lib.func('void NDIlib_destroy()');

console.log('initialize:', init(), 'version:', version());
const finder = findCreate({ show_local_sources: true, p_groups: null, p_extra_ips: ipArg ?? null });
let sources = [];
for (let i = 0; i < 5; i++) {
  findWait(finder, 1000);
  const count = [0];
  const ptr = findSources(finder, count);
  sources = count[0] ? koffi.decode(ptr, koffi.array(Source, count[0])) : [];
  console.log(`after ${i + 1} s: ${count[0]} source(s)`, sources.map((s) => `${s.p_ndi_name} @ ${s.p_url_address}`));
  if (count[0] > 0 && i >= 1) break;
}
if (sources.length) {
  const src = (ipArg && sources.find((s) => (s.p_url_address ?? '').startsWith(ipArg + ':'))) ?? sources.find((s) => /tail/i.test(s.p_ndi_name ?? '')) ?? sources[0];
  console.log('connecting to', src.p_ndi_name, src.p_url_address, '(lowest bandwidth, RGBX)');
  const recv = recvCreate({ source_to_connect_to: { p_ndi_name: src.p_ndi_name, p_url_address: src.p_url_address }, color_format: 2, bandwidth: 0, allow_video_fields: false, p_ndi_recv_name: 'EZY CTRL probe' });
  recvConnect(recv, { p_ndi_name: src.p_ndi_name, p_url_address: src.p_url_address });
  let frames = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && frames < 30) {
    const frame = {};
    const type = await new Promise((res, rej) => recvCapture.async(recv, frame, null, null, 1000, (err, r) => (err ? rej(err) : res(r))));
    if (type === 1) {
      frames++;
      if (frames === 1) console.log('metadata pointer:', frame.p_metadata ? 'present: ' + koffi.decode(frame.p_metadata, 'char', -1).slice(0, 120) : 'none');
      if (frames === 1 || frames === 30) {
        const data = koffi.decode(frame.p_data, koffi.array('uint8_t', 8, 'Typed'));
        console.log(`video frame #${frames}: ${frame.xres}x${frame.yres} fourcc 0x${frame.FourCC.toString(16)} stride ${frame.line_stride_in_bytes} fps ${frame.frame_rate_N}/${frame.frame_rate_D} first bytes`, Array.from(data));
      }
      recvFree(recv, frame);
    } else if (type === 4) {
      console.log('frame type error');
      break;
    }
  }
  console.log(`received ${frames} video frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  recvDestroy(recv);
} else {
  console.log('no NDI sources found. Is the camera in NDI mode (OBSBOT Center -> More -> Output -> NDI) and on this network?');
}
findDestroy(finder);
destroy(); // shut the runtime down before exiting, otherwise the process hangs while the DLL unloads
process.exit(0);
