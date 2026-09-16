import { useEffect, useRef, useState } from 'react';
import type { CameraConfig } from '../../../shared/types';
import { getPlayer, registerExternalVideo, type PlayerStats } from '../video/player';
import { openWebcam } from '../video/webcam';

interface Props {
  camera: CameraConfig;
  /** Compact rack thumbnail: fewer overlays. */
  mini?: boolean;
}

const STREAMABLE = new Set(['rtsp', 'srt', 'demo']);

/** getUserMedia-backed picture for the Webcam source. */
function WebcamView({ camera, mini }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    openWebcam(camera.videoUrl)
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        el.srcObject = s;
        void el.play().catch(() => undefined);
        if (!mini) registerExternalVideo(camera.id, el);
        const track = s.getVideoTracks()[0];
        const st = track?.getSettings();
        if (st?.width && st.height) setSize(`${st.width}×${st.height}${st.frameRate ? ` · ${Math.round(st.frameRate)} fps` : ''}`);
      })
      .catch((e: unknown) => {
        const name = (e as DOMException)?.name ?? '';
        setError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'device not found — pick it again under Edit' : name === 'NotReadableError' ? 'device busy (in use by another app)' : name === 'NotAllowedError' ? 'camera access denied' : (e instanceof Error ? e.message : String(e)));
        void window.ezy?.log.report('warn', `webcam source for ${camera.name}: ${String((e as Error)?.message ?? e)}`);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
      if (!mini) registerExternalVideo(camera.id, null);
    };
  }, [camera.id, camera.videoUrl, camera.name, mini]);

  return (
    <div className={mini ? 'mini live' : 'viewport'}>
      <video ref={ref} muted autoPlay playsInline />
      {error && <div className={`ov ${mini ? 'mini-lbl' : 'center'} err`}>{mini ? 'WEBCAM ERROR' : `WEBCAM · ${error}`}</div>}
      {!mini && !error && size && <div className="ov tr">WEBCAM · {size}</div>}
    </div>
  );
}

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

  if (camera.videoSource === 'webcam') return <WebcamView camera={camera} mini={mini} />;

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
          <strong>No {camera.videoSource.toUpperCase()} preview in the app yet</strong>
          {!mini && <span>Control still works. For a picture here, Edit this camera and pick Webcam (NDI Tools → Webcam Input), Web UI, RTSP or SRT.</span>}
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
