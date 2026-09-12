# Architecture

## Decision: Electron + React + TypeScript

Alternatives considered:

| Option | Why not (yet) |
|---|---|
| Tauri (Rust) | Smaller binary, but video decode + MIDI + UDP all need Rust plumbing; slower to iterate. |
| Python + Qt | MIDI/OSC are easy, but a smooth low-latency video widget and a modern UI are more work. |
| Pure web app | Browsers cannot open UDP sockets (VISCA, OSC) or read RTSP. |

Electron gives us Node in the main process for UDP (VISCA + OSC), the Web MIDI API in the renderer, and a Chromium `<video>` element fed by MediaSource for the viewport.

```
+---------------------- Electron main (Node) ---------------------------+
|  visca/    UDP client, Sony framing, seq numbers, ack/complete        |
|  osc/      UDP server + client (osc npm package)                      |
|  video/    ffmpeg sidecar: RTSP in -> fMP4 fragments out (no re-encode)|
|  store/    cameras.json  presets.json  mappings.json (electron-store) |
|  actions/  registry: id -> handler; called by UI, MIDI, OSC, keyboard |
+--------------+-------------------- IPC -------------------+-----------+
               |                                            |
+--------------v------------- Renderer (React) -------------v-----------+
|  Viewport (MSE <video>)   PTZ jog / zoom   Presets grid   Mapping UI  |
|  Web MIDI API (input devices, learn mode)                             |
+-----------------------------------------------------------------------+
```

## Key modules

### `visca`
- Packet = `01 00` + 2-byte payload length + 4-byte sequence + raw VISCA (`81 ... FF`).
- Track sequence numbers per camera; send the reset-sequence control packet (`02 00 00 01 <seq> 01`) on connect.
- Parse `90 41 FF` (ACK), `90 51 FF` (completion), `90 6x ..` (error), `90 50 ...` (inquiry reply).
- Command helpers generated from `docs/protocol/visca-over-ip.md` (pan/tilt drive, absolute position, zoom direct, focus, presets, AI tracking, record, orientation, image/exposure/WB).
- Units: pan/tilt position is 0.075 deg per step, signed 16-bit spread across four nibbles. Zoom direct = ratio x 1000.

### `video` (as built in M2)
- `ffmpeg-static` ships the binary; unpacked from asar in the packaged app (`asarUnpack`).
- `ffmpeg -fflags nobuffer -flags low_delay -rtsp_transport tcp -i rtsp://ip:8554/live -an -c:v copy -f mp4 -movflags empty_moov+default_base_moof+frag_every_frame pipe:1`
  One fragment per frame keeps buffering latency to a frame or two; no re-encode, so CPU stays near zero.
- `mp4.ts` splits stdout into top-level boxes and groups them: `ftyp+moov` = init segment, `moof+mdat` = media segment. It also reads the codec string from `avcC` / `hvcC` so the renderer can open the right `SourceBuffer`.
- `manager.ts` runs one `VideoStream` per camera, fans events out over IPC (`video:event`: start / segment / end), replays the init segment to late subscribers, and stops the process when nobody is watching.
- Renderer `player.ts`: one `MediaSource` + detached `<video>` per camera, re-parented between stage and rack so switching cameras never restarts the stream. Appends serially, jumps to the live edge on first data, plays at 1.08x when more than 0.45 s behind, hard-resyncs past 1.2 s, trims the buffer behind the playhead.
- Demo source: `-f lavfi -i testsrc2 ... -c:v libx264 -tune zerolatency` for trying the app without a camera.
- Later: WebRTC via go2rtc for sub-200 ms, NDI via the NDI SDK.

### `presets`
```ts
interface Preset {
  id: string; cameraId: string; name: string;
  pan: number; tilt: number; zoom: number; focus?: number;   // native VISCA units
  speed: { pan: number; tilt: number };                        // 1-24 / 1-23
  thumbnail?: string;                                          // JPEG data URL from the viewport
  order: number; color?: string;
}
```
Recall = `PAN TILT ABS` + `ZOOM DIRECT` (+ `FOCUS DIRECT` if stored). Unlimited count.

### `actions`
Every control is an `Action { id, label, run(ctx, value?) }`. UI buttons, keyboard, MIDI and OSC all call the same registry, so a mapping is just `{ trigger, actionId, args }`.

Examples: `ptz.jog` (dx, dy, speed), `ptz.home`, `zoom.set` (1-12), `zoom.tele`, `zoom.wide`, `preset.recall` (presetId), `preset.save`, `ai.track.toggle`, `record.toggle`, `orientation.toggle`, `camera.select`.

### `osc`
- Listen on UDP 9000 (configurable), send feedback on 9001.
- Address scheme: `/cam/<index|name>/preset/<n>`, `/cam/<i>/ptz/jog <dx> <dy>`, `/cam/<i>/zoom <1..12>`, `/cam/<i>/track <0|1>`, `/cam/<i>/home`.
- Works with TouchOSC, Bitfocus Companion (generic OSC), QLab, etc.

### `midi`
- Web MIDI API in the renderer; note-on -> momentary/toggle actions, CC -> continuous (zoom level, jog speed).
- Learn mode: click a control, move a MIDI control, done.

## Data on disk
`%APPDATA%/obsbot-ezy-ctrl/` - `cameras.json`, `presets.json`, `mappings.json`. Import/export from the UI.
