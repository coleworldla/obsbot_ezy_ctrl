import { useState } from 'react';
import type { CameraConfig, CameraStatus, Tally } from '../../../shared/types';
import { ContextMenu } from './ContextMenu';
import { Viewport } from './Viewport';

interface Props {
  cameras: CameraConfig[];
  status: Record<string, CameraStatus>;
  selectedId: string | null;
  tally: Record<string, Tally>;
  onSelect: (id: string) => void;
  onTally: (id: string, t: Tally) => void;
  onAdd: () => void;
}

const fmt = (n: number | undefined, suffix = '') => (n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}${suffix}`);

export function TallyBadge({ tally, mini = false }: { tally: Tally | undefined; mini?: boolean }) {
  if (!tally) return null;
  return <span className={`tally ${tally === 1 ? 'pgm' : 'pvw'}${mini ? ' overlay' : ''}`}>{tally === 1 ? 'PGM' : 'PVW'}</span>;
}

export function Rack({ cameras, status, selectedId, tally, onSelect, onTally, onAdd }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; cam: CameraConfig } | null>(null);

  return (
    <div className="rack">
      {cameras.map((c, i) => {
        const s = status[c.id];
        const p = s?.position;
        const selected = c.id === selectedId;
        const t = tally[c.id] ?? 0;
        return (
          <div
            key={c.id}
            className={`cam${selected ? ' on' : ''}${t === 1 ? ' pgm' : t === 2 ? ' pvw' : ''}`}
            onClick={() => onSelect(c.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, cam: c });
            }}
            role="button"
            tabIndex={0}
          >
            <div className="title">
              <span className="idx">CAM {i + 1}</span>
              <span className="name">{c.name}</span>
              <span className="host">{c.host}</span>
            </div>
            <div className="miniwrap">
              {selected ? (
                <div className="mini">
                  <span className={`led${s?.connected ? ' on' : s?.lastError ? ' warn' : ''}`} />
                  ON STAGE
                </div>
              ) : (
                <Viewport camera={c} mini />
              )}
              <TallyBadge tally={t} mini />
            </div>
            <div className="readout">
              <span>P {fmt(p?.panDeg)}</span>
              <span>T {fmt(p?.tiltDeg)}</span>
              <span>Z {p ? `${p.zoomRatio.toFixed(1)}×` : '—'}</span>
              <span className={s?.connected ? 'ok' : 'muted'}>{s?.connected ? (s.state?.track ? 'TRK' : 'VISCA') : s?.lastError ? 'no reply' : '…'}</span>
            </div>
          </div>
        );
      })}
      <button className="b add" onClick={onAdd}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        Add camera
      </button>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Put on stage', onClick: () => onSelect(menu.cam.id) },
            { label: 'Tally: program (PGM)', onClick: () => onTally(menu.cam.id, 1) },
            { label: 'Tally: preview (PVW)', onClick: () => onTally(menu.cam.id, 2) },
            { label: 'Tally: clear', onClick: () => onTally(menu.cam.id, 0), disabled: !tally[menu.cam.id] },
          ]}
        />
      )}
    </div>
  );
}
