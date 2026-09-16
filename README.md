# OBSBOT EZY CTRL

A lightweight desktop controller for one or more **OBSBOT Tail 2** cameras on the local network.

Goals:

- **Connect by IP** — type the camera's IP address, see the live picture, start driving.
- **See the viewport** — the live camera feed is the centre of the app, not an afterthought.
- **Easy controls** — pan/tilt jog, zoom, home, AI tracking, record, landscape/portrait — every control is a named *action*.
- **Map anything** — any action can be bound to a **MIDI** note/CC or an **OSC** address (MIDI-learn style).
- **Unlimited presets** — presets live in the app (pan, tilt, zoom, focus, thumbnail), not in the camera's fixed slots, so there is no cap. Recalled with absolute moves at a chosen speed.
- **Multi-camera** — several Tail 2s side by side, each with its own presets and mappings.

## How it talks to the camera

| Purpose | Protocol | Details |
|---|---|---|
| Control | VISCA over IP | UDP port **52381**, Sony-compatible framing. Full command list in [docs/protocol/visca-over-ip.md](docs/protocol/visca-over-ip.md). |
| Video (default) | RTSP | `rtsp://<camera-ip>:8554/live` — enable **RTSP mode** in OBSBOT Center / Start (Output → RTSP). |
| Video (NDI) | NDI | Camera in NDI mode (licence on the camera). The app receives the NDI **proxy stream** (640×360) directly through the NDI runtime installed on the computer (comes with [NDI Tools](https://ndi.video/tools/)), while the full-quality feed goes to your switcher or media server. Sources are discovered automatically; Auto picks the one at the camera's IP. |
| Video (optional) | SRT | Camera in SRT listener mode (default port 5000); the app connects as caller. Only one camera output mode is active at a time. |
| Web UI | HTTP | `http://<camera-ip>` (login `Admin` / `Admin` on first use) — network setup and a fallback preview. |
| Video (USB) | Webcam | The Tail 2 over USB-C in UVC mode, or any other video device on the computer. |

Gimbal range: pan ±160°, tilt −65° to +32°, roll ±120°. Zoom 1×–12× hybrid (5× optical).

## Status

- M0 research + UI design: done. Direction chosen: **Rack** (multi-camera first).
- M1 talk to the camera: first cut in. VISCA-over-IP client with tests, add camera by IP, jog / zoom / home, live position read-back. Not yet verified against a real Tail 2.
- M2 see the picture: first cut in. Live RTSP / SRT video for every camera via a bundled ffmpeg (no re-encode), reconnect, latency readout, Web UI fallback, and a built-in demo test pattern. RTSP path not yet verified against a real Tail 2.
- M3 unlimited presets: done. Save with thumbnail, recall by click or `1-9`, reorder, rename, import/export, store into camera slots. Plus an in-app Log drawer backed by a log file.
- M4 map anything: done. Mapping panel with MIDI learn, OSC in (built-in address scheme + custom triggers) and OSC feedback, remappable keyboard. Not yet tried with a physical MIDI controller.
- M5 production niceties: done. Camera state read-back, camera settings drawer (AI tracking, focus, exposure, white balance, image), program / preview tally, per-camera mapping scope.
- M6 ship: done. macOS builds, auto-update, first-run guide, signing hooks. Certificates and a public release feed are the two things still needed from outside the code.

See [ROADMAP.md](ROADMAP.md) for what comes next and the GitHub issues for individual features.

## Install

Grab the latest build from [Releases](https://github.com/coleworldla/obsbot_ezy_ctrl/releases):

| Platform | File | Notes |
|---|---|---|
| Windows | `EZY-CTRL-Setup-<version>.exe` | one-click installer, per user (no admin), desktop shortcut |
| Windows | `EZY-CTRL-<version>-portable.exe` | no install, just run it |
| macOS Apple Silicon | `EZY-CTRL-<version>-arm64.dmg` | drag to Applications |
| macOS Intel | `EZY-CTRL-<version>-x64.dmg` | drag to Applications |

The builds are not code-signed yet:

- Windows SmartScreen shows "Windows protected your PC" the first time: click **More info → Run anyway**.
- macOS says the app "cannot be opened because the developer cannot be verified" or "is damaged": right-click the app → **Open**, or run `xattr -cr "/Applications/EZY CTRL.app"` once.

**Updates.** The installed app checks GitHub Releases on startup (switch it off under `?` → Updates), downloads the next version in the background and shows *Restart to update* in the header. This only works while the repository's releases are publicly readable; on a private repository the check logs "no public release feed" and you install new versions by hand.

**Signing (when certificates are available).** Add these repository secrets and the release workflow signs automatically: `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` (base64 `.pfx`), `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` (base64 Developer ID `.p12`), and `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` for notarization (also set `"notarize": true` under `build.mac` in `package.json`).

## Running it from source

```bash
npm install
npm run dev        # Electron + hot reload
npm test           # unit tests (VISCA framing + a fake camera on loopback)
npm run typecheck
npm run build      # bundles to out/
npm run dist       # Windows installer + portable into dist/
npm run dist:mac   # on a Mac: arm64 + x64 dmg/zip (downloads both ffmpeg builds first)
```

Releasing: add a `## [x.y.z]` section to `CHANGELOG.md`, bump `version` in `package.json`, then `git tag vx.y.z && git push origin main --tags`. GitHub Actions creates the release with those notes and attaches the Windows and macOS builds plus the update feed files.

On the camera: put the Tail 2 on the same LAN, find its IP (OBSBOT Center → Device Management, or the Web UI), turn on **RTSP mode** (OBSBOT Center → More → Output → RTSP), and in the app press **Add camera**, type the IP, then **Test connection**. No camera handy? Pick the **Demo** video source to see the whole thing run on a test pattern.

No camera at all? `npm run fake-camera` starts a fake Tail 2 that answers VISCA on `127.0.0.1:52381`; add a Demo camera with that IP and you get picture, position read-back and presets.

Dev / test switches: `EZY_USER_DATA=<dir>` uses a separate config folder; `EZY_NDI_RUNTIME=<path to Processing.NDI.Lib.x64.dll / libndi.dylib>` overrides NDI runtime detection; `EZY_CAPTURE=<file.png>` screenshots the window after `EZY_CAPTURE_DELAY` ms and quits; `EZY_AUTOTEST=presets,log` runs a scripted interaction for those screenshots.

Keyboard (defaults, change them in Mapping): `1-9` recall preset · `Ctrl+S` save preset · `Ctrl+1-9` select camera · `Q W E A D Z S C` jog · `H` home · `-` / `=` zoom · `[` / `]` jog speed · `T` track · `R` record · `O` rotate · `F` AF push · `I` camera settings · `L` log · `M` mapping.

**Camera settings** (`I`): AI tracking mode, speed and auto-zoom framing, only-me; focus auto/manual with position; exposure auto/manual with compensation, shutter, gain, backlight and anti-flicker; white balance modes with colour temperature and R/B gain; image style, brightness, contrast, saturation, sharpness, hue. The drawer reads the camera's real values and re-reads after each change.

**Tally**: right-click a camera in the rack to mark it program (red) or preview (green), or drive it from a switcher over OSC (`/tally/pgm <i>`, `/tally/pvw <i>`, or `/cam/<i>/tally <0|1|2>`).

## MIDI and OSC

Open **Mapping** (top right or `M`). Every control is a row.

- **MIDI**: click *Learn* on a row, then press a button or move a knob on your controller. Buttons work with notes or CC (≥ 64 = press). Knobs and faders drive zoom level, jog speed, and the pan / tilt axes (centre = stop). For *Recall preset* the learned note becomes preset 1 and the next 63 notes follow; for *Select camera* the next 8 notes follow. Devices can be switched off individually.
- **OSC in**: the app listens on UDP 9000 (change it in the panel). The address scheme is always on, no mapping needed:

  ```
  /cam/select <n>              /cam/<i>/preset/<n>        /cam/<i>/preset/save
  /cam/<i>/ptz/<dir> [0|1]     /cam/<i>/ptz/pan <-1..1>   /cam/<i>/ptz/tilt <-1..1>
  /cam/<i>/ptz/speed <1..24>   /cam/<i>/home              /cam/<i>/zoom <1..12>
  /cam/<i>/zoom/tele [0|1]     /cam/<i>/zoom/wide [0|1]   /cam/<i>/track [0|1]
  /cam/<i>/record [0|1]        /cam/<i>/rotate [0|1]      /cam/<i>/focus/push
  /cam/<i>/tally <0|1|2>       /tally/pgm <i>             /tally/pvw <i>
  ```

  `<i>` is the camera number in the rack (1, 2, …) or `sel` for the selected one; `<dir>` is up, down, left, right, upleft, upright, downleft, downright. *Copy address list* in the panel gives you the full expanded list for TouchOSC or Bitfocus Companion (generic OSC module).
- **OSC feedback**: switch it on and point it at a host:port to receive `/cam/select`, `/cam/<i>/preset/active <n>`, `/cam/<i>/online <0|1>` and `/cam/<i>/position <pan> <tilt> <zoom>` (4 Hz).
- Test from a terminal: `npm run osc-send -- /cam/1/preset/2` (add `host:port` first to target another machine).

When something misbehaves, open **Log** (top right). It lists VISCA connection changes, ffmpeg errors, failed commands and app errors; "Open log file" reveals `logs/ezy-ctrl.log` in the config folder (`%APPDATA%\EZY CTRL` for the installed app).

## Repo layout

```
src/
  main/                  # Electron main process
    visca/               #   packet.ts (framing, nibbles) · commands.ts (Tail 2 command set) · client.ts (UDP) · tail2.ts (friendly API)
    store/cameras.ts     #   cameras.json persistence
    store/presets.ts     #   presets.json persistence (unlimited app-side presets)
    log.ts               #   ring buffer + log file behind the in-app Log drawer
    updater.ts           #   electron-updater against GitHub Releases
    osc/                 #   codec.ts (OSC 1.0) · server.ts (UDP in/out)
    store/settings.ts    #   settings.json (OSC ports, feedback target, disabled MIDI devices)
    store/mappings.ts    #   mappings.json (the mapping table)
    cameras.ts           #   one connection per camera + position polling
    video/               #   ffmpeg.ts (args, binary path) · stream.ts (process + restart) · mp4.ts (box splitter, codec) · manager.ts (fan-out over IPC)
    ndi/                 #   runtime.ts (find the installed NDI runtime) · lib.ts (koffi bindings) · manager.ts (one receiver per camera, frames over IPC)
    ipc.ts               #   IPC handlers
  preload/               # window.ezy bridge
  renderer/              # React UI (rack, stage, viewport, presets, mapping panel, log); video/player.ts = MediaSource player per camera · video/ndi.ts = NDI frames onto a canvas
    src/control/         #   midi.ts (Web MIDI inputs) · executor.ts (runs actions against the app)
  shared/types.ts
  shared/mapping.ts      # action registry, mapping model, MIDI/key/OSC matching, built-in OSC scheme
scripts/fake-tail2.mjs   # fake camera for development (npm run fake-camera)
scripts/osc-send.mjs     # send a test OSC message (npm run osc-send -- /cam/1/home)
scripts/fetch-ffmpeg.mjs # download ffmpeg per architecture for packaging (used by the macOS build)
scripts/diagnose.mjs     # ask a real camera every inquiry the app uses + pull 3 s of video (npm run diagnose -- <ip>)
scripts/ndi-probe.mjs    # list NDI sources and pull a few frames straight from the NDI runtime (npm run ndi-probe -- --ip <ip>)
tests/                   # vitest: framing, fake camera over loopback, mp4 parsing, ffmpeg demo stream, preset store, mapping logic, OSC codec
docs/
  ARCHITECTURE.md        # stack decision and how the pieces fit
  protocol/
    visca-over-ip.md     # command reference derived from OBSBOT's official spreadsheet
  reference/             # OBSBOT's original VISCA spreadsheets (IP + UART)
mockups/                 # UI mockup source (design-canvas artboards) + canvas.json layout
ROADMAP.md               # milestones
```

## Sources

- OBSBOT Tail 2 User Manual v1.0 and Quick Start Guide (OBSBOT)
- OBSBOT Tail series VISCA over IP guide: https://www.obsbot.com/explore/obsbot-tail-air/visca-over-ip
- Web UI guide: https://www.obsbot.com/explore/obsbot-tail-2/web-ui-user-guide
- SRT guide: https://www.obsbot.com/explore/obsbot-tail-2/srt-protocol
