# Changelog

All notable changes to EZY CTRL. Each version here has a matching GitHub Release with the Windows installer attached.

## [Unreleased]

### Changed
- README and Help: step-by-step macOS first-launch guide (which dmg for Apple Silicon vs Intel, Privacy and Security → Open Anyway on macOS 15, right-click → Open on 13–14, local network permission, the xattr fallback).
- The project is open source under the MIT licence and the repository is public, which also switches on the in-app updater.
- README states that EZY CTRL is independent of OBSBOT. OBSBOT's original VISCA spreadsheets are no longer redistributed in the repository; `docs/protocol/visca-over-ip.md` remains as our own summary.

## [0.8.3] - 2026-09-15

### Added
- Names list: the OSC map starts with a **Names** section showing every camera and preset name next to its OSC form and address, with Copy names / Copy OSC names / Copy both / CSV, and click-to-copy on each cell. Reach it from the presets footer (**Names**), the OSC pill in the header, or Mapping → OSC map.

### Changed
- Every example address in the app, scripts and mockups is now the generic `<ip address>`; the OSC status hides Tailscale and link-local addresses of this machine. No real network address is kept in the repository or its history.

## [0.8.2] - 2026-09-15

### Added
- Presets rail: multi-select and delete. **Select** (or Ctrl-click a preset) enters select mode; click, Shift-click for a range or Ctrl+A to pick rows; **Delete** or the Delete key removes them all after one confirmation, in a single write. Right-click also offers "Delete N selected".
- OSC addresses by name: `/cam/stage_left/preset/podium` works alongside `/cam/1/preset/2`. Camera and preset names become slugs (lower-case, punctuation and spaces → `_`), `/cam/select` and `/tally/pgm` take a name as the argument too, and feedback goes out under the name (switchable to numbers in the OSC map). Renaming changes the address; the map shows the current one.
- OSC map panel (Mapping → **OSC map…**): every address the app understands, laid out per camera in rack order with your presets spelled out by name and the feedback addresses, plus a filter. Copy all or one section as text, addresses only, CSV or a Markdown table; click an address to copy just that one.
- README documents the OSC preset addresses (`/cam/<i>/preset/<n>`, `/cam/<i>/preset <n>`, `/cam/<i>/preset/save`, feedback `/cam/<i>/preset/active`).

## [0.8.1] - 2026-09-15

### Changed
- Adding a device whose NDI name is not a Tail 2 switches Type to Video only and says so; the offline pill and a failed Test connection now point at Type → Video only for devices that never answer VISCA.

## [0.8.0] - 2026-09-15

Eyes on everything.

### Added
- Video-only sources: anything that is not a Tail 2 (an SDI-to-NDI encoder such as the ZowieBox, another camera, a media server output) goes in as **Add camera → Video only**. It sits in the rack with a live picture and tally like the others, can be put on stage and selected from MIDI / OSC / keyboard, and has no pan / tilt / zoom, presets or camera settings. Sources: NDI (by name, or Auto by IP), RTSP, SRT, Web UI, Webcam, Demo.
- NDI discovery asks the device at the address you type directly, so encoders that do not announce themselves over mDNS (or sit on another subnet) still appear in the source list. The rack numbering (`/cam/<i>`) counts monitors like cameras.

### Changed
- The header counts cameras and monitors separately.

### Fixed
- NDI senders that attach per-frame metadata (the ZowieBox does) crashed the app with heap corruption right after the first frame: the metadata pointer was being re-marshalled before it went back to the runtime. It is now passed back untouched.

## [0.7.0] - 2026-09-15

Native NDI.

### Added
- NDI video source: the app receives the camera's NDI stream itself through the NDI runtime on the computer (installed with NDI Tools or the NDI Runtime). No conversion tools, no webcam tricks. It uses NDI's low-bandwidth proxy stream (640×360), which is what a control monitor needs and costs the camera and the network almost nothing while the full-quality feed goes to your media server.
- NDI source discovery in the camera dialog: leave the source on **Auto** and the app picks the NDI source at the camera's IP, or choose one by name. Cameras' IPs are passed to discovery so they are found across subnets.
- Automatic reconnect: if the source disappears (camera switches mode, network blip) the receiver goes back to searching and reattaches when it returns.
- The camera on stage receives at full rate; rack thumbnails get a lower rate to keep CPU down.
- `npm run ndi-probe`: lists NDI sources on the network and pulls a few frames, for troubleshooting.
- Auto source matching copes with a camera that is on Wi-Fi and Ethernet at once (its NDI stream may be advertised from the other address): it falls back to the NDI name carrying the camera's name, then to the one Tail 2 no other camera has claimed. When nothing matches, the viewport lists the sources it can see so you can pick one by name.

### Fixed
- Quitting waits until the NDI receivers are destroyed; exiting with receivers still alive hung the process.

### Notes
- Verified against two Tail 2s in NDI mode on the local network with NDI runtime 6.3.
- The NDI runtime is not bundled (NDI's licence terms). Without it, the NDI source shows what to install.

## [0.6.2] - 2026-09-15

### Added
- Edit camera: change a camera's name, IP address, VISCA port, video source (RTSP / SRT / Web UI / Webcam / NDI / Demo) and stream address after the fact. From the stage's **Edit** button or the rack's right-click menu. Changing the IP or source reconnects control and restarts the picture immediately; a **Default** button restores the standard address for the chosen source.
- Webcam video source: any video device the computer sees. That covers the Tail 2 over USB-C (UVC mode) and, importantly, NDI: run NDI Tools → Webcam Input, pick the camera's NDI source, then choose Webcam in the app. Preset thumbnails work from it too.
- `npm run diagnose -- <camera-ip>`: sends every inquiry the app uses to a real camera, prints what it answers or rejects, and pulls three seconds of the stream with the bundled ffmpeg.

### Fixed
- Camera settings panel on a real Tail 2: the state read-back was all-or-nothing, so one inquiry the camera did not answer left the whole panel disabled and unresponsive. Every inquiry is now tolerant; anything the camera will not report shows the last value you set (or a default), and the panel header lists those items. Clicks show their new state immediately and the camera confirms on the next poll; if the camera rejects a command, the header says which one and why.

### Changed
- Clearer wording when a source has no in-app preview (NDI): control keeps working, and the Web UI source is suggested to keep a picture while the camera streams NDI to a switcher.

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
