# Changelog

All notable changes to EZY CTRL. Each version here has a matching GitHub Release with the Windows installer attached.

## [0.6.1] - 2026-09-11

### Fixed
- macOS packages are now actually produced: the release workflow no longer hands electron-builder an empty signing certificate path when no certificate secret is configured (that made the v0.6.0 macOS job fail; v0.6.0 only has Windows files). Without a Developer ID the app is ad-hoc signed so it launches on Apple Silicon (right-click → Open the first time).

## [0.6.0] - 2026-09-11

Milestone 6: ship.

### Added
- macOS builds: `EZY-CTRL-<version>-arm64.dmg` (Apple Silicon) and `EZY-CTRL-<version>-x64.dmg` (Intel), plus zip archives, built by the release workflow with the right ffmpeg for each architecture.
- Auto-update: the installed app checks GitHub Releases on startup (switchable in Help), downloads in the background and offers "Restart to update" in the header. Needs the repository's releases to be publicly readable.
- First-run guide: with no camera configured the stage shows the steps to get a Tail 2 on screen (network, IP, RTSP mode, add camera), a "Try the demo" button that adds a demo camera, the keyboard cheat sheet and the update controls. The same page is behind the `?` button later.
- Release workflow accepts optional code-signing secrets (Windows Authenticode, Apple Developer ID + notarization); unsigned builds are produced without them.
- App version and platform shown in Help; `npm run dist:mac` builds the macOS packages locally on a Mac.

## [0.5.0] - 2026-09-11

Milestone 5: production niceties.

### Added
- Camera state read-back: tracking, tracking mode, record, orientation, focus mode, exposure mode and white-balance mode are polled every 2 s, so the stage and the TRACK / REC buttons mirror what the camera is really doing (including changes made by gestures or another controller).
- Camera settings drawer (header button, stage button, or `I`): AI tracking (on/off, single/group, speed, auto-zoom framing, only-me), focus (auto/manual, one-push, position), exposure (auto/manual, compensation, shutter and gain steps, backlight, anti-flicker), white balance (mode, one-push, colour temperature, R/B gain) and image (style, brightness, contrast, saturation, sharpness, hue). Every control is one VISCA command, read back after each change.
- Tally per camera: program (red) and preview (green) badges on the rack and the stage. Set from the rack's right-click menu, from mappings (`Tally: program / preview / clear` actions), or over OSC: `/cam/<i>/tally <0|1|2>`, `/tally/pgm <i>`, `/tally/pvw <i>`. One program and one preview at a time. Fed back as `/cam/<i>/tally`.
- Per-camera scope in the Mapping panel: bindings under "Selected camera" follow whatever is on stage; bindings under a CAM tab are pinned to that camera.
- Fake camera answers every settings inquiry and command, for testing without hardware.

### Changed
- Rack cards show TRK while the camera reports tracking on.

## [0.4.0] - 2026-09-11

Milestone 4: map anything.

### Added
- Action registry: every control (camera select, 8-way jog, pan/tilt axes, jog speed, home, zoom level / tele / wide, preset recall / save, tracking, record, rotate, AF push, log, mapping) is a named action that keyboard, MIDI and OSC all drive the same way.
- Mapping panel (header button or `M`): one row per action with MIDI, OSC address and Keyboard columns. Click **Learn**, move a control on your MIDI device, done. Click **Set** to capture a key. Reset to defaults restores the keyboard layout.
- MIDI in via Web MIDI: notes and CC buttons (≥ 64 press, < 64 release), CC faders / knobs for zoom level, jog speed, pan and tilt axes (centre = stop, dead zone, speed follows deflection). A note range maps onto presets (base note + 63) or cameras (base + 8). Per-device enable switches, hot-plug.
- OSC in on UDP 9000 (configurable) with a built-in address scheme that is always on: `/cam/<i>/preset/<n>`, `/cam/<i>/ptz/<dir>`, `/cam/<i>/ptz/pan`, `/cam/<i>/zoom`, `/cam/<i>/track`, `/cam/select` and more; `<i>` is the camera number or `sel`. Copy the full list from the panel.
- OSC feedback (optional) to a host:port: `/cam/select`, `/cam/<i>/preset/active`, `/cam/<i>/online`, `/cam/<i>/position` at 4 Hz, for TouchOSC or Companion displays.
- Monitor of the last MIDI / OSC / feedback messages in the panel; header shows the live MIDI device and OSC port.
- `npm run osc-send /cam/1/preset/2` sends a test OSC message.

### Changed
- Keyboard shortcuts now come from the mapping table (same defaults as before) and can be changed.

## [0.3.0] - 2026-09-11

Milestone 3: unlimited presets, plus an in-app log.

### Added
- Presets rail (right side): Save captures the camera's exact pan / tilt / zoom and a thumbnail from the live picture. No limit on the count; they live in the app, not in the camera's slots.
- Click a preset to recall it with an absolute move at the recall speed set in the footer. Number keys `1-9` recall the first nine; `Ctrl+S` saves.
- Active preset is highlighted and shown on the viewport ("P1 · Wide stage"); any manual move or a drift away from the position clears it.
- Drag to reorder, double-click to rename, right-click (or the ⋯ button) for Update to current position, Update thumbnail, Store in camera slot (0-255, so other VISCA controllers can recall it), Delete.
- Import / Export presets as JSON.
- Log drawer (header button or `L`): VISCA connection changes, ffmpeg / video errors, failed commands, preset actions and renderer exceptions, with level filter and text search. Backed by `logs/ezy-ctrl.log` in the config folder ("Open log file").
- Fake Tail 2 for development: `npm run fake-camera` answers VISCA on 127.0.0.1:52381 with moving pan / tilt / zoom.

### Changed
- Camera selection moved to `Ctrl+1-9` (plain digits now recall presets).
- Removing a camera also removes its presets.

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
