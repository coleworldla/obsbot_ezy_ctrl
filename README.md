# OBSBOT EZY CTRL

A lightweight desktop controller for one or more **OBSBOT Tail 2** cameras on the local network.

> Independent, open-source project (MIT). Not affiliated with, endorsed by or supported by OBSBOT. OBSBOT and Tail 2 are trademarks of their owner; NDI is a trademark of Vizrt NDI AB.

Goals:

- **Connect by IP** — type the camera's IP address, see the live picture, start driving.
- **See the viewport** — the live camera feed is the centre of the app, not an afterthought.
- **Easy controls** — pan/tilt jog, zoom with adjustable speed, home, AI tracking, record, landscape/portrait — every control is a named *action*.
- **See what the AI follows** — the camera's tracking box drawn over the live picture, like on the camera's own web page.
- **Map anything** — any action can be bound to a **MIDI** note/CC or an **OSC** address (MIDI-learn style).
- **Unlimited presets** — presets live in the app (pan, tilt, zoom, focus, thumbnail), not in the camera's fixed slots, so there is no cap. Recalled with absolute moves at a chosen speed.
- **Multi-camera** — several Tail 2s side by side, each with its own presets and mappings.
- **Shows** — save the whole setup (cameras, presets, mappings, OSC) as a `.ezy` show file and open it again for the next event.
- **Eyes on everything** — anything that is not a Tail 2 (an SDI-to-NDI encoder, another camera, a media server output) can be added as a **video-only** source: picture and tally in the rack, no controls.

## How it talks to the camera

