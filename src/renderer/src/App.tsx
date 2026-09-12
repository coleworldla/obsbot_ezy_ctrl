import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, CameraStatus, JogDir, LogEntry, Preset, RecallSpeed } from '../../shared/types';
import { AddCamera } from './components/AddCamera';
import { LogPanel } from './components/LogPanel';
import { Presets } from './components/Presets';
import { Rack } from './components/Rack';
import { Stage } from './components/Stage';
import { dispatchVideoEvent, dropPlayer, getPlayer } from './video/player';

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

const RECALL_KEY = 'ezy.recallSpeed';
const PRESET_TOLERANCE = { deg: 1.0, zoom: 0.15 };
const DRIFT_GRACE_MS = 5000;

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function loadRecallSpeed(): RecallSpeed {
  try {
    const v = JSON.parse(localStorage.getItem(RECALL_KEY) ?? '');
    if (v && typeof v.pan === 'number' && typeof v.tilt === 'number') return v;
  } catch {
    /* default below */
  }
  return { pan: 18, tilt: 17 };
}

export default function App() {
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [status, setStatus] = useState<Record<string, CameraStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [speed, setSpeed] = useState<Speed>({ pan: 12, tilt: 10 });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [active, setActive] = useState<Record<string, string | null>>({});
  const [recallSpeed, setRecallSpeed] = useState<RecallSpeed>(loadRecallSpeed);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const connectedOnce = useRef(new Set<string>());
  const recalledAt = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const list = await window.ezy.cameras.list();
    setCameras(list);
    setSelectedId((s) => (s && list.some((c) => c.id === s) ? s : (list[0]?.id ?? null)));
  }, []);

  const loadPresets = useCallback(async () => setPresets(await window.ezy.presets.list()), []);

  useEffect(() => {
    void refresh();
    void loadPresets();
    void window.ezy.camera.statuses().then((all) => setStatus(Object.fromEntries(all.map((s) => [s.id, s]))));
    void window.ezy.log.list().then(setLogs);
    const offStatus = window.ezy.onStatus((s) => setStatus((m) => ({ ...m, [s.id]: s })));
    const offVideo = window.ezy.video.onEvent(dispatchVideoEvent);
    const offLog = window.ezy.log.onEntry((e) => setLogs((l) => (l.length >= 2000 ? [...l.slice(-1999), e] : [...l, e])));
    return () => {
      offStatus();
      offVideo();
      offLog();
    };
  }, [refresh, loadPresets]);

  useEffect(() => {
    localStorage.setItem(RECALL_KEY, JSON.stringify(recallSpeed));
  }, [recallSpeed]);

  // Connect control and start video for every configured camera once.
  useEffect(() => {
    for (const c of cameras) {
      if (connectedOnce.current.has(c.id)) continue;
      connectedOnce.current.add(c.id);
      window.ezy.camera.connect(c.id).catch(() => undefined);
      window.ezy.video.subscribe(c.id).catch(() => undefined);
    }
  }, [cameras]);

  const selected = cameras.find((c) => c.id === selectedId) ?? null;
  const selectedOnline = selected ? (status[selected.id]?.connected ?? false) : false;
  const camPresets = selected ? presets.filter((p) => p.cameraId === selected.id) : [];
  const activePreset = selected ? (camPresets.find((p) => p.id === active[selected.id]) ?? null) : null;

  const clearActive = useCallback((cameraId: string) => {
    setActive((a) => (a[cameraId] ? { ...a, [cameraId]: null } : a));
  }, []);

  const recall = useCallback(
    (p: Preset) => {
      setActive((a) => ({ ...a, [p.cameraId]: p.id }));
      recalledAt.current[p.cameraId] = Date.now();
      window.ezy.presets.recall(p.id, recallSpeed).catch(() => undefined);
    },
    [recallSpeed],
  );

  const savePreset = useCallback(async (): Promise<Preset | null> => {
    if (!selected) return null;
    const thumbnail = getPlayer(selected.id).snapshot(240) ?? undefined;
    const n = presets.filter((p) => p.cameraId === selected.id).length + 1;
    try {
      const p = await window.ezy.presets.save(selected.id, `Preset ${n}`, thumbnail);
      await loadPresets();
      setActive((a) => ({ ...a, [selected.id]: p.id }));
      recalledAt.current[selected.id] = Date.now();
      return p;
    } catch {
      return null;
    }
  }, [selected, presets, loadPresets]);

  // Drop the "active" mark once the camera has visibly left the preset (after the move had time to finish).
  useEffect(() => {
    for (const [cameraId, presetId] of Object.entries(active)) {
      if (!presetId) continue;
      const p = presets.find((x) => x.id === presetId);
      const pos = status[cameraId]?.position;
      if (!p || !pos || Date.now() - (recalledAt.current[cameraId] ?? 0) < DRIFT_GRACE_MS) continue;
      const off =
        Math.abs(pos.panDeg - p.panDeg) > PRESET_TOLERANCE.deg ||
        Math.abs(pos.tiltDeg - p.tiltDeg) > PRESET_TOLERANCE.deg ||
        Math.abs(pos.zoomRatio - p.zoomRatio) > PRESET_TOLERANCE.zoom;
      if (off) clearActive(cameraId);
    }
  }, [status, active, presets, clearActive]);

  // Keyboard: 1-9 recall presets, Ctrl+1-9 select camera, Ctrl+S save preset,
  // QWEASDZC jog, H home, -/= zoom, [ ] jog speed, L log.
  const keyDeps = useRef({ cameras, selectedId, speed, camPresets, recall, savePreset, selectedOnline });
  keyDeps.current = { cameras, selectedId, speed, camPresets, recall, savePreset, selectedOnline };
  useEffect(() => {
    let activeDir: JogDir | null = null;
    let zooming = false;
    const down = (e: KeyboardEvent) => {
      const d = keyDeps.current;
      if (isTyping(e) || e.repeat || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey) {
        if (/^[1-9]$/.test(k)) {
          const cam = d.cameras[Number(k) - 1];
          if (cam) setSelectedId(cam.id);
          e.preventDefault();
        } else if (k === 's') {
          e.preventDefault();
          if (d.selectedOnline) void d.savePreset();
        }
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const p = d.camPresets[Number(k) - 1];
        if (p && d.selectedOnline) d.recall(p);
        return;
      }
      if (k === 'l') return setShowLog((v) => !v);
      if (k === '[') return setSpeed((s) => ({ pan: Math.max(1, s.pan - 1), tilt: Math.max(1, s.tilt - 1) }));
      if (k === ']') return setSpeed((s) => ({ pan: Math.min(24, s.pan + 1), tilt: Math.min(23, s.tilt + 1) }));
      if (!d.selectedId) return;
      const id = d.selectedId;
      if (KEY_DIR[k]) {
        activeDir = KEY_DIR[k];
        clearActive(id);
        window.ezy.ptz.drive(id, activeDir, d.speed.pan, d.speed.tilt).catch(() => undefined);
      } else if (k === 'h') {
        clearActive(id);
        window.ezy.ptz.home(id).catch(() => undefined);
      } else if (k === '=' || k === '+') {
        zooming = true;
        clearActive(id);
        window.ezy.zoom.drive(id, 'tele', 3).catch(() => undefined);
      } else if (k === '-') {
        zooming = true;
        clearActive(id);
        window.ezy.zoom.drive(id, 'wide', 3).catch(() => undefined);
      }
    };
    const up = (e: KeyboardEvent) => {
      const d = keyDeps.current;
      if (!d.selectedId) return;
      const k = e.key.toLowerCase();
      if (KEY_DIR[k] && activeDir) {
        activeDir = null;
        window.ezy.ptz.drive(d.selectedId, 'stop', d.speed.pan, d.speed.tilt).catch(() => undefined);
      } else if ((k === '=' || k === '+' || k === '-') && zooming) {
        zooming = false;
        window.ezy.zoom.drive(d.selectedId, 'stop', 0).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [clearActive]);

  // Scripted interactions for screenshot-based checks (EZY_AUTOTEST=presets,log).
  useEffect(() => {
    const steps = window.ezy.env.autotest.split(',').filter(Boolean);
    if (steps.length === 0) return;
    const timers: number[] = [];
    if (steps.includes('presets')) {
      timers.push(window.setTimeout(() => void keyDeps.current.savePreset(), 6000));
      timers.push(
        window.setTimeout(() => {
          const first = keyDeps.current.camPresets[0];
          if (first) keyDeps.current.recall(first);
        }, 8500),
      );
    }
    if (steps.includes('log')) timers.push(window.setTimeout(() => setShowLog(true), 3000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const removeCamera = async (id: string) => {
    if (!window.confirm('Remove this camera from the rack? Its presets go with it.')) return;
    await window.ezy.cameras.remove(id);
    connectedOnce.current.delete(id);
    dropPlayer(id);
    await refresh();
    await loadPresets();
  };

  const connectedCount = cameras.filter((c) => status[c.id]?.connected).length;
  const errorCount = logs.filter((e) => e.level === 'error').length;
  const warnCount = logs.filter((e) => e.level === 'warn').length;
  const cameraNames = Object.fromEntries(cameras.map((c) => [c.id, c.name]));

  return (
    <div className="app">
      <header className="hdr">
        <span className="brand">EZY CTRL</span>
        <span className="info">
          {cameras.length} camera{cameras.length === 1 ? '' : 's'} · {connectedCount} online · {presets.length} presets
        </span>
        <span className="spacer" />
        <span className="info">
          MIDI <span className="led" /> not yet
        </span>
        <span className="info">
          OSC <span className="led" /> not yet
        </span>
        <button className={`hb${errorCount ? ' has-err' : warnCount ? ' has-warn' : ''}`} onClick={() => setShowLog((v) => !v)} title="Log (L)">
          Log
          {errorCount > 0 && <span className="badge err">{errorCount}</span>}
          {errorCount === 0 && warnCount > 0 && <span className="badge warn">{warnCount}</span>}
        </button>
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
            activePresetName={activePreset ? `P${camPresets.indexOf(activePreset) + 1} · ${activePreset.name}` : undefined}
            onManual={() => clearActive(selected.id)}
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

        <Presets
          camera={selected}
          online={selectedOnline}
          presets={camPresets}
          activeId={activePreset?.id ?? null}
          recallSpeed={recallSpeed}
          onRecallSpeed={setRecallSpeed}
          onSave={savePreset}
          onRecall={recall}
          onChanged={loadPresets}
          onSnapshot={() => (selected ? (getPlayer(selected.id).snapshot(240) ?? undefined) : undefined)}
        />
      </div>

      {showLog && (
        <LogPanel
          entries={logs}
          cameraNames={cameraNames}
          onClear={() => {
            setLogs([]);
            void window.ezy.log.clear();
          }}
          onClose={() => setShowLog(false)}
        />
      )}

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
