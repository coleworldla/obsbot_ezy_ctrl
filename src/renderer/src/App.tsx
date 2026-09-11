import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, CameraStatus, JogDir } from '../../shared/types';
import { AddCamera } from './components/AddCamera';
import { Rack } from './components/Rack';
import { Stage } from './components/Stage';

export interface Speed {
  pan: number;
  tilt: number;
}

const KEY_DIR: Record<string, JogDir> = {
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  q: 'upleft',
  e: 'upright',
  z: 'downleft',
  c: 'downright',
};

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function App() {
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [status, setStatus] = useState<Record<string, CameraStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [speed, setSpeed] = useState<Speed>({ pan: 12, tilt: 10 });
  const connectedOnce = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const list = await window.ezy.cameras.list();
    setCameras(list);
    setSelectedId((s) => (s && list.some((c) => c.id === s) ? s : (list[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    void refresh();
    void window.ezy.camera.statuses().then((all) => {
      setStatus(Object.fromEntries(all.map((s) => [s.id, s])));
    });
    return window.ezy.onStatus((s) => setStatus((m) => ({ ...m, [s.id]: s })));
  }, [refresh]);

  // Connect every configured camera once.
  useEffect(() => {
    for (const c of cameras) {
      if (connectedOnce.current.has(c.id)) continue;
      connectedOnce.current.add(c.id);
      window.ezy.camera.connect(c.id).catch(() => undefined);
    }
  }, [cameras]);

  // Keyboard: 1-9 select camera, QWEASDZC jog, H home, -/= zoom, [ ] speed.
  useEffect(() => {
    let activeDir: JogDir | null = null;
    let zooming = false;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (/^[1-9]$/.test(k)) {
        const cam = cameras[Number(k) - 1];
        if (cam) setSelectedId(cam.id);
        return;
      }
      if (k === '[') return setSpeed((s) => ({ pan: Math.max(1, s.pan - 1), tilt: Math.max(1, s.tilt - 1) }));
      if (k === ']') return setSpeed((s) => ({ pan: Math.min(24, s.pan + 1), tilt: Math.min(23, s.tilt + 1) }));
      if (!selectedId) return;
      if (KEY_DIR[k]) {
        activeDir = KEY_DIR[k];
        window.ezy.ptz.drive(selectedId, activeDir, speed.pan, speed.tilt).catch(() => undefined);
      } else if (k === 'h') {
        window.ezy.ptz.home(selectedId).catch(() => undefined);
      } else if (k === '=' || k === '+') {
        zooming = true;
        window.ezy.zoom.drive(selectedId, 'tele', 3).catch(() => undefined);
      } else if (k === '-') {
        zooming = true;
        window.ezy.zoom.drive(selectedId, 'wide', 3).catch(() => undefined);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const k = e.key.toLowerCase();
      if (KEY_DIR[k] && activeDir) {
        activeDir = null;
        window.ezy.ptz.drive(selectedId, 'stop', speed.pan, speed.tilt).catch(() => undefined);
      } else if ((k === '=' || k === '+' || k === '-') && zooming) {
        zooming = false;
        window.ezy.zoom.drive(selectedId, 'stop', 0).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [cameras, selectedId, speed]);

  const selected = cameras.find((c) => c.id === selectedId) ?? null;
  const connectedCount = Object.values(status).filter((s) => s.connected).length;

  const removeCamera = async (id: string) => {
    if (!window.confirm('Remove this camera from the rack?')) return;
    await window.ezy.cameras.remove(id);
    connectedOnce.current.delete(id);
    await refresh();
  };

  return (
    <div className="app">
      <header className="hdr">
        <span className="brand">EZY CTRL</span>
        <span className="info">
          {cameras.length} camera{cameras.length === 1 ? '' : 's'} · {connectedCount} online
        </span>
        <span className="spacer" />
        <span className="info">
          MIDI <span className="led" /> not yet
        </span>
        <span className="info">
          OSC <span className="led" /> not yet
        </span>
        <button className="hb" onClick={() => setShowAdd(true)}>
          Add camera
        </button>
      </header>

      <div className="body">
        <Rack cameras={cameras} status={status} selectedId={selectedId} onSelect={setSelectedId} onAdd={() => setShowAdd(true)} />

        {selected ? (
          <Stage
            camera={selected}
            status={status[selected.id]}
            speed={speed}
            onSpeed={setSpeed}
            onRemove={() => void removeCamera(selected.id)}
          />
        ) : (
          <div className="stage">
            <div className="viewport">
              <div className="hint">
                <strong>No cameras yet</strong>
                <span>Add a Tail 2 by its IP address to get started.</span>
                <button className="b primary" onClick={() => setShowAdd(true)}>
                  Add camera
                </button>
              </div>
            </div>
          </div>
        )}

        <aside className="presets">
          <div className="ph">
            Presets <span className="mono muted">M3</span>
          </div>
          <div className="empty">
            <span>Unlimited app-side presets land in milestone 3.</span>
            <span>They will store pan, tilt, zoom and a thumbnail and recall with an absolute move.</span>
          </div>
        </aside>
      </div>

      {showAdd && (
        <AddCamera
          onClose={() => setShowAdd(false)}
          onAdded={async (cam) => {
            setShowAdd(false);
            await refresh();
            setSelectedId(cam.id);
          }}
        />
      )}
    </div>
  );
}
