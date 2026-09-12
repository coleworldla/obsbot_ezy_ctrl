# Changelog

All notable changes to EZY CTRL. Each version here has a matching GitHub Release with the Windows installer attached.

## [0.2.0] - 2026-09-11

Milestone 2: see the picture.

### Added
- Live video in the viewport. A bundled ffmpeg pulls the camera's RTSP (or SRT) stream and remuxes H.264 into fragmented MP4 with no re-encoding; the app splits it into MP4 boxes and feeds a MediaSource-backed video element, one per camera.
- Every camera in the rack shows its live picture; the selected camera plays large on the stage and its rack slot reads "ON STAGE".
- Stream overlay: source, resolution, fps, buffer depth (target 0.25-0.45 s, auto catch-up, hard resync past 1.2 s), dropped frames.
- Automatic reconnect with backoff when the stream drops, with the ffmpeg error shown on the viewport.
- Codec detection from the stream (H.264 profile/level, H.265 where the GPU supports it).
- "Web UI" video source shows the camera's own web page inside the app.
- "Demo" video source: a built-in moving test pattern so the app can be tried without a camera.
- Snapshot of the current frame (used for preset thumbnails in the next milestone).

### Notes
- The RTSP path is not yet verified against a physical Tail 2. The demo source exercises the whole pipeline.
- The installer is about 80 MB larger because ffmpeg ships inside it.

## [0.1.0] - 2026-09-11

First cut of milestone 1: talk to the camera.

### Added
- Electron + React + TypeScript app in the Rack layout: camera rack on the left, selected camera in the middle, preset rail on the right.
- VISCA over IP client (UDP 52381, Sony framing, sequence numbers, ACK / completion / error handling, timeouts).
- Full OBSBOT Tail 2 command set as typed builders: pan/tilt drive and absolute, zoom, focus, camera presets, record, orientation, AI tracking.
- Add camera by IP with a Test connection button (reports latency and live pan / tilt / zoom). Cameras persist in `cameras.json`.
- Jog pad, pan / tilt speed sliders, zoom rocker and slider, Home, Track, Rec, Rotate, AF push.
- Keyboard: `1-9` select camera, `Q W E A D Z S C` jog, `H` home, `-` `=` zoom, `[` `]` speed.
- Live position read-back polled every 500 ms.
- Windows one-click installer and portable exe (unsigned: Windows SmartScreen will ask once).

### Not yet
- Live video (milestone 2), app-side presets (milestone 3), MIDI / OSC mapping (milestone 4).
- Nothing has been verified against a physical Tail 2 yet.
