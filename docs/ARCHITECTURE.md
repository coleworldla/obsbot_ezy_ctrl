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

### `presets` (as built in M3)
```ts
interface Preset {
  id: string; cameraId: string; name: string;
  panDeg: number; tiltDeg: number; zoomRatio: number;   // degrees / ratio, converted to VISCA units on recall
  thumbnail?: string;                                   // 240 px JPEG data URL captured from the live <video>
  order: number; cameraSlot?: number;                   // cameraSlot: mirrored into the camera's own slot 0-255
  createdAt: number; updatedAt: number;
}
```
- `store/presets.ts`: `presets.json`, cached in memory, atomic write-through. Import/export as `{version, app, presets}`.
- Save = fresh pan/tilt + zoom inquiry in main, thumbnail from the renderer's player.
- Recall = `PAN TILT ABS` (recall speed from the rail footer) + `ZOOM DIRECT`, fired together.
- Active preset lives in the renderer: set on recall/save, cleared by any manual move or when the polled position drifts > 1 deg / 0.15x after a 5 s grace.
- Mirror = recall at full speed, wait 400 ms, `PRESET SET slot`.

### `log`
- `log.ts`: ring buffer of 2000 entries + `logs/ezy-ctrl.log` (5 MB rotation) under userData, mirrored to the console.
- Sources: `visca` (connect / online / offline transitions, test probes), `video` (stream start, codec, ffmpeg errors, exits), `preset`, `ipc` (any failed handler), `ui` (renderer exceptions, player errors), `app`.
- Renderer gets the buffer on start and live entries over `log:entry`; the Log drawer filters by level and text.

### `actions` (as built in M4)
- `shared/mapping.ts` holds the registry: `ActionDef { id, label, group, kind: trigger | momentary | toggle | continuous, arg?: preset | camera, osc, range?, key? }` and the mapping model `Mapping { id, actionId, arg?, camera?, trigger }` with `Trigger = midi | osc | key`.
- Pure matching: `matchMappings(mappings, input)` turns a key / MIDI / OSC input into `Invocation { actionId, phase: press | release | value, arg?, camera?, value?, unit }`. Spans map a note or digit range onto preset / camera numbers.
- `renderer/control/executor.ts` runs invocations against the app (jog + stop, axes with dead zone → 8-way drive with proportional speed, zoom fader coalesced to 80 ms, toggles with explicit 0/1 from OSC, preset recall by index, camera select).
- Keyboard, MIDI and OSC all go through the same path; the on-screen buttons call the IPC directly.

### `midi`
- `renderer/control/midi.ts`: Web MIDI API (Electron permission handler allows `midi`), hot-plug via `onstatechange`, per-device enable list persisted in settings.
- Notes: velocity > 0 = press, 0 / note-off = release. CC: continuous actions get value / 127, button actions press at ≥ 64.
- Learn: the panel sets `learn = { actionId, kind }`; the next message becomes `Mapping { id: 'midi:<actionId>', trigger }` (channel-specific, any device). Preset / camera rows get a span (64 / 9).

### `osc`
- `main/osc/codec.ts`: OSC 1.0 (i f s b T F N, bundles). `main/osc/server.ts`: UDP listener (default 9000) + sender; messages are forwarded to the renderer over IPC `osc:message`.
- Built-in scheme (`parseBuiltinOsc`) is always active; custom OSC triggers from the mapping table match exact addresses on top.
- Feedback (optional, `settings.osc.feedback*`): `/cam/select`, `/cam/<i>/preset/active`, `/cam/<i>/online`, `/cam/<i>/position` (4 Hz), sent from the renderer via `osc:send`.

## Data on disk
`%APPDATA%/EZY CTRL/` (installed) or `%APPDATA%/obsbot-ezy-ctrl/` (dev) — `cameras.json`, `presets.json`, `settings.json`, `mappings.json`, `logs/ezy-ctrl.log`. Presets import/export from the UI.

