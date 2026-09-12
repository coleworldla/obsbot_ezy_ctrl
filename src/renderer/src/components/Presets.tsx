import { useEffect, useRef, useState } from 'react';
import type { CameraConfig, Preset, RecallSpeed } from '../../../shared/types';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface Props {
  camera: CameraConfig | null;
  online: boolean;
  presets: Preset[];
  activeId: string | null;
  recallSpeed: RecallSpeed;
  onRecallSpeed: (s: RecallSpeed) => void;
  onSave: () => Promise<Preset | null>;
  onRecall: (p: Preset) => void;
  onChanged: () => Promise<void>;
  onSnapshot: () => string | undefined;
}

const deg = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

export function Presets({ camera, online, presets, activeId, recallSpeed, onRecallSpeed, onSave, onRecall, onChanged, onSnapshot }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; preset: Preset } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  const startEdit = (p: Preset) => {
    setDraft(p.name);
    setEditingId(p.id);
  };

  const commitEdit = async () => {
    const id = editingId;
    if (!id) return;
    setEditingId(null);
    const name = draft.trim();
    const current = presets.find((p) => p.id === id);
    if (!name || !current || current.name === name) return;
    await window.ezy.presets.update(id, { name });
    await onChanged();
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const p = await onSave();
      if (p) {
        startEdit(p);
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
      }
    } finally {
      setBusy(false);
    }
  };

  const drop = async (targetId: string) => {
    if (!camera || !dragId || dragId === targetId) return;
    const ids = presets.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    await window.ezy.presets.reorder(camera.id, ids);
    await onChanged();
  };

  const menuItems = (p: Preset): MenuItem[] => [
    { label: 'Rename', onClick: () => startEdit(p) },
    {
      label: 'Update to current position',
      disabled: !online,
      onClick: () => void window.ezy.presets.updatePosition(p.id).then(onChanged),
    },
    {
      label: 'Update thumbnail',
      onClick: () => {
        const thumbnail = onSnapshot();
        if (thumbnail) void window.ezy.presets.update(p.id, { thumbnail }).then(onChanged);
      },
    },
    {
      label: p.cameraSlot !== undefined ? `Store in camera slot… (now ${p.cameraSlot})` : 'Store in camera slot…',
      disabled: !online,
      onClick: () => {
        const v = window.prompt('Camera preset slot (0-255). Other controllers can recall it by this number.', String(p.cameraSlot ?? presets.indexOf(p) + 1));
        if (v === null) return;
        const slot = Number(v);
        if (!Number.isInteger(slot) || slot < 0 || slot > 255) return;
        void window.ezy.presets.mirror(p.id, slot).then(onChanged);
      },
    },
    {
      label: 'Delete',
      danger: true,
      onClick: () => {
        if (window.confirm(`Delete preset "${p.name}"?`)) void window.ezy.presets.remove(p.id).then(onChanged);
      },
    },
  ];

  const speedValue = recallSpeed.pan;

  return (
    <aside className="presets">
      <div className="ph">
        <span>Presets{camera ? ` · ${camera.name}` : ''}</span>
        <span className="mono muted">{presets.length} · no limit</span>
        <span className="spacer" />
        <button className="b sm accent" disabled={!camera || !online || busy} onClick={() => void save()} title="Save the current position (Ctrl+S)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Save
        </button>
      </div>

      <div className="plist" ref={listRef}>
        {presets.length === 0 && (
          <div className="empty">
            <span>No presets for this camera yet.</span>
            <span>{online ? 'Frame the shot, then press Save (or Ctrl+S).' : 'Presets need the camera online to read its position.'}</span>
          </div>
        )}
        {presets.map((p, i) => (
          <div
            key={p.id}
            className={`prow${p.id === activeId ? ' active' : ''}${p.id === overId && dragId !== p.id ? ' over' : ''}`}
            draggable={editingId !== p.id}
            onDragStart={(e) => {
              setDragId(p.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== p.id) setOverId(p.id);
            }}
            onDragLeave={() => overId === p.id && setOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOverId(null);
              void drop(p.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onClick={() => editingId !== p.id && online && onRecall(p)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, preset: p });
            }}
            title={online ? 'Click to recall' : 'Camera offline'}
          >
            <div className="pthumb">{p.thumbnail ? <img src={p.thumbnail} alt="" draggable={false} /> : <span className="mono">no image</span>}</div>
            <div className="pmain">
              {editingId === p.id ? (
                <input
                  ref={editRef}
                  className="pedit"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="pname" onDoubleClick={(e) => { e.stopPropagation(); startEdit(p); }}>
                  {p.name}
                </div>
              )}
              <div className="pmeta mono">
                {deg(p.panDeg)} {deg(p.tiltDeg)} {p.zoomRatio.toFixed(1)}×{p.cameraSlot !== undefined ? ` · slot ${p.cameraSlot}` : ''}
              </div>
            </div>
            {i < 9 && <span className="kbd">{i + 1}</span>}
            <button
              className="pmore"
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ x: r.left - 180, y: r.bottom + 4, preset: p });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
          </div>
        ))}
      </div>

      <div className="pfoot">
        <div className="row">
          <label className="mono">RECALL SPEED</label>
          <input
            type="range"
            min={1}
            max={24}
            value={speedValue}
            onChange={(e) => {
              const pan = Number(e.target.value);
              onRecallSpeed({ pan, tilt: Math.max(1, Math.round((pan * 23) / 24)) });
            }}
          />
          <output className="mono">{speedValue} / 24</output>
        </div>
        <div className="row">
          <span className="mono muted" style={{ flex: 1 }}>click recall · drag reorder · dbl-click rename</span>
          <button className="b sm" disabled={!camera} onClick={() => camera && void window.ezy.presets.import(camera.id).then(onChanged)}>
            Import
          </button>
          <button className="b sm" disabled={!camera || presets.length === 0} onClick={() => camera && void window.ezy.presets.export(camera.id)}>
            Export
          </button>
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.preset)} onClose={() => setMenu(null)} />}
    </aside>
  );
}
