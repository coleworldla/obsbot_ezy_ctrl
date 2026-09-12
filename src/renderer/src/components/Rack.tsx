import type { CameraConfig, CameraStatus } from '../../../shared/types';
import { Viewport } from './Viewport';

interface Props {
  cameras: CameraConfig[];
  status: Record<string, CameraStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

const fmt = (n: number | undefined, suffix = '') => (n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}${suffix}`);

export function Rack({ cameras, status, selectedId, onSelect, onAdd }: Props) {
  return (
    <div className="rack">
      {cameras.map((c, i) => {
        const s = status[c.id];
        const p = s?.position;
        const selected = c.id === selectedId;
        return (
          <div key={c.id} className={`cam${selected ? ' on' : ''}`} onClick={() => onSelect(c.id)} role="button" tabIndex={0}>
            <div className="title">
              <span className="idx">CAM {i + 1}</span>
              <span className="name">{c.name}</span>
              <span className="host">{c.host}</span>
            </div>
            {selected ? (
              <div className="mini">
                <span className={`led${s?.connected ? ' on' : s?.lastError ? ' warn' : ''}`} />
                ON STAGE
              </div>
            ) : (
              <Viewport camera={c} mini />
            )}
            <div className="readout">
              <span>P {fmt(p?.panDeg)}</span>
              <span>T {fmt(p?.tiltDeg)}</span>
              <span>Z {p ? `${p.zoomRatio.toFixed(1)}×` : '—'}</span>
              <span className={s?.connected ? 'ok' : 'muted'}>{s?.connected ? 'VISCA' : s?.lastError ? 'no reply' : '…'}</span>
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
    </div>
  );
}
