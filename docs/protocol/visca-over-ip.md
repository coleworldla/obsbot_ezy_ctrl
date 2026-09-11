# OBSBOT Tail 2 — VISCA over IP command reference

Source: OBSBOT official spreadsheet `obsbot_tail_2_visca_over_ip.xlsx` (see `docs/reference/`), downloaded 2026-09-11 from https://www.obsbot.com/explore/obsbot-tail-air/visca-over-ip

Transport: **IPv4 / UDP / port 52381**, "Compatible with Sony VISCA over IP Protocol" (Sony 8-byte header: `01 00` + 2-byte payload length + 4-byte sequence number, then the raw VISCA packet `81 ... FF`).


## Commands

| Group | Command | Variant | Packet | Notes |
|---|---|---|---|---|
| ZOOM | STOP |  | `81 01 04 07 00 FF` |  |
| ZOOM | TELE | Standard Speed | `81 01 04 07 02 FF` |  |
| ZOOM | WIDE | Standard Speed | `81 01 04 07 03 FF` |  |
| ZOOM | TELE | Variable Speed | `81 01 04 07 2p FF` | p: 0 (Low) - 7 (High) |
| ZOOM | WIDE | Variable Speed | `81 01 04 07 3p FF` | p: 0 (Low) - 7 (High) |
| ZOOM | DIRECT |  | `81 01 04 47 0z 0z 0z 0z FF` | zzzz: Zoom ratio (1-12) * 1000 |
| PAN TILT | PAN TILT DRIVE | UP | `81 01 06 01 vv ww 03 01 FF` | vv: Pan speed 01 (Slow) - 18 (Fast)  ww: Tilt speed 01 (Slow) - 17 (Fast) |
| PAN TILT | PAN TILT DRIVE | DOWN | `81 01 06 01 vv ww 03 02 FF` |  |
| PAN TILT | PAN TILT DRIVE | LEFT | `81 01 06 01 vv ww 01 03 FF` |  |
| PAN TILT | PAN TILT DRIVE | RIGHT | `81 01 06 01 vv ww 02 03 FF` |  |
| PAN TILT | PAN TILT DRIVE | UPLEFT | `81 01 06 01 vv ww 01 01 FF` |  |
| PAN TILT | PAN TILT DRIVE | UPRIGHT | `81 01 06 01 vv ww 02 01 FF` |  |
| PAN TILT | PAN TILT DRIVE | DOWNLEFT | `81 01 06 01 vv ww 01 02 FF` |  |
| PAN TILT | PAN TILT DRIVE | DOWNRIGHT | `81 01 06 01 vv ww 02 02 FF` |  |
| PAN TILT | PAN TILT DRIVE | STOP | `81 01 06 01 vv ww 03 03 FF` |  |
| PAN TILT | PAN TILT DRIVE | ABS  (Absolute  Position) | `81 01 06 02 vv ww 0p 0p 0p 0p 0t 0t 0t 0t FF` | pppp(Pan position): (0 -- 0x854) * 0.075 = 0°-- 159.9° (0 -- 0xf7ab) * 0.075 = 0°-- (-159.9°)  tttt(Tilt position): (0 -- 0x346) * 0.075 = 0°-- 62.85° (0 -- 0xfcb9) * 0.075 = 0°-- (-62.85°) |
| PAN TILT | PAN TILT DRIVE | HOME | `81 01 06 04 FF` |  |
| FOCUS | MODE | Auto/Manual | `81 01 04 38 pp FF` | pp: 02=Auto Focus, 03=Manual Focus |
| FOCUS | STOP |  | `81 01 04 08 00 FF` |  |
| FOCUS | FAR | Standard Speed | `81 01 04 08 02 FF` |  |
| FOCUS | NEAR | Standard Speed | `81 01 04 08 03 FF` |  |
| FOCUS | FAR | Variable  Speed | `81 01 04 08 2p FF` | p = 0(low) - 7(high) |
| FOCUS | NEAR | Variable  Speed | `81 01 04 08 3p FF` | p = 0(low) - 7(high) |
| FOCUS | ONE PUSH TRIGGER |  | `81 01 04 18 01 FF` | One Push AF Trigger |
| FOCUS | DIRECT |  | `81 01 04 48 0p 0p 0p 0p FF` | pppp: 0000 - 0064 |
| PRESET | RESET | Reset | `81 01 04 3F 00 pp FF` | pp: PRESET No. to reset - 1 (00 - FF) |
| PRESET | SET | Set | `81 01 04 3F 01 pp FF` |  |
| PRESET | RECALL | Recall | `81 01 04 3F 02 pp FF` |  |
| COLOR | WHITE  BALANCE MODE |  | `81 01 04 35 0p FF` | p: 0=Auto, 1=DayLight, 2=Fluorescent,  3=OnePush, 4=Tungsten, 5=Manual, 6=Cloudy |
| COLOR | ONE PUSH TRIGGER |  | `81 01 04 10 05 FF` | One Push WB Trigger |
| COLOR | R.GAIN | Up | `81 01 04 03 02 FF` |  |
| COLOR | R.GAIN | Down | `81 01 04 03 03 FF` |  |
| COLOR | R.GAIN | Direct | `81 01 04 43 00 00 0p 0q FF` | pq:0 - 0xFF |
| COLOR | B.GAIN | Up | `81 01 04 04 02 FF` |  |
| COLOR | B.GAIN | Down | `81 01 04 04 03 FF` |  |
| COLOR | B.GAIN | Direct | `81 01 04 44 00 00 0p 0q FF` | pq:0 - 0xFF |
| COLOR | COLOR TEMPERATURE | Reset | `81 01 04 20 00 FF` | 5500K |
| COLOR | COLOR TEMPERATURE | Up | `81 01 04 20 02 FF` |  |
| COLOR | COLOR TEMPERATURE | Down | `81 01 04 20 03 FF` |  |
| COLOR | COLOR TEMPERATURE | Direct | `81 01 04 20 0p 0q  0r 0s FF` | pqrs: 2000K~10000K |
| EXPOSURE | MODE |  | `81 01 04 39 0p FF` | p: 0=Full Auto, 3=Manual |
| EXPOSURE | GAIN | Up | `81 01 04 0C 02 FF` |  |
| EXPOSURE | GAIN | Down | `81 01 04 0C 03 FF` |  |
| EXPOSURE | SHUTTER | Up | `81 01 04 0A 02 FF` | Fast |
| EXPOSURE | SHUTTER | Down | `81 01 04 0A 03 FF` | Slow |
| EXPOSURE | BACKLIGHT | On/Off | `81 01 04 33 0p FF` | p: 2=On, 3=Off |
| EXPOSURE | EXP COMP | Reset | `81 01 04 0E 00 FF` | 0EV |
| EXPOSURE | EXP COMP | Up | `81 01 04 0E 02 FF` |  |
| EXPOSURE | EXP COMP | Down | `81 01 04 0E 03 FF` |  |
| EXPOSURE | EXP COMP | Direct | `81 01 04 4E 00 00 0p 0q FF` | pq: ExpComp Position 00: -3.0  01: -2.7 02: -2.3 03: -2.0 04: -1.7 05: -1.3 06: -1.0 07: -0.7 08: -0.3 09:  0    0A: +0.3 0B: +0.7 0C: +1.0 0D: +1.3 0E: +1.7 0F: +2.0 10: +2.3 11: +2.7 12: +3.0 |
| EXPOSURE | FLICKER |  | `81 01 04 23 0p FF` | p: 0: Off, 1: 50Hz, 2: 60Hz |
| IMAGE | STYLE |  | `81 01 04 40 0p FF` | p: 0:Standard, 1:Outdoor, 2: Pastel, 3:Custom |
| IMAGE | BRIGHT | Up | `81 01 04 0D 02 FF` |  |
| IMAGE | BRIGHT | Down | `81 01 04 0D 03 FF` |  |
| IMAGE | BRIGHT | Direct | `81 01 04 4D 00 00 0p 0q FF` | pq: Bright Position, 0 to 100 |
| IMAGE | CONTRAST | Direct | `81 01 04 A2 00 00 0p 0q FF` | pq: Contrast Position, 0 to 100 |
| IMAGE | SATURATION | Direct | `81 01 04 A3 00 00 0p 0q FF` | pq: Saturation Position, 0 to 100 |
| IMAGE | SHARPNESS | Direct | `81 01 04 A4 00 00 0p 0q FF` | pq: Sharpness Position, 0 to 100 |
| IMAGE | HUE | Direct | `81 01 04 A5 00 00 0p 0q FF` | pq: Hue Position, 0 to 100 |
| VIDEO | RECORD |  | `81 01 04 66 0p FF` | p: 0=Off, 1=On |
| VIDEO | ORIENTATION |  | `81 01 04 67 0p FF` | p: 0=Horizontal, 1=Vertical |
| AI | TRACK | On/Off | `81 01 8E 00 0p FF` | p: 2=On, 3=Off |
| AI | TRACK MODE | Single-person Multi-person | `81 01 8E 01 0p FF` | p: 0=Single-person, 1=Multi-person |
| AI | TRACK SPEED |  | `81 01 8E 02 0p 0q 0r 0s 0t FF` | p: 0=Super Lazy, 1=Lazy, 2=Slow, 3=Fast, 4=Crazy, 5=Custom  q: 0=Pan Manual, 1=Pan Auto r: 1-10 (Pan Speed) s: 0=Pitch Manual, 1=Pitch Auto t: 1-10 (Pitch Speed) |
| AI | AUTO ZOOM |  | `81 01 8E 03 0p FF` | Single-person p: 0=None, 1=CloseUp, 2=HalfBody, 3=AboveTheKnees, 4=NineHeadPortrait, 5=FullBody, 6=LongShot1, 7 = LongShot2 Multi-person p: 0=None, 2=HalfBody, 3=AboveKnees, 4=NineHeadPortrait, 5=FullBody, 6=LongShot1, 7 = LongShot2 |
| AI | ONLY ME |  | `81 01 8E 04 0p FF` | p: 0=Off, 1=On |

