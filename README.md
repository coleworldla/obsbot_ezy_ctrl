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

Milestone 0 (research + UI design) is done. See [ROADMAP.md](ROADMAP.md) for what comes next and the GitHub issues for individual features.

## Repo layout

```
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
