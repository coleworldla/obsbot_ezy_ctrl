import { useEffect, useRef, useState } from 'react';
import type { CameraConfig, Preset, RecallSpeed } from '../../../shared/types';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface Props {
  camera: CameraConfig | null;
  online: boolean;
  /** Video-only source: presets do not apply. */
  monitor?: boolean;
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

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function Presets({ camera, online, monitor = false, presets, activeId, recallSpeed, onRecallSpeed, onSave, onRecall, onChanged, onSnapshot }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; preset: Preset } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Multi-select: Select button, Ctrl/Cmd-click or Shift-click enters it; Delete removes the lot in one go.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  // Switching camera leaves select mode; presets that vanished drop out of the selection.
  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
    anchor.current = null;
  }, [camera?.id]);
  useEffect(() => {
    setSelected((s) => {
      if (s.size === 0) return s;
      const alive = new Set(presets.map((p) => p.id));
      const next = new Set([...s].filter((id) => alive.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [presets]);

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

  // ---- selection ----
  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    anchor.current = id;
    if (!selecting) setSelecting(true);
  };

  const selectRange = (toId: string) => {
    const ids = presets.map((p) => p.id);
    const a = anchor.current ? ids.indexOf(anchor.current) : -1;
    const b = ids.indexOf(toId);
    if (a < 0 || b < 0) return toggle(toId);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    setSelected((s) => {
      const n = new Set(s);
      for (let i = lo; i <= hi; i++) n.add(ids[i]);
      return n;
    });
    if (!selecting) setSelecting(true);
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    anchor.current = null;
  };

  const deleteMany = async (ids: string[]) => {
    if (!ids.length) return;
    const all = ids.length === presets.length && presets.length > 1;
    const msg = ids.length === 1 ? `Delete preset "${presets.find((p) => p.id === ids[0])?.name ?? ''}"?` : `Delete ${ids.length} presets${all ? ' (all of them)' : ''}?`;
    if (!window.confirm(msg)) return;
    await window.ezy.presets.removeMany(ids);
    exitSelect();
    await onChanged();
  };

  const deleteSelected = () => deleteMany(presets.filter((p) => selected.has(p.id)).map((p) => p.id));

  // Delete / Backspace removes the selection, Escape leaves select mode (never while typing in a field).
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitSelect();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        e.preventDefault();
        e.stopPropagation();
        void deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        setSelected(new Set(presets.map((p) => p.id)));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const rowClick = (e: React.MouseEvent, p: Preset) => {
    if (editingId === p.id) return;
    if (e.shiftKey && (selecting || anchor.current)) return selectRange(p.id);
    if (e.ctrlKey || e.metaKey || e.shiftKey || selecting) return toggle(p.id);
    if (online) onRecall(p);
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
    { label: selected.has(p.id) ? 'Deselect' : 'Select', onClick: () => toggle(p.id) },
    selected.size > 1 && selected.has(p.id)
      ? { label: `Delete ${selected.size} selected`, danger: true, onClick: () => void deleteSelected() }
      : { label: 'Delete', danger: true, onClick: () => void deleteMany([p.id]) },
  ];

  const speedValue = recallSpeed.pan;

  return (
    <aside className="presets">
      <div className="ph">
        {selecting ? (
          <>
            <span>
              {selected.size} of {presets.length} selected
            </span>
            <span className="spacer" />
            <button className="b sm" disabled={selected.size === presets.length} onClick={() => setSelected(new Set(presets.map((p) => p.id)))} title="Select every preset (Ctrl+A)">
              All
            </button>
            <button className="b sm danger" disabled={selected.size === 0} onClick={() => void deleteSelected()} title="Delete the selected presets (Delete)">
              Delete{selected.size ? ` ${selected.size}` : ''}
            </button>
            <button className="b sm" onClick={exitSelect} title="Leave select mode (Esc)">
              Done
            </button>
          </>
        ) : (
          <>
            <span>Presets{camera ? ` · ${camera.name}` : ''}</span>
            <span className="mono muted">{presets.length} · no limit</span>
            <span className="spacer" />
            <button className="b sm" disabled={presets.length === 0} onClick={() => setSelecting(true)} title="Pick several presets to delete (or Ctrl-click a preset)">
              Select
            </button>
            <button className="b sm accent" disabled={!camera || !online || monitor || busy} onClick={() => void save()} title="Save the current position (Ctrl+S)">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Save
            </button>
          </>
        )}
      </div>

      <div className="plist" ref={listRef}>
        {presets.length === 0 && (
          <div className="empty">
            <span>{monitor ? 'Video-only source.' : 'No presets for this camera yet.'}</span>
            <span>{monitor ? 'Presets need a camera the app can move.' : online ? 'Frame the shot, then press Save (or Ctrl+S).' : 'Presets need the camera online to read its position.'}</span>
          </div>
        )}
        {presets.map((p, i) => {
          const sel = selected.has(p.id);
          return (
            <div
              key={p.id}
              className={`prow${p.id === activeId ? ' active' : ''}${sel ? ' sel' : ''}${p.id === overId && dragId !== p.id ? ' over' : ''}`}
              draggable={editingId !== p.id && !selecting}
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
              onClick={(e) => rowClick(e, p)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, preset: p });
              }}
              title={selecting ? (sel ? 'Click to deselect' : 'Click to select') : online ? 'Click to recall · Ctrl-click to select' : 'Camera offline'}
            >
              {selecting && <span className={`pcheck${sel ? ' on' : ''}`} aria-hidden />}
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
                  <div
                    className="pname"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!selecting) startEdit(p);
                    }}
                  >
                    {p.name}
                  </div>
                )}
                <div className="pmeta mono">
                  {deg(p.panDeg)} {deg(p.tiltDeg)} {p.zoomRatio.toFixed(1)}×{p.cameraSlot !== undefined ? ` · slot ${p.cameraSlot}` : ''}
                </div>
              </div>
              {i < 9 && !selecting && <span className="kbd">{i + 1}</span>}
              <button
                className="pmore"
                title="More"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenu({ x: r.left - 180, y: r.bottom + 4, preset: p });
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </div>
          );
        })}
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
          <span className="mono muted" style={{ flex: 1 }}>
            {selecting ? 'click select · shift range · Del delete · Esc done' : 'click recall · drag reorder · dbl-click rename · ctrl-click select'}
          </span>
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
