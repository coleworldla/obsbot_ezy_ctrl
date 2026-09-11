# Roadmap

Each milestone maps to GitHub issues (labelled by milestone). Order is the intended build order.

## M0 — Research & design  (done 2026-09-11)
- Confirm control path (VISCA over IP, UDP 52381) and video paths (RTSP / SRT / NDI / Web UI).
- Convert OBSBOT's VISCA spreadsheet into `docs/protocol/visca-over-ip.md`.
- UI mockups: live console, connect dialog, MIDI/OSC mapping panel, plus alternate directions.

## M1 — Talk to the camera
- VISCA-over-IP client (Sony header, sequence numbers, ACK/completion, timeouts).
- Add camera by IP; persist camera list.
- Pan/tilt jog with speed, zoom rocker + direct zoom, home.
- Position read-back (pan/tilt/zoom inquiries) shown on screen.

## M2 — See the picture
- RTSP viewport: ffmpeg sidecar remuxes H.264 → fragmented MP4 → MediaSource in the renderer.
- Connection health, reconnect, latency readout.
- Fallback: embed the camera Web UI preview.

## M3 — Unlimited presets
- Preset = pan, tilt, zoom, (focus), thumbnail, recall speed. Stored in app data, no camera-slot cap.
- Save from current position, recall with absolute move, rename, reorder, delete, import/export JSON.
- Optional: mirror a preset into one of the camera's 256 VISCA slots for other controllers.

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
