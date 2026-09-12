import { useEffect, useRef, useState } from 'react';
import type { CameraConfig, CameraStatus, JogDir, ZoomDir } from '../../../shared/types';
import type { Speed } from '../App';
import { Viewport } from './Viewport';

interface Props {
  camera: CameraConfig;
  status?: CameraStatus;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  onRemove: () => void;
  /** "P4 · Podium" while the camera sits on a recalled preset. */
  activePresetName?: string;
  /** Called on any manual move so the active-preset mark is dropped. */
  onManual: () => void;
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

export function Stage({ camera, status, speed, onSpeed, onRemove, activePresetName, onManual }: Props) {
  const id = camera.id;
  const [tracking, setTracking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [zoomSlider, setZoomSlider] = useState(1);
  const zoomTimer = useRef<number | null>(null);
  const draggingZoom = useRef(false);

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
    return fire(window.ezy.zoom.drive(id, dir, 3));
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

  return (
    <div className="stage">
      <div className="top">
        <h2>{camera.name}</h2>
        <span className="mono muted" style={{ fontSize: 11 }}>
          {camera.host}:{camera.viscaPort} · {camera.videoSource.toUpperCase()} {camera.videoUrl}
          {status?.latencyMs !== undefined ? ` · ${status.latencyMs} ms` : ''}
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="b sm" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="stagewrap">
        <Viewport camera={camera} />
        <div className={`ov tl${online ? '' : ' err'}`}>
          {online ? 'VISCA ONLINE' : status?.lastError ? `OFFLINE · ${status.lastError}` : 'CONNECTING…'}
        </div>
        <div className="ov bl">
          PAN {fmt(p?.panDeg)} &nbsp; TILT {fmt(p?.tiltDeg)} &nbsp; ZOOM {p ? `${p.zoomRatio.toFixed(1)}×` : '—'} &nbsp;·&nbsp; TRACK {tracking ? 'on' : 'off'} · REC{' '}
          {recording ? 'on' : 'off'} · {portrait ? 'PORTRAIT' : 'LANDSCAPE'}
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
            <label>ZOOM &nbsp;−&nbsp;/&nbsp;=</label>
            <button className="b sm" disabled={!online} {...hold(() => zoom('wide'), () => zoom('stop'))}>
              W
            </button>
            <input type="range" min={1} max={12} step={0.1} value={zoomSlider} disabled={!online} onChange={(e) => onZoomInput(Number(e.target.value))} />
            <button className="b sm" disabled={!online} {...hold(() => zoom('tele'), () => zoom('stop'))}>
              T
            </button>
            <output>{zoomSlider.toFixed(1)}×</output>
          </div>
          <div className="row">
            <label>PAN SPEED &nbsp;[&nbsp;/&nbsp;]</label>
            <input type="range" min={1} max={24} value={speed.pan} onChange={(e) => onSpeed({ ...speed, pan: Number(e.target.value) })} />
            <output>{speed.pan} / 24</output>
          </div>
          <div className="row">
            <label>TILT SPEED</label>
            <input type="range" min={1} max={23} value={speed.tilt} onChange={(e) => onSpeed({ ...speed, tilt: Number(e.target.value) })} />
            <output>{speed.tilt} / 23</output>
          </div>
        </div>

        <div className="actions">
          <button
            className={`b${tracking ? ' down' : ''}`}
            disabled={!online}
            onClick={() => {
              const next = !tracking;
              setTracking(next);
              fire(window.ezy.track(id, next));
            }}
          >
            TRACK · T
          </button>
          <button
            className={`b rec${recording ? ' on' : ''}`}
            disabled={!online}
            onClick={() => {
              const next = !recording;
              setRecording(next);
              fire(window.ezy.record(id, next));
            }}
          >
            REC · R
          </button>
          <button
            className="b"
            disabled={!online}
            onClick={() => {
              const next = !portrait;
              setPortrait(next);
              fire(window.ezy.orientation(id, next));
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
