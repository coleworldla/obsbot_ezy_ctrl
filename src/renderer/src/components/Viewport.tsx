import { useEffect, useRef, useState } from 'react';
import type { CameraConfig } from '../../../shared/types';
import { getPlayer, type PlayerStats } from '../video/player';

interface Props {
  camera: CameraConfig;
  /** Compact rack thumbnail: fewer overlays. */
  mini?: boolean;
}

const STREAMABLE = new Set(['rtsp', 'srt', 'demo']);

/** Hosts the camera's live <video> (re-parented from a shared player) plus stream overlays. */
export function Viewport({ camera, mini = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const streamable = STREAMABLE.has(camera.videoSource);

  useEffect(() => {
    if (!streamable) return;
    const player = getPlayer(camera.id);
    const host = box.current!;
    host.appendChild(player.el);
    void player.el.play().catch(() => undefined);
    const off = player.onStats(setStats);
    return () => {
      off();
      if (player.el.parentElement === host) host.removeChild(player.el);
    };
  }, [camera.id, streamable]);

  if (camera.videoSource === 'webui') {
    return (
      <div className={mini ? 'mini' : 'viewport'}>
        {mini ? (
          <span>Web UI</span>
        ) : (
          <webview src={camera.videoUrl || `http://${camera.host}/`} style={{ width: '100%', height: '100%' }} />
        )}
      </div>
    );
  }

  if (!streamable) {
    return (
      <div className={mini ? 'mini' : 'viewport'}>
        <div className="hint">
          <strong>{camera.videoSource.toUpperCase()} preview not supported yet</strong>
          {!mini && <span>Switch the camera to RTSP mode and edit its video source.</span>}
        </div>
      </div>
    );
  }

  const s = stats;
  const label =
    !s || s.state === 'idle' || s.state === 'connecting'
      ? 'CONNECTING…'
      : s.state === 'reconnecting'
        ? `RECONNECTING · ${s.reason ?? ''}`
        : s.state === 'error'
          ? `VIDEO ERROR · ${s.reason ?? ''}`
          : null;

  return (
    <div className={mini ? 'mini live' : 'viewport'} ref={box}>
      {label && <div className={`ov ${mini ? 'mini-lbl' : 'center'}${s?.state === 'error' ? ' err' : ''}`}>{label}</div>}
      {!mini && s?.state === 'playing' && (
        <div className="ov tr">
          {camera.videoSource.toUpperCase()} · {s.width}×{s.height} · {s.fps} fps · buffer {s.bufferSec.toFixed(2)} s
          {s.dropped ? ` · dropped ${s.dropped}` : ''}
        </div>
      )}
    </div>
  );
}