## Inquiries

| Group | Inquiry | Packet | Reply | Notes |
|---|---|---|---|---|
| PAN TILT | POSITION | `81 09 06 12 FF` | `y0 50 0p 0p 0p 0p 0t 0t 0t 0t FF` | pppp(Pan position): (0 -- 0x854) * 0.075 = 0°-- 159.9° (0 -- 0xf7ab) * 0.075 = 0°-- (-159.9°)  tttt(Tilt position): (0 -- 0x346) * 0.075 = 0°-- 62.85° (0 -- 0xfcb9) * 0.075 = 0°-- (-62.85°) |
| ZOOM | ZOOM POSITION | `81 09 04 47 FF` | `y0 50 0z 0z 0z 0z FF` | zzzz: Zoom ratio (1-12) * 1000 |
| FOCUS | MODE | `81 09 04 38 FF` | `y0 50 0p FF` | p: 2=Auto Focus, 3=Manual Focus |
| FOCUS | FOCUS POSITION | `81 09 04 48 FF` | `y0 50 0p 0p 0p 0p FF` | pppp: 0000 - 0064 |
| EXPOSURE | MODE | `81 09 04 39 FF` | `y0 50 0p FF` | p: 0=Full Auto, 3=Manual |
| EXPOSURE | SHUTTER | `81 09 04 4A FF` | `y0 50 00 00 0p 0p FF` | pp: 09: 1/8000 0A: 1/6400 0B: 1/5000 0C: 1/4000 0D: 1/3200 0E: 1/2500 0F: 1/2000 10: 1/1600 11: 1/1250 12: 1/1000 13: 1/800 14: 1/640 15: 1/500 16: 1/400 17: 1/320 18: 1/240 19: 1/200 1A: 1/160 1B: 1/120 1C: 1/100 1D: 1/80 1E: 1/60 1F: 1/50 20: 1/40 21: 1/30 22: 1/25 |
| EXPOSURE | GAIN | `81 09 04 4C FF` | `y0 50 00 00 0p 0p FF` | pp: ISO / 100 |
| EXPOSURE | BACKLIGHT | `81 09 04 33 FF` | `y0 50 0p FF` | p: 2=On, 3=Off |
| EXPOSURE | EXP COMP POSITION | `81 09 04 4E FF` | `y0 50 00 00 0p 0q FF` | pq: ExpComp Position |
| EXPOSURE | FLICKER | `81 09 04 55 FF` | `y0 50 0p FF` | p: (0: OFF, 1: 50Hz, 2: 60Hz) |
| IMAGE | STYLE | `81 09 04 40 FF` | `y0 50 0p FF` | p: 0:Standard, 1:Outdoor, 2: Pastel, 3:Custom |
| IMAGE | BRIGHT POSITION | `81 09 04 4D FF` | `y0 50 00 00 0p 0q FF` | pq: Bright Position |
| IMAGE | CONTRAST POSITION | `81 09 04 A2 FF` | `y0 50 00 00 0p 0q FF` | pq: Contrast Position |
| IMAGE | SATURATION POSITION | `81 09 04 A3 FF` | `y0 50 00 00 0p 0q FF` | pq: Saturation Position |
| IMAGE | SHARPNESS POSITION | `81 09 04 A4 FF` | `y0 50 00 00 0p 0q FF` | pq: Sharpness Position |
| IMAGE | HUE POSITION | `81 09 04 A5 FF` | `y0 50 00 00 0p 0q FF` | pq: Hue Position |
| COLOR | WHITE BALANCE MODE | `81 09 04 35 FF` | `y0 50 0p FF` | p: 0=Auto, 1=DayLight, 2=Fluorescent,  3=OnePush, 4=Tungsten, 5=Manual, 6=Cloudy |
| COLOR | R.GAIN | `81 09 04 43 FF` | `y0 50 00 00 0p 0q FF` | pq:0 - 0xFF |
| COLOR | B.GAIN | `81 09 04 44 FF` | `y0 50 00 00 0p 0q FF` | pq:0 - 0xFF |
| COLOR | COLOR TEMPERATURE | `81 09 04 20 FF` | `y0 50 0p 0q 0r 0s FF` |  |
| VIDEO | RECORD | `81 09 04 66 FF` | `y0 50 0p FF` | p: 0=Off, 1=On |
| VIDEO | ORIENTATION | `81 09 04 67 FF` | `y0 50 0p FF` | p: 0=Horizontal, 1=Vertical |
| AI | TRACK | `81 09 8E 00 FF` | `y0 50 0p FF` | p: 2=On, 3=Off |
| AI | TRACK MODE | `81 09 8E 01 FF` | `y0 50 0p FF` | p: 0=Single-person, 1=Multi-person |
| AI | TRACK SPEED | `81 09 8E 02 FF` | `y0 50 0p 0q 0r 0s 0t FF` | p: 0=Super Lazy, 1=Lazy, 2=Slow, 3=Fast, 4=Crazy, 5=Custom  q: 0=Pan Manual, 1=Pan Auto r: 1-10 (Pan Speed) s: 0=Pitch Manual, 1=Pitch Auto t: 1-10 (Pitch Speed) |
| AI | AUTO ZOOM | `81 09 8E 03 FF` | `y0 50 0p FF` | Single-person p: 0=None, 1=CloseUp, 2=HalfBody, 3=AboveKnees, 4=NineHeadPortrait, 5=FullBody, 6=LongShot1, 7 = LongShot2 Multi-person p: 0=None, 2=HalfBody, 3=AboveKnees, 4=NineHeadPortrait, 5=FullBody, 6=LongShot1, 7 = LongShot2 |
| AI | ONLY ME | `81 09 8E 04 FF` | `y0 50 0p FF` | p: 0=Off, 1=On |
