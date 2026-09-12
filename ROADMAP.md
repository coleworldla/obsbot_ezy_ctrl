# Roadmap

Each milestone maps to GitHub issues (labelled by milestone). Order is the intended build order.

## M0 — Research & design  (done 2026-09-11)
- Confirm control path (VISCA over IP, UDP 52381) and video paths (RTSP / SRT / NDI / Web UI).
- Convert OBSBOT's VISCA spreadsheet into `docs/protocol/visca-over-ip.md`.
- UI mockups: live console, connect dialog, MIDI/OSC mapping panel, plus alternate directions.

## M1 — Talk to the camera  (first cut 2026-09-11, needs a real-camera test)
- [x] VISCA-over-IP client (Sony header, sequence numbers, ACK/completion, timeouts) — `src/main/visca/`
- [x] Add camera by IP; persist camera list — `cameras.json`
- [x] Pan/tilt jog with speed, zoom rocker + direct zoom, home — on-screen + keyboard
- [x] Position read-back (pan/tilt/zoom inquiries) shown on screen — polled every 500 ms
- [ ] Verify against a Tail 2: inquiry payload type (0x0110 vs 0x0100), reply sequence echo, jog stop latency

## M2 — See the picture  (first cut 2026-09-11, v0.2.0, needs a real-camera test)
- [x] RTSP viewport: ffmpeg sidecar remuxes H.264 → fragmented MP4 → MediaSource in the renderer — `src/main/video/`, `src/renderer/src/video/player.ts`
- [x] Connection health, reconnect with backoff, buffer/latency readout, fps, dropped frames
- [x] Fallback: embed the camera Web UI (webview)
- [x] Demo test-pattern source for trying the app without a camera
- [ ] Verify against a Tail 2: RTSP URL/auth, GOP/latency, H.264 vs H.265 output, SRT caller mode

## M3 — Unlimited presets  (done 2026-09-11, v0.3.0)
- [x] Preset = pan, tilt, zoom, thumbnail. Stored in `presets.json`, no camera-slot cap — `src/main/store/presets.ts`
- [x] Save from current position, recall with absolute move at a chosen speed, rename, drag-reorder, delete, import/export JSON
- [x] Mirror a preset into one of the camera's 256 VISCA slots for other controllers
- [x] Active-preset highlight on the rail and the viewport; `1-9` recall, `Ctrl+S` save
- [x] In-app Log drawer + log file (added on request), fake Tail 2 for development
- [ ] Focus position in presets (needs manual-focus handling)

## M4 — Map anything
- Action registry: every control is an action with a stable id.
- MIDI in: note / CC → action, learn mode, CC as continuous (zoom, jog speed).
- OSC in/out: `/cam/<id>/...` address scheme, feedback for TouchOSC / Companion.
- Keyboard shortcuts.

## M5 — Production niceties
- Multi-camera view and per-camera mappings.
- AI tracking panel (on/off, single/group, speed, auto-zoom, only-me).
- Record, landscape/portrait, focus and exposure/white-balance panels.
- Tally / status readout.

## M6 — Ship
- Windows installer, macOS build, auto-update.
- First-run guide (enable RTSP on the camera, find its IP).

## Later / research
- NDI viewport (needs NDI SDK + licence on the camera).
- SRT viewport.
- Probe the camera Web UI's preview transport (WebRTC?) for a lower-latency picture.
