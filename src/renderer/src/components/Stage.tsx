import { useEffect, useRef, useState } from 'react';
import { viscaZoomSpeed, ZOOM_SPEED_MAX } from '../../../shared/mapping';
import { isMonitor, type CameraConfig, type CameraStatus, type JogDir, type Tally, type ZoomDir } from '../../../shared/types';
import type { CamState, Speed } from '../control/executor';
import { TallyBadge } from './Rack';
import { TrackingOverlay } from './TrackingOverlay';
import { Viewport } from './Viewport';

interface Props {
  camera: CameraConfig;
  status?: CameraStatus;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  onRemove: () => void;
  onEdit: () => void;
  /** "P4 · Podium" while the camera sits on a recalled preset. */
  activePresetName?: string;
  /** Called on any manual move so the active-preset mark is dropped. */
  onManual: () => void;
  camState: CamState;
  onCamState: (patch: Partial<CamState>) => void;
  tally: Tally;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Draw the camera's AI tracking target over the picture. */
  trackBox: boolean;
  onTrackBox: () => void;
}

const Arrow = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const JOG: { dir: JogDir; key: string; d: string }[] = [
  { dir: 'upleft', key: 'Q', d: 'M17 17 7 7M7 15V7h8' },
  { dir: 'up', key: 'W', d: 'M12 19V5M5 12l7-7 7 7' },
  { dir: 'upright', key: 'E', d: 'M7 17 17 7M9 7h8v8' },
  { dir: 'left', key: 'A', d: 'M19 12H5M12 19l-7-7 7-7' },
  { dir: 'stop', key: 'H', d: '' },
  { dir: 'right', key: 'D', d: 'M5 12h14M12 5l7 7-7 7' },
  { dir: 'downleft', key: 'Z', d: 'M17 7 7 17M15 17H7V9' },
  { dir: 'down', key: 'S', d: 'M12 5v14M19 12l-7 7-7-7' },
  { dir: 'downright', key: 'C', d: 'M7 7l10 10M17 9v8H9' },
];

