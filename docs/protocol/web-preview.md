# OBSBOT Tail 2: web preview stream and AI target

Our own notes, from watching a Tail 2 on firmware 7.2.13.1 and reading the web page the camera serves at `http://<ip address>/`. OBSBOT does not document this interface; it may change with firmware.

## Preview WebSocket: `ws://<ip address>:9001`

- The camera's web page plays its live view from this WebSocket. No login and no request: the camera starts sending as soon as the connection opens.
- Binary messages, about one per video frame (~30 a second). At the default preview size that is roughly 5 Mbit/s.
- The camera serves **at most two** web previews at a time (its web page says so: "The web version only supports opening two preview windows at the same time"). The status feed below reports the current count as `preview_num`.

Each message is one packet with a 79-byte header. All numbers are little-endian.

| Offset | Size | Field |
|---|---|---|
| 0 | u8 | magic `0x5C` |
| 1 | u8 | packet type (`1` seen) |
| 2 | u32 | data length (bytes after the header) |
| 6 | u8 | entry count (`3` seen) |
| 7 | 9 × count | entries: u8 kind, u32 offset, u32 length; offsets count from the end of the header |
| … | … | zero padding to byte 79 |

Entry kinds seen:

| Kind | Length | Content |
|---|---|---|
| 1 | varies | encoded video for the web page's decoder |
| 3 | 8 | a timestamp (u64, microseconds) |
| 5 | 44 | the AI tracking target |

The AI target (kind 5):

| Offset | Type | Field |
|---|---|---|
| 0 | u32 | id; `255` = no target selected |
| 4 | u32 | alive; `1` = being tracked, anything else = target lost |
| 8 | u32 | real |
| 12 | u32 | st_type |
| 16 | u32 | cst_type |
| 20 | f32 | xmin |
| 24 | f32 | ymin |
| 28 | f32 | xmax |
| 32 | f32 | ymax |
| 36 | f32 | distance |
| 40 | f32 | dis_score |

The box is in fractions of the picture (0 … 1, origin top left). The camera's web page draws nothing for id 255, shows "target lost" when alive is not 1, and skips a box of exactly 0, 0, 1, 1. With tracking off the camera sends id 255, alive 0 and zeros.

EZY CTRL reads only the header and the target record (`src/shared/tracking.ts`) and throws the video away. It opens the connection only while **Tracking box** is on, for the camera on stage.

## Status WebSocket: `ws://<ip address>/ws/`

JSON, about once a second, no login. Fields seen include `power_on`, `usb_mode`, `preview_num`, `rec`, `switch_portrait`, `ai_mode` (`"none"` with tracking off), `zoom_type`, `only_me`, `tracking_settings`, `composition`, `preset_cnt`, `zoom_ratio`, `focus_mode`, `ndi` / `rtsp` / `srt` / `rtmp` (`enable`), `sdcard` and `device_status`. EZY CTRL does not use it yet.

Not verified yet: how the box behaves in portrait orientation.