| Purpose | Protocol | Details |
|---|---|---|
| Control | VISCA over IP | UDP port **52381**, Sony-compatible framing. Full command list in [docs/protocol/visca-over-ip.md](docs/protocol/visca-over-ip.md). |
| Video (default) | RTSP | `rtsp://<camera-ip>:8554/live` — enable **RTSP mode** in OBSBOT Center / Start (Output → RTSP). |
| Video (NDI) | NDI | Camera in NDI mode (licence on the camera). The app receives the NDI **proxy stream** (640×360) directly through the NDI runtime installed on the computer (Windows: comes with [NDI Tools](https://ndi.video/tools/); macOS: install the [NDI Runtime for Apple](https://ndi.link/NDIRedistV6Apple)), while the full-quality feed goes to your switcher or media server. Sources are discovered automatically; Auto picks the one at the camera's IP. |
| Video (optional) | SRT | Camera in SRT listener mode (default port 5000); the app connects as caller. Only one camera output mode is active at a time. |
| Web UI | HTTP | `http://<camera-ip>` (login `Admin` / `Admin` on first use) — network setup and a fallback preview. |
| Tracking box | WebSocket | `ws://<camera-ip>:9001`, the camera's web preview stream; the app reads only the AI target from it. See [docs/protocol/web-preview.md](docs/protocol/web-preview.md). |
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

The builds are not code-signed yet, so both systems warn on first launch. Nothing is wrong with the download; this is what every unsigned app gets until it is signed with a paid developer certificate.

**Windows.** SmartScreen shows "Windows protected your PC": click **More info → Run anyway**. Once.

### macOS: first launch

1. **Pick the right file.** Apple Silicon (M1, M2, M3, M4): `EZY-CTRL-<version>-arm64.dmg`. Intel: `EZY-CTRL-<version>-x64.dmg`. Not sure? Apple menu → About This Mac: "Chip Apple M…" means arm64. The `.zip` and `.blockmap` files are for the auto-updater; ignore them.
2. Open the dmg and drag **EZY CTRL** into **Applications**. Eject the dmg.
3. Double-click the app once. macOS refuses: "Apple could not verify EZY CTRL is free of malware" (macOS 15 Sequoia) or "cannot be opened because the developer cannot be verified" (macOS 13–14). Click **Done** / **Cancel**, do not move it to the Trash.
4. Open **System Settings → Privacy & Security**, scroll down to the **Security** section. It says *"EZY CTRL" was blocked to protect your Mac*. Click **Open Anyway**, enter your password or Touch ID, then **Open** in the last dialog.
5. On macOS 13–14 you can skip step 4: right-click the app in Applications → **Open** → **Open**.
6. The first time it talks to a camera, macOS asks *EZY CTRL would like to find and connect to devices on your local network*. Click **Allow**. Without it, VISCA and NDI cannot reach the cameras. Changed your mind later? System Settings → Privacy & Security → Local Network.

macOS only asks once; after that the app opens like any other. If the app still refuses with "is damaged and can't be opened", macOS has flagged the download itself. Clear that flag in Terminal (Applications → Utilities → Terminal), then launch again:

```bash
xattr -cr "/Applications/EZY CTRL.app"
```

**NDI on the Mac** needs the NDI runtime library, and on macOS **NDI Tools does not install it**. Install the [NDI Runtime for Apple](https://ndi.link/NDIRedistV6Apple) (or in Terminal: `brew install --cask libndi`); it puts `libndi.dylib` in `/usr/local/lib`, where the app finds it. Then press **Refresh** in the camera dialog, no restart needed. Installed somewhere unusual? **Locate runtime…** in the same place lets you pick the file. macOS also asks once whether EZY CTRL may find devices on the local network; allow it, or NDI discovery finds nothing. RTSP, SRT and the Web UI work without any of this.

**Updates.** The installed app checks GitHub Releases on startup (switch it off under `?` → Updates), downloads the next version in the background and shows *Restart to update* in the header. The releases are public, so this works out of the box.

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

Other sources: **Add camera → Video only**, then pick an NDI source by name (type the device's IP first if it does not show up; the app then asks it directly) or enter an RTSP / SRT address. Video-only sources take a rack slot and an OSC number like any camera but ignore PTZ, preset and settings actions.

No camera at all? `npm run fake-camera` starts a fake Tail 2 that answers VISCA on `127.0.0.1:52381`; add a Demo camera with that IP and you get picture, position read-back and presets. It also serves a preview stream with a wandering AI target on `ws://127.0.0.1:9001`: press **T** (tracking) and switch on **Tracking box** to see it.

Dev / test switches: `EZY_USER_DATA=<dir>` uses a separate config folder; `EZY_NDI_RUNTIME=<path to Processing.NDI.Lib.x64.dll / libndi.dylib>` overrides NDI runtime detection; `EZY_CAPTURE=<file.png>` screenshots the window after `EZY_CAPTURE_DELAY` ms and quits; `EZY_AUTOTEST=presets,log` runs a scripted interaction for those screenshots.

Presets rail: click recalls, drag reorders, double-click renames. To delete several at once press **Select** (or Ctrl-click a preset), pick the rows (Shift-click for a range, Ctrl+A for all), then **Delete** or the Delete key. One confirmation, one write.

Keyboard (defaults, change them in Mapping): `1-9` recall preset · `Ctrl+S` save preset · `Ctrl+1-9` select camera · `Q W E A D Z S C` jog · `H` home · `-` / `=` zoom · `[` / `]` jog speed · `T` track · `R` record · `O` rotate · `F` AF push · `I` camera settings · `L` log · `M` mapping · `Ctrl+Shift+S` save show · `Ctrl+O` open show.

**Shows (`.ezy` files)**: the **SHOW** button in the header names the current show and opens its menu: **Save show** (`Ctrl+Shift+S`), **Save show as…**, **Open show…** (`Ctrl+O`), recent shows and the backups folder. A show file holds everything needed to bring a production back: the cameras (addresses and video sources), every preset with its thumbnail, the mapping table, the OSC setup (listen port, feedback target, naming) and the operator's jog, zoom and recall speeds and the tracking box choice. Shows go to `Documents\EZY CTRL Shows` by default; the file is JSON, so it can be backed up, mailed or kept in version control. A dot next to the name means the setup changed since the show was saved (the working setup itself is always kept, a show is a snapshot). Opening a show asks first, then replaces the cameras, presets, mappings and OSC setup; the setup it replaces is copied to the backups folder (the newest 20 are kept). Double-clicking a `.ezy` file opens it in EZY CTRL (installed app; a running EZY CTRL takes it over instead of starting a second copy). OSC: `/app/show/save`, `/app/show/open`.

**Zoom speed**: the **ZOOM SPD** slider under the zoom row sets how fast W / T, the `-` / `=` keys and MIDI / OSC tele / wide zoom, from 1 (slowest) to 8 (fastest); it is VISCA's variable zoom speed 0–7. The zoom-ratio slider and preset recalls jump to an exact ratio, which VISCA does at the camera's own speed. Jog and zoom speeds are remembered between launches.

**Tracking box**: the button above the picture draws the target the camera's AI is following, the way the camera's own web page does: a frame with green corners that moves with the person, and **TARGET LOST** when the camera loses them. With tracking off nothing is drawn. It reads the camera's web preview stream (`ws://<camera-ip>:9001`, no login), only for the camera on stage and only while the button is on. That stream is a few Mbit/s, and the camera serves at most two web previews at a time, so an open camera web page counts as one. The setting is remembered; OSC `/app/trackbox` or a mapping toggles it. Not available for the Web UI source, which shows the camera's page with its own box.

**Camera settings** (`I`): AI tracking mode, speed and auto-zoom framing, only-me; focus auto/manual with position; exposure auto/manual with compensation, shutter, gain, backlight and anti-flicker; white balance modes with colour temperature and R/B gain; image style, brightness, contrast, saturation, sharpness, hue. The drawer reads the camera's real values and re-reads after each change. Auto-zoom **Close-up** is a single-person framing: the Tail 2 has no close-up in Group mode, so the option is greyed out there (switch Mode to Single first).

**Tally**: right-click a camera in the rack to mark it program (red) or preview (green), or drive it from a switcher over OSC (`/tally/pgm <i>`, `/tally/pvw <i>`, or `/cam/<i>/tally <0|1|2>`).

## MIDI and OSC

Open **Mapping** (top right or `M`). Every control is a row.

- **MIDI**: click *Learn* on a row, then press a button or move a knob on your controller. Buttons work with notes or CC (≥ 64 = press). Knobs and faders drive zoom level, zoom speed, jog speed, and the pan / tilt axes (centre = stop). For *Recall preset* the learned note becomes preset 1 and the next 63 notes follow; for *Select camera* the next 8 notes follow. Devices can be switched off individually.
- **OSC in**: the app listens on UDP 9000 (change it in the panel). The address scheme is always on, no mapping needed:

  ```
  /cam/select <n>              /cam/<i>/preset/<n>        /cam/<i>/preset/save
  /cam/<i>/ptz/<dir> [0|1]     /cam/<i>/ptz/pan <-1..1>   /cam/<i>/ptz/tilt <-1..1>
  /cam/<i>/ptz/speed <1..24>   /cam/<i>/home              /cam/<i>/zoom <1..12>
  /cam/<i>/zoom/tele [0|1]     /cam/<i>/zoom/wide [0|1]   /cam/<i>/zoom/speed <1..8>
  /cam/<i>/zoom/speed/up       /cam/<i>/zoom/speed/down   /cam/<i>/track [0|1]
  /cam/<i>/record [0|1]        /cam/<i>/rotate [0|1]      /cam/<i>/focus/push
  /cam/<i>/tally <0|1|2>       /tally/pgm <i>             /tally/pvw <i>
  ```

  `<i>` is the camera's **name** as a slug (lower-case, anything that is not a letter or digit becomes `_`: "Stage Left" → `stage_left`), its rack number (1, 2, …), or `sel` for the camera on stage. Presets work the same way: `/cam/stage_left/preset/podium` or `/cam/1/preset/2`. Renaming a camera or preset renames its address; the OSC map always shows the current ones. `<dir>` is up, down, left, right, upleft, upright, downleft, downright. *Copy address list* in the panel gives you the full expanded list for TouchOSC or Bitfocus Companion (generic OSC module).
- **Names**: the OSC map opens with a **Names** section (also from the presets footer's **Names** button or by clicking the OSC pill in the header): every camera and preset name you typed next to its OSC form and address. Copy the names, the OSC names, both side by side, or CSV; click any cell to copy just that one.
- **OSC map**: Mapping → **OSC map…** lists every address for your actual rack (CAM 1, CAM 2, …, presets by name, feedback addresses) with a filter and copy buttons in four formats: plain text, addresses only, CSV (section, address, argument, description, direction) and a Markdown table. Click any address to copy just that one. **By name / By number** switches how the map and the feedback messages address cameras (incoming always accepts both).
- **Presets over OSC**: `/cam/<i>/preset/<n>` recalls preset `n` (its position in the rail, 1-based, at the rail's recall speed); `/cam/<i>/preset <n>` does the same with the number as the argument, for encoders and faders; `/cam/<i>/preset/save` stores the current position as a new preset. Feedback sends `/cam/<i>/preset/active <n> <name>` (0 and "" when the camera has left every preset). Deleting and renaming are app-only.
- **OSC feedback**: switch it on and point it at a host:port to receive `/cam/select <n> <name>`, `/cam/<i>/preset/active <n> <name>`, `/cam/<i>/tally <0|1|2>`, `/cam/<i>/online <0|1>` and `/cam/<i>/position <pan> <tilt> <zoom>` (4 Hz). `<i>` is the camera's name slug by default, or its number when the OSC map is set to By number.
- Test from a terminal: `npm run osc-send -- /cam/1/preset/2` (add `host:port` first to target another machine).

When something misbehaves, open **Log** (top right). It lists VISCA connection changes, ffmpeg errors, failed commands and app errors; "Open log file" reveals `logs/ezy-ctrl.log` in the config folder (`%APPDATA%\obsbot-ezy-ctrl` on Windows, `~/Library/Application Support/obsbot-ezy-ctrl` on macOS; the installed app and `npm run dev` share it).

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
    show.ts              #   shows: save / open .ezy files, backups, current + recent show (show-dialogs.ts = file pickers and confirmation)
    video/               #   ffmpeg.ts (args, binary path) · stream.ts (process + restart) · mp4.ts (box splitter, codec) · manager.ts (fan-out over IPC)
    ndi/                 #   runtime.ts (find the installed NDI runtime) · lib.ts (koffi bindings) · manager.ts (one receiver per camera, frames over IPC)
    ipc.ts               #   IPC handlers
  preload/               # window.ezy bridge
  renderer/              # React UI (rack, stage, viewport, presets, mapping panel, log); video/player.ts = MediaSource player per camera · video/ndi.ts = NDI frames onto a canvas · video/tracking.ts = AI target feed per camera
    src/control/         #   midi.ts (Web MIDI inputs) · executor.ts (runs actions against the app)
  shared/types.ts
  shared/mapping.ts      # action registry, mapping model, MIDI/key/OSC matching, built-in OSC scheme
  shared/tracking.ts     # parser for the AI target in the camera's web preview stream
  shared/show.ts         # the .ezy show format: build, validate, fingerprint for unsaved changes
scripts/fake-tail2.mjs   # fake camera for development (npm run fake-camera)
scripts/osc-send.mjs     # send a test OSC message (npm run osc-send -- /cam/1/home)
scripts/fetch-ffmpeg.mjs # download ffmpeg per architecture for packaging (used by the macOS build)
scripts/diagnose.mjs     # ask a real camera every inquiry the app uses + pull 3 s of video (npm run diagnose -- <ip>)
scripts/ndi-probe.mjs    # list NDI sources and pull a few frames straight from the NDI runtime (npm run ndi-probe -- --ip <ip>)
tests/                   # vitest: framing, fake camera over loopback, mp4 parsing, ffmpeg demo stream, preset store, mapping logic and store, OSC codec, tracking-box parser, show files
docs/
  ARCHITECTURE.md        # stack decision and how the pieces fit
  protocol/
    visca-over-ip.md     # command reference derived from OBSBOT's official spreadsheet
    web-preview.md       # our notes on the camera's web preview stream (AI target) and status feed
mockups/                 # UI mockup source (design-canvas artboards) + canvas.json layout
ROADMAP.md               # milestones
```

## Sources

- OBSBOT Tail 2 User Manual v1.0 and Quick Start Guide (OBSBOT)
- OBSBOT's VISCA over IP / UART command spreadsheets for the Tail 2 (download them from OBSBOT; `docs/protocol/visca-over-ip.md` is our own summary of them)
- OBSBOT Tail series VISCA over IP guide: https://www.obsbot.com/explore/obsbot-tail-air/visca-over-ip
- Web UI guide: https://www.obsbot.com/explore/obsbot-tail-2/web-ui-user-guide
- SRT guide: https://www.obsbot.com/explore/obsbot-tail-2/srt-protocol

## License

MIT — see [LICENSE](LICENSE). Use it, change it, ship it; keep the notice.
