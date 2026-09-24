import { useEffect, useReducer, useState, type RefObject } from 'react';
import type { CameraConfig } from '../../../shared/types';
import { subscribeTracking, type TrackFeedState } from '../video/tracking';

interface Props {
  camera: CameraConfig;
  /** The element the overlay is positioned in; the picture (video or canvas) is somewhere inside it. */
  container: RefObject<HTMLElement>;
  /** Tracking switched on, as the camera reports it. */
  tracking: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the picture really is inside the container: the video / canvas is letterboxed with object-fit: contain. */
function pictureRect(container: HTMLElement): Rect | null {
  const el = container.querySelector<HTMLVideoElement | HTMLCanvasElement>('.viewport video, .viewport canvas');
  if (!el) return null;
  const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.width;
  const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.height;
  const r = el.getBoundingClientRect();
  if (!iw || !ih || !r.width || !r.height) return null;
  const scale = Math.min(r.width / iw, r.height / ih);
  const w = iw * scale;
  const h = ih * scale;
  const c = container.getBoundingClientRect();
  return { x: r.left - c.left + (r.width - w) / 2, y: r.top - c.top + (r.height - h) / 2, w, h };
}

/** The camera's AI tracking target drawn over the picture, like the tracking box on the Tail 2's web page. */
export function TrackingOverlay({ camera, container, tracking }: Props) {
  const [feed, setFeed] = useState<TrackFeedState | null>(null);
  const [, relayout] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeTracking(camera.id, camera.host, camera.name, setFeed), [camera.id, camera.host, camera.name]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [container]);

  const reading = feed?.reading ?? null;
  const rect = reading?.kind === 'target' && container.current ? pictureRect(container.current) : null;

  let label: string | null = null;
  let warn = false;
  if (!feed || feed.status === 'connecting') label = 'AI BOX · connecting to the camera preview…';
  else if (feed.status === 'retrying') {
    label = `AI BOX · ${feed.error ?? 'no preview'} · retrying`;
    warn = true;
  } else if (reading?.kind === 'lost') {
    label = 'TARGET LOST';
    warn = true;
  } else if (reading?.kind === 'none' && tracking) label = 'AI BOX · no target selected';

  return (
    <>
      {rect && reading?.kind === 'target' && (
        <div
          className="trackbox"
          style={{
            left: rect.x + reading.box.xmin * rect.w,
            top: rect.y + reading.box.ymin * rect.h,
            width: (reading.box.xmax - reading.box.xmin) * rect.w,
            height: (reading.box.ymax - reading.box.ymin) * rect.h,
          }}
        >
          <span className="tbc tl" />
          <span className="tbc tr" />
          <span className="tbc bl" />
          <span className="tbc br" />
        </div>
      )}
      {label && <div className={`ov tc${warn ? ' err' : ''}`}>{label}</div>}
    </>
  );
}
