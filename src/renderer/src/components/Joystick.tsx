/**
 * Pan / tilt joystick under the picture. Drag the knob: direction is where you push, speed how far (a full push is
 * the PAN / TILT SPD sliders); letting go stops. It also shows jogs from the keys, MIDI and OSC (via jogBus).
 */
import { useEffect, useRef, useState } from 'react';
import { driveToStick, stickFromOffset, stickToDrive, type Drive, type StickPos } from '../../../shared/joystick';
import type { JogDir } from '../../../shared/types';
import type { Speed } from '../control/executor';
import { jogBus } from '../control/jog';

interface Props {
  cameraId: string;
  online: boolean;
  speed: Speed;
  /** The camera left its preset (clears the active-preset highlight). */
  onManual: () => void;
}

/** Knob travel from the centre, in px (ring 76 px, knob 28 px). */
const TRAVEL = 24;
/** Drag moves reach the camera at most this often; stop always goes at once. */
const SEND_MS = 60;
/** The keys around the ring, placed on an ellipse that clears it. */
const KEYS: { dir: JogDir; key: string; x: number; y: number }[] = [
  { dir: 'up', key: 'W', x: 0, y: -1 },
  { dir: 'upright', key: 'E', x: 0.72, y: -0.72 },
  { dir: 'right', key: 'D', x: 1, y: 0 },
  { dir: 'downright', key: 'C', x: 0.72, y: 0.72 },
  { dir: 'down', key: 'S', x: 0, y: 1 },
  { dir: 'downleft', key: 'Z', x: -0.72, y: 0.72 },
  { dir: 'left', key: 'A', x: -1, y: 0 },
  { dir: 'upleft', key: 'Q', x: -0.72, y: -0.72 },
];
const KEY_RX = 58;
const KEY_RY = 48;

const same = (a: Drive | null, b: Drive) => !!a && a.dir === b.dir && a.pan === b.pan && a.tilt === b.tilt;

export function Joystick({ cameraId, online, speed, onManual }: Props) {
  const [pos, setPos] = useState<StickPos>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  // Starts as "stopped", so grabbing the knob in the middle sends nothing.
  const sent = useRef<{ drive: Drive | null; at: number; timer: number | null }>({ drive: { dir: 'stop', pan: 1, tilt: 1 }, at: 0, timer: null });

  // Show jogs from the keys, MIDI and OSC; a drag in progress shows the pointer instead.
  useEffect(() => {
    setPos({ x: 0, y: 0 });
    return jogBus.onDrive((id, d) => {
      if (id === cameraId && !dragRef.current) setPos(driveToStick(d.dir, d.pan, d.tilt, speedRef.current));
    });
  }, [cameraId]);

  const send = (d: Drive) => {
    const s = sent.current;
    if (s.timer !== null) window.clearTimeout(s.timer);
    s.timer = null;
    if (same(s.drive, d)) return;
    const go = () => {
      s.drive = d;
      s.at = Date.now();
      s.timer = null;
      if (d.dir !== 'stop') onManual();
      void jogBus.drive(cameraId, d.dir, d.pan, d.tilt).catch(() => undefined);
    };
    const wait = SEND_MS - (Date.now() - s.at);
    if (d.dir === 'stop' || wait <= 0) go();
    else s.timer = window.setTimeout(go, wait);
  };

  const moveTo = (e: React.PointerEvent) => {
    const r = ringRef.current!.getBoundingClientRect();
    const p = stickFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), TRAVEL);
    setPos(p);
    send(stickToDrive(p.x, p.y, speedRef.current));
  };

  const release = () => {
    if (!dragRef.current) return;
    dragRef.current = false;
    setDragging(false);
    setPos({ x: 0, y: 0 });
    send({ dir: 'stop', pan: 1, tilt: 1 });
  };

  const active = stickToDrive(pos.x, pos.y, speed).dir;

  return (
    <div className={`joy${online ? '' : ' off'}`}>
      {KEYS.map((k) => (
        <span key={k.key} className={`joykey${active === k.dir ? ' hot' : ''}`} style={{ left: `calc(50% + ${k.x * KEY_RX}px)`, top: `calc(50% + ${k.y * KEY_RY}px)` }}>
          {k.key}
        </span>
      ))}
      <div
        ref={ringRef}
        className={`joyring${dragging ? ' grab' : ''}`}
        title="Drag to pan and tilt: further is faster, up to PAN / TILT SPD. Let go to stop."
        onPointerDown={(e) => {
          if (!online || e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // keeps the knob while the pointer leaves the ring
          } catch {
            /* a pointer that cannot be captured still drags inside the ring */
          }
          dragRef.current = true;
          setDragging(true);
          moveTo(e);
        }}
        onPointerMove={(e) => dragRef.current && moveTo(e)}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div className="joyknob" style={{ transform: `translate(${pos.x * TRAVEL}px, ${-pos.y * TRAVEL}px)` }} />
      </div>
    </div>
  );
}