const fmt = (n: number | undefined) => (n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}°`);

export function Stage({ camera, status, speed, onSpeed, onRemove, onEdit, activePresetName, onManual, camState, onCamState, tally, panelOpen, onTogglePanel, trackBox, onTrackBox }: Props) {
  const id = camera.id;
  const [zoomSlider, setZoomSlider] = useState(1);
  const zoomTimer = useRef<number | null>(null);
  const draggingZoom = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Follow the camera's real zoom while the user is not dragging the slider.
  useEffect(() => {
    if (!draggingZoom.current && status?.position) setZoomSlider(status.position.zoomRatio);
  }, [status?.position]);

  const fire = (p: Promise<unknown>) => p.catch(() => undefined);
  const jog = (dir: JogDir) => {
    if (dir !== 'stop') onManual();
    return fire(window.ezy.ptz.drive(id, dir, speed.pan, speed.tilt));
  };
  const zoom = (dir: ZoomDir) => {
    if (dir !== 'stop') onManual();
    return fire(window.ezy.zoom.drive(id, dir, viscaZoomSpeed(speed.zoom)));
  };

  const onZoomInput = (v: number) => {
    setZoomSlider(v);
    onManual();
    draggingZoom.current = true;
    if (zoomTimer.current) window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => {
      fire(window.ezy.zoom.direct(id, v));
      draggingZoom.current = false;
    }, 80);
  };

  const hold = (down: () => void, up: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      down();
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
  });

  const p = status?.position;
  const online = status?.connected ?? false;
  const { tracking, recording, portrait } = camState;
  const live = status?.state;
  /** The Web UI source shows the camera's own page, which draws its own box. */
  const boxable = !!camera.host && camera.videoSource !== 'webui';

  if (isMonitor(camera)) {
    // Video only: picture and tally, no transport.
    return (
      <div className="stage">
        <div className="top">
          <h2>{camera.name}</h2>
          <TallyBadge tally={tally} />
          <span className="mono muted" style={{ fontSize: 11 }} title={`${camera.host ? `${camera.host} · ` : ''}${camera.videoSource.toUpperCase()} ${camera.videoSource === 'webcam' ? '' : camera.videoUrl}`}>
            {camera.host ? `${camera.host} · ` : ''}
            {camera.videoSource.toUpperCase()} {camera.videoSource === 'webcam' ? '' : camera.videoUrl}
          </span>
          <span className="topbtns">
            <button className="b sm" onClick={onEdit} title="Name, address and video source">
              Edit
            </button>
            <button className="b sm" onClick={onRemove}>
              Remove
            </button>
          </span>
        </div>
        <div className="stagewrap">
          <Viewport camera={camera} />
          <div className="ov tl">VIDEO ONLY · {camera.videoSource.toUpperCase()}</div>
        </div>
        <div className="transport monitor">Video-only source: picture and tally. No pan / tilt / zoom, presets or camera settings. Select it from the rack, a mapping or OSC like any camera.</div>
      </div>
    );
  }

  return (
    <div className="stage">
      <div className="top">
        <h2>{camera.name}</h2>
        <TallyBadge tally={tally} />
        <span className="mono muted" style={{ fontSize: 11 }} title={`${camera.host}:${camera.viscaPort} · ${camera.videoSource.toUpperCase()} ${camera.videoUrl}`}>
          {camera.host}:{camera.viscaPort} · {camera.videoSource.toUpperCase()} {camera.videoUrl}
          {status?.latencyMs !== undefined ? ` · ${status.latencyMs} ms` : ''}
        </span>
        <span className="topbtns">
          <button
            className={`b sm${boxable && trackBox ? ' accent' : ''}`}
            onClick={onTrackBox}
            disabled={!boxable}
            title={
              boxable
                ? "Draw the camera's AI tracking target over the picture. Reads the camera's web preview stream, which uses one of its two web preview slots."
                : camera.videoSource === 'webui'
                  ? 'The Web UI source already shows the camera page with its own tracking box'
                  : 'Needs the camera address'
            }
          >
            Tracking box
          </button>
          <button className={`b sm${panelOpen ? ' accent' : ''}`} onClick={onTogglePanel} title="Camera settings (I)">
            Camera settings
          </button>
          <button className="b sm" onClick={onEdit} title="Name, IP address, video source and stream address">
            Edit
          </button>
          <button className="b sm" onClick={onRemove}>
            Remove
          </button>
        </span>
      </div>

      <div className="stagewrap" ref={wrapRef}>
        <Viewport camera={camera} />
        {boxable && trackBox && <TrackingOverlay camera={camera} container={wrapRef} tracking={tracking} />}
        <div className={`ov tl${online ? '' : ' err'}`}>
          {online ? 'VISCA ONLINE' : status?.lastError ? `OFFLINE · ${status.lastError}${status.position ? '' : ' · is the camera on this network?'}` : 'CONNECTING…'}
        </div>
        <div className="ov bl">
          PAN {fmt(p?.panDeg)} &nbsp; TILT {fmt(p?.tiltDeg)} &nbsp; ZOOM {p ? `${p.zoomRatio.toFixed(1)}×` : '—'} &nbsp;·&nbsp; TRACK {tracking ? (live?.trackMode === 'group' ? 'group' : 'on') : 'off'}{' '}
          · REC {recording ? 'on' : 'off'} · {portrait ? 'PORTRAIT' : 'LANDSCAPE'}
          {live ? ` · ${live.focusAuto ? 'AF' : 'MF'} · ${live.exposureAuto ? 'AE' : 'ME'}` : ''}
        </div>
        {activePresetName && <div className="ov br preset">{activePresetName}</div>}
      </div>

      <div className="transport">
        <div className="jog">
          {JOG.map((j) =>
            j.dir === 'stop' ? (
              <button key="home" className="b accent" disabled={!online} onClick={() => { onManual(); fire(window.ezy.ptz.home(id)); }}>
                HOME
              </button>
            ) : (
              <button key={j.dir} className="b" disabled={!online} {...hold(() => jog(j.dir), () => jog('stop'))}>
                <Arrow d={j.d} />
                <span>{j.key}</span>
              </button>
            ),
          )}
        </div>

        <div className="sliders">
          <div className="row">
            <label>ZOOM − / =</label>
            <button className="b sm" disabled={!online} {...hold(() => zoom('wide'), () => zoom('stop'))}>
              W
            </button>
            <input type="range" min={1} max={12} step={0.1} value={zoomSlider} disabled={!online} onChange={(e) => onZoomInput(Number(e.target.value))} />
            <button className="b sm" disabled={!online} {...hold(() => zoom('tele'), () => zoom('stop'))}>
              T
            </button>
            <output>{zoomSlider.toFixed(1)}×</output>
          </div>
          <div className="row" title="Speed of the W / T buttons and the zoom keys, MIDI and OSC. The zoom slider and presets move at the camera's own speed.">
            <label>ZOOM SPD</label>
            <input type="range" min={1} max={ZOOM_SPEED_MAX} value={speed.zoom} onChange={(e) => onSpeed({ ...speed, zoom: Number(e.target.value) })} />
            <output>
              {speed.zoom} / {ZOOM_SPEED_MAX}
            </output>
          </div>
          <div className="row">
            <label>PAN SPD [ / ]</label>
            <input type="range" min={1} max={24} value={speed.pan} onChange={(e) => onSpeed({ ...speed, pan: Number(e.target.value) })} />
            <output>{speed.pan} / 24</output>
          </div>
          <div className="row">
            <label>TILT SPD</label>
            <input type="range" min={1} max={23} value={speed.tilt} onChange={(e) => onSpeed({ ...speed, tilt: Number(e.target.value) })} />
            <output>{speed.tilt} / 23</output>
          </div>
        </div>

        <div className="actions">
          <button
            className={`b${tracking ? ' down' : ''}`}
            disabled={!online}
            onClick={() => {
              onCamState({ tracking: !tracking });
              fire(window.ezy.camera.set(id, { key: 'track', value: !tracking }));
            }}
          >
            TRACK · T
          </button>
          <button
            className={`b rec${recording ? ' on' : ''}`}
            disabled={!online}
            onClick={() => {
              onCamState({ recording: !recording });
              fire(window.ezy.camera.set(id, { key: 'record', value: !recording }));
            }}
          >
            REC · R
          </button>
          <button
            className="b"
            disabled={!online}
            onClick={() => {
              onCamState({ portrait: !portrait });
              fire(window.ezy.camera.set(id, { key: 'portrait', value: !portrait }));
            }}
          >
            ROTATE · O
          </button>
          <button className="b" disabled={!online} onClick={() => fire(window.ezy.focusPush(id))}>
            AF PUSH · F
          </button>
        </div>
      </div>
    </div>
  );
}
