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
| Video (optional) | NDI / SRT | NDI needs a paid licence key; SRT listener defaults to port 5000. Only one output mode is active at a time. |
| Web UI | HTTP | `http://<camera-ip>` (login `Admin` / `Admin` on first use) — network setup and a fallback preview. |

Gimbal range: pan ±160°, tilt −65° to +32°, roll ±120°. Zoom 1×–12× hybrid (5× optical).

## Status

- M0 research + UI design: done. Direction chosen: **Rack** (multi-camera first).
- M1 talk to the camera: first cut in. VISCA-over-IP client with tests, add camera by IP, jog / zoom / home, live position read-back. Not yet verified against a real Tail 2.

See [ROADMAP.md](ROADMAP.md) for what comes next and the GitHub issues for individual features.

## Running it

```bash
npm install
npm run dev        # Electron + hot reload
npm test           # unit tests (VISCA framing + a fake camera on loopback)
npm run typecheck
npm run build      # bundles to out/
```

On the camera: put the Tail 2 on the same LAN, find its IP (OBSBOT Center → Device Management, or the Web UI), and in the app press **Add camera**, type the IP, then **Test connection**. RTSP mode only matters once the viewport lands in M2.

Keyboard: `1-9` select camera · `Q W E A D Z S C` jog · `H` home · `-` / `=` zoom · `[` / `]` jog speed.

## Repo layout

```
src/
  main/                  # Electron main process
    visca/               #   packet.ts (framing, nibbles) · commands.ts (Tail 2 command set) · client.ts (UDP) · tail2.ts (friendly API)
    store/cameras.ts     #   cameras.json persistence
    cameras.ts           #   one connection per camera + position polling
    ipc.ts               #   IPC handlers
  preload/               # window.ezy bridge
  renderer/              # React UI (rack, stage, add-camera dialog)
  shared/types.ts
tests/                   # vitest: framing + fake camera over loopback
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
