import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keyInputFrom, matchMappings, parseBuiltinOsc, ZOOM_SPEED_MAX, type Input, type Invocation, type Mapping } from '../../shared/mapping';
import type { AppInfo, CameraConfig, CameraStatus, LogEntry, OscStatus, Preset, RecallSpeed, Settings, ShowStatus, Tally, UpdateStatus } from '../../shared/types';
import { isMonitor } from '../../shared/types';
import type { ShowOperator } from '../../shared/show';
import { CameraDialog } from './components/CameraDialog';
import { OscMapPanel } from './components/OscMapPanel';
import { oscCameraKey, oscSlug } from '../../shared/mapping';
import { CameraPanel } from './components/CameraPanel';
import { Help } from './components/Help';
import { LogPanel } from './components/LogPanel';
import { MappingPanel, mappingId, type LearnState, type MonitorEntry } from './components/MappingPanel';
import { Presets } from './components/Presets';
import { Rack } from './components/Rack';
import { ShowMenu } from './components/ShowMenu';
import { Stage } from './components/Stage';
import { ActionExecutor, type CamState, type ExecContext, type Speed } from './control/executor';
import { MidiManager, type MidiDeviceInfo } from './control/midi';
import { dispatchNdiFrame, dispatchNdiState } from './video/ndi';
import { dispatchVideoEvent, dropPlayer, snapshotFor } from './video/player';

export type { Speed } from './control/executor';

const RECALL_KEY = 'ezy.recallSpeed';
const SPEED_KEY = 'ezy.speed';
const TRACKBOX_KEY = 'ezy.trackBox';
const PRESET_TOLERANCE = { deg: 1.0, zoom: 0.15 };
const DRIFT_GRACE_MS = 5000;
const MONITOR_MAX = 80;

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

/** Jog and zoom speeds survive a restart. Zoom 4 of 8 is the speed the W / T buttons always used before it was adjustable. */
function loadSpeed(): Speed {
  const speed: Speed = { pan: 12, tilt: 10, zoom: 4 };
  try {
    const v = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '');
    if (v && typeof v.pan === 'number') speed.pan = Math.min(24, Math.max(1, Math.round(v.pan)));
    if (v && typeof v.tilt === 'number') speed.tilt = Math.min(23, Math.max(1, Math.round(v.tilt)));
    if (v && typeof v.zoom === 'number') speed.zoom = Math.min(ZOOM_SPEED_MAX, Math.max(1, Math.round(v.zoom)));
  } catch {
    /* defaults above */
  }
  return speed;
}

const midi = new MidiManager();

export default function App() {
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [status, setStatus] = useState<Record<string, CameraStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraConfig | null>(null);
  const [showLog, setShowLog] = useState(false);
  /** How many log entries existed when the Log panel was last open; the badge counts problems after that. */
  const [logSeen, setLogSeen] = useState(0);
  const [showMapping, setShowMapping] = useState(false);
  const [showOscMap, setShowOscMap] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [welcomeSkipped, setWelcomeSkipped] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [tally, setTallyMap] = useState<Record<string, Tally>>({});
  const [speed, setSpeed] = useState<Speed>(loadSpeed);
  const [trackBox, setTrackBox] = useState(() => localStorage.getItem(TRACKBOX_KEY) === '1');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [active, setActive] = useState<Record<string, string | null>>({});
  const [recallSpeed, setRecallSpeed] = useState<RecallSpeed>(loadRecallSpeed);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [camState, setCamStateMap] = useState<Record<string, CamState>>({});
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [oscStatus, setOscStatus] = useState<OscStatus | null>(null);
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [monitor, setMonitor] = useState<MonitorEntry[]>([]);
  const [learn, setLearn] = useState<LearnState | null>(null);
  const [show, setShow] = useState<ShowStatus | null>(null);
  const connectedOnce = useRef(new Set<string>());
  const recalledAt = useRef<Record<string, number>>({});
  const monitorId = useRef(0);

  const refresh = useCallback(async () => {
    const list = await window.ezy.cameras.list();
    setCameras(list);
    setSelectedId((s) => (s && list.some((c) => c.id === s) ? s : (list[0]?.id ?? null)));
  }, []);

  const loadPresets = useCallback(async () => setPresets(await window.ezy.presets.list()), []);

  const addMonitor = useCallback((kind: MonitorEntry['kind'], text: string) => {
    setMonitor((m) => [...m.slice(-(MONITOR_MAX - 1)), { id: ++monitorId.current, ts: Date.now(), kind, text }]);
  }, []);

  // ---- startup: cameras, presets, statuses, log, settings, mappings, OSC status, MIDI ----
  useEffect(() => {
    void refresh();
    void loadPresets();
    void window.ezy.camera.statuses().then((all) => setStatus(Object.fromEntries(all.map((s) => [s.id, s]))));
    void window.ezy.log.list().then(setLogs);
    void window.ezy.mappings.list().then(setMappings);
    void window.ezy.osc.status().then(setOscStatus);
    void window.ezy.app.info().then(setInfo);
    void window.ezy.update.status().then(setUpdate);
    void window.ezy.settings.get().then(async (s) => {
      setSettings(s);
      await midi.init(s.midi.disabledDevices);
      setMidiDevices(midi.devices());
    });
    const offs = [
      window.ezy.onStatus((s) => setStatus((m) => ({ ...m, [s.id]: s }))),
      window.ezy.video.onEvent(dispatchVideoEvent),
      window.ezy.ndi.onFrame(dispatchNdiFrame),
      window.ezy.ndi.onState(dispatchNdiState),
      window.ezy.log.onEntry((e) => setLogs((l) => (l.length >= 2000 ? [...l.slice(-1999), e] : [...l, e]))),
      window.ezy.osc.onStatus(setOscStatus),
      window.ezy.update.onStatus(setUpdate),
      midi.onDevices(setMidiDevices),
    ];
    return () => offs.forEach((off) => off());
  }, [refresh, loadPresets]);

  useEffect(() => {
    localStorage.setItem(RECALL_KEY, JSON.stringify(recallSpeed));
  }, [recallSpeed]);

  useEffect(() => {
    localStorage.setItem(SPEED_KEY, JSON.stringify(speed));
  }, [speed]);

  useEffect(() => {
    localStorage.setItem(TRACKBOX_KEY, trackBox ? '1' : '0');
  }, [trackBox]);

  // ---- shows (.ezy): the current show and whether the setup changed since it was saved ----
  const refreshShow = useCallback(() => window.ezy.show.status().then(setShow).catch(() => undefined), []);
  useEffect(() => {
    void refreshShow();
    const t = window.setInterval(() => void refreshShow(), 3000);
    return () => window.clearInterval(t);
  }, [refreshShow]);

  useEffect(() => {
    document.title = show?.path ? `${show.name}${show.dirty ? ' •' : ''} · EZY CTRL` : 'EZY CTRL';
  }, [show]);

  /** The operator's speeds and view choices travel with the show. */
  const operatorRef = useRef<ShowOperator>({});
  operatorRef.current = { recallSpeed, speed, trackBox };
  const saveShow = useCallback(async (as = false) => {
    const st = await (as ? window.ezy.show.saveAs(operatorRef.current) : window.ezy.show.save(operatorRef.current)).catch(() => null);
    if (st) setShow(st);
  }, []);
  const openShow = useCallback((file?: string) => void window.ezy.show.open(file).catch(() => null), []);

  // A show was opened (menu, key, OSC or a double-clicked .ezy): take its operator settings, then start
  // the window over so no camera, stream or list from the previous setup lingers.
  useEffect(
    () =>
      window.ezy.show.onLoaded(({ operator }) => {
        try {
          if (operator?.recallSpeed) localStorage.setItem(RECALL_KEY, JSON.stringify(operator.recallSpeed));
          if (operator?.speed) localStorage.setItem(SPEED_KEY, JSON.stringify(operator.speed));
          if (operator?.trackBox !== undefined) localStorage.setItem(TRACKBOX_KEY, operator.trackBox ? '1' : '0');
        } catch {
          /* keep the current ones */
        }
        window.setTimeout(() => window.location.reload(), 150);
      }),
    [],
  );

  // While the Log is open everything counts as seen; the header badge only shows what arrived since.
  useEffect(() => {
    if (showLog) setLogSeen(logs.length);
  }, [showLog, logs.length]);

  // Connect control and start video for every configured camera once.
  useEffect(() => {
    for (const c of cameras) {
      if (connectedOnce.current.has(c.id)) continue;
      connectedOnce.current.add(c.id);
      window.ezy.camera.connect(c.id).catch(() => undefined);
      window.ezy.video.subscribe(c.id).catch(() => undefined);
      window.ezy.ndi.subscribe(c.id).catch(() => undefined);
    }
  }, [cameras]);

  // A camera whose source was switched to NDI after start needs its receiver started too.
  useEffect(() => {
    for (const c of cameras) if (c.videoSource === 'ndi') window.ezy.ndi.subscribe(c.id).catch(() => undefined);
  }, [cameras]);

  // Full NDI frame rate for the camera on stage, a trickle for the rack thumbnails.
  useEffect(() => {
    window.ezy.ndi.focus(selectedId).catch(() => undefined);
  }, [selectedId]);

  const selected = cameras.find((c) => c.id === selectedId) ?? null;
  const selectedOnline = selected ? (status[selected.id]?.connected ?? false) : false;
  const camPresets = useMemo(() => (selected ? presets.filter((p) => p.cameraId === selected.id) : []), [presets, selected]);
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

  const savePresetFor = useCallback(
    async (cameraId: string): Promise<Preset | null> => {
      if (isMonitor(cameras.find((c) => c.id === cameraId))) return null;
      const thumbnail = snapshotFor(cameraId, 240) ?? undefined;
      const n = presets.filter((p) => p.cameraId === cameraId).length + 1;
      try {
        const p = await window.ezy.presets.save(cameraId, `Preset ${n}`, thumbnail);
        await loadPresets();
        setActive((a) => ({ ...a, [cameraId]: p.id }));
        recalledAt.current[cameraId] = Date.now();
        return p;
      } catch {
        return null;
      }
    },
    [presets, loadPresets, cameras],
  );

  const savePreset = useCallback(() => (selected ? savePresetFor(selected.id) : Promise.resolve(null)), [selected, savePresetFor]);

  const setCamState = useCallback((cameraId: string, patch: Partial<CamState>) => {
    setCamStateMap((m) => ({ ...m, [cameraId]: { ...(m[cameraId] ?? { tracking: false, recording: false, portrait: false }), ...patch } }));
  }, []);

  // The camera's polled state is the source of truth for the toggles.
  useEffect(() => {
    setCamStateMap((m) => {
      let changed = false;
      const next = { ...m };
      for (const [id, s] of Object.entries(status)) {
        if (!s.state) continue;
        const cur = m[id];
        if (!cur || cur.tracking !== s.state.track || cur.recording !== s.state.record || cur.portrait !== s.state.portrait) {
          next[id] = { tracking: s.state.track, recording: s.state.record, portrait: s.state.portrait };
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [status]);

  /** One program and one preview at a time. */
  const setTally = useCallback((cameraId: string, t: Tally) => {
    setTallyMap((m) => {
      const next: Record<string, Tally> = { ...m };
      if (t !== 0) for (const id of Object.keys(next)) if (next[id] === t) next[id] = 0;
      next[cameraId] = t;
      return next;
    });
  }, []);

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

  // ---- action executor with a ref to the latest app state ----
  const ctxRef = useRef<ExecContext>(null as unknown as ExecContext);
  ctxRef.current = {
    cameras,
    selectedId,
    status,
    presets,
    speed,
    setSpeed,
    selectCamera: setSelectedId,
    recall,
    savePreset: savePresetFor,
    clearActive,
    camState,
    setCamState,
    setTally,
    toggleLog: () => setShowLog((v) => !v),
    toggleMapping: () => setShowMapping((v) => !v),
    togglePanel: () => setShowPanel((v) => !v),
    toggleTrackBox: () => setTrackBox((v) => !v),
    saveShow: () => void saveShow(),
    openShow: () => openShow(),
  };
  const executor = useMemo(() => new ActionExecutor(() => ctxRef.current), []);
  const mappingsRef = useRef(mappings);
  mappingsRef.current = mappings;
  const learnRef = useRef(learn);
  learnRef.current = learn;

  const saveMappings = useCallback((list: Mapping[]) => {
    setMappings(list);
    void window.ezy.mappings.save(list);
  }, []);

  const runInput = useCallback(
    (input: Input, extra: Invocation[] = []) => {
      const invs = [...extra, ...matchMappings(mappingsRef.current, input)];
      for (const inv of invs) executor.run(inv);
      return invs.length;
    },
    [executor],
  );

  // ---- MIDI ----
  useEffect(() => {
    return midi.onMessage((m) => {
      const label = m.kind === 'cc' ? `ch${m.channel} CC ${m.number} = ${m.value}` : `ch${m.channel} note ${m.number} ${m.value > 0 ? 'on' : 'off'}`;
      addMonitor('midi', `${m.device}: ${label}`);
      const l = learnRef.current;
      if (l?.kind === 'midi') {
        if (m.kind === 'note' && m.value === 0) return; // wait for the press, not the release
        const action = mappingsRef.current;
        const span = l.actionId === 'preset.recall' ? 64 : l.actionId === 'cam.select' ? 9 : undefined;
        const mapping: Mapping = {
          id: mappingId('midi', l.actionId, l.camera),
          actionId: l.actionId,
          camera: l.camera,
          trigger: { type: 'midi', channel: m.channel, kind: m.kind, number: m.number, span: m.kind === 'note' ? span : undefined },
        };
        saveMappings([...action.filter((x) => x.id !== mapping.id), mapping]);
        setLearn(null);
        return;
      }
      runInput(m);
    });
  }, [addMonitor, runInput, saveMappings]);

  // ---- OSC ----
  useEffect(() => {
    return window.ezy.osc.onMessage((m) => {
      addMonitor('osc', `${m.address} ${m.args.join(' ')}  ← ${m.from}`);
      const input: Input = { type: 'osc', address: m.address, args: m.args };
      const builtin = parseBuiltinOsc(input);
      runInput(input, builtin ? [builtin] : []);
    });
  }, [addMonitor, runInput]);

  // ---- keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.repeat || e.metaKey) return;
      const input = keyInputFrom(e, 'press');
      if (!input) return;
      const l = learnRef.current;
      if (l?.kind === 'key') {
        if (input.key === 'escape') {
          setLearn(null);
          return;
        }
        const span = l.actionId === 'preset.recall' || l.actionId === 'cam.select' ? (/^[0-9]$/.test(input.key) ? 9 : undefined) : undefined;
        const mapping: Mapping = {
          id: mappingId('key', l.actionId, l.camera),
          actionId: l.actionId,
          camera: l.camera,
          trigger: { type: 'key', key: input.key, ctrl: input.ctrl || undefined, shift: input.shift || undefined, alt: input.alt || undefined, span },
        };
        saveMappings([...mappingsRef.current.filter((x) => x.id !== mapping.id), mapping]);
        setLearn(null);
        e.preventDefault();
        return;
      }
      if (runInput(input) > 0) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const input = keyInputFrom(e, 'release');
      if (input) runInput(input);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [runInput, saveMappings]);

  // ---- OSC feedback ----
  const feedbackOn = !!settings?.osc.feedbackEnabled && !!settings.osc.feedbackHost;
  const sendFeedback = useCallback(
    (address: string, args: (number | string | boolean)[]) => {
      if (!feedbackOn) return;
      addMonitor('out', `${address} ${args.join(' ')}`);
      void window.ezy.osc.send(address, args);
    },
    [feedbackOn, addMonitor],
  );
  // Feedback addresses use the camera's name slug or its rack number, as chosen in the OSC map.
  const naming = settings?.osc.naming ?? 'name';
  const camKey = useCallback((c: CameraConfig, idx: number) => oscCameraKey(c, idx, naming), [naming]);
  useEffect(() => {
    if (!selected) return;
    sendFeedback('/cam/select', [cameras.indexOf(selected) + 1, oscSlug(selected.name)]);
  }, [selected, cameras, sendFeedback]);
  useEffect(() => {
    for (const [cameraId, presetId] of Object.entries(active)) {
      const idx = cameras.findIndex((c) => c.id === cameraId);
      if (idx < 0) continue;
      const list = presets.filter((p) => p.cameraId === cameraId);
      const p = presetId ? list.find((x) => x.id === presetId) : undefined;
      sendFeedback(`/cam/${camKey(cameras[idx], idx)}/preset/active`, [p ? list.indexOf(p) + 1 : 0, p ? oscSlug(p.name) : '']);
    }
  }, [active, cameras, presets, sendFeedback, camKey]);
  const lastTally = useRef<Record<string, Tally>>({});
  useEffect(() => {
    cameras.forEach((c, idx) => {
      const t = tally[c.id] ?? 0;
      if ((lastTally.current[c.id] ?? 0) !== t) {
        lastTally.current[c.id] = t;
        sendFeedback(`/cam/${camKey(c, idx)}/tally`, [t]);
      }
    });
  }, [tally, cameras, sendFeedback, camKey]);
  const lastOnline = useRef<Record<string, boolean>>({});
  const lastPos = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!feedbackOn) return;
    cameras.forEach((c, idx) => {
      const s = status[c.id];
      if (!s) return;
      if (lastOnline.current[c.id] !== s.connected) {
        lastOnline.current[c.id] = s.connected;
        sendFeedback(`/cam/${camKey(c, idx)}/online`, [s.connected ? 1 : 0]);
      }
      if (s.position && Date.now() - (lastPos.current[c.id] ?? 0) >= 250) {
        lastPos.current[c.id] = Date.now();
        sendFeedback(`/cam/${camKey(c, idx)}/position`, [s.position.panDeg, s.position.tiltDeg, s.position.zoomRatio]);
      }
    });
  }, [status, cameras, feedbackOn, sendFeedback, camKey]);

  // ---- scripted interactions for screenshot-based checks (EZY_AUTOTEST=presets,log,mapping) ----
  useEffect(() => {
    const steps = window.ezy.env.autotest.split(',').filter(Boolean);
    if (steps.length === 0) return;
    const timers: number[] = [];
    if (steps.includes('presets')) {
      timers.push(window.setTimeout(() => void ctxRef.current.savePreset(ctxRef.current.selectedId ?? ''), 6000));
      timers.push(
        window.setTimeout(() => {
          const c = ctxRef.current;
          const first = c.presets.filter((p) => p.cameraId === c.selectedId)[0];
          if (first) c.recall(first);
        }, 8500),
      );
    }
    if (steps.includes('log')) timers.push(window.setTimeout(() => setShowLog(true), 3000));
    if (steps.includes('mapping')) timers.push(window.setTimeout(() => setShowMapping(true), 3000));
    if (steps.includes('oscmap')) timers.push(window.setTimeout(() => setShowOscMap(true), 3000));
    if (steps.includes('oscmap-scroll')) timers.push(window.setTimeout(() => document.querySelector('.oscmap-body')?.scrollTo({ top: 1500 }), 4500));
    if (steps.includes('panel')) timers.push(window.setTimeout(() => setShowPanel(true), 3000));
    if (steps.includes('help')) timers.push(window.setTimeout(() => setShowHelp(true), 3000));
    if (steps.includes('add')) timers.push(window.setTimeout(() => setShowAdd(true), 4000));
    if (steps.includes('add-ndi'))
      timers.push(
        window.setTimeout(() => {
          const all = [...document.querySelectorAll<HTMLElement>('.dialog .seg .b')];
          all.forEach((b) => b.textContent === 'NDI' && b.click());
        }, 5000),
      );
    if (steps.includes('skip')) timers.push(window.setTimeout(() => setWelcomeSkipped(true), 3000));
    if (steps.includes('edit')) timers.push(window.setTimeout(() => setEditCamera(ctxRef.current.cameras[0] ?? null), 3000));
    if (steps.includes('pselect'))
      timers.push(
        window.setTimeout(() => {
          // Ctrl-click the first three preset rows to show select mode.
          document.querySelectorAll<HTMLElement>('.prow').forEach((el, i) => i < 3 && el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
        }, 3000),
      );
    if (steps.includes('tally'))
      timers.push(
        window.setTimeout(() => {
          const c = ctxRef.current;
          if (c.cameras[0]) c.setTally(c.cameras[0].id, 1);
          if (c.cameras[1]) c.setTally(c.cameras[1].id, 2);
        }, 4000),
      );
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

  const updateSettings = async (patch: Partial<Settings>) => setSettings(await window.ezy.settings.set(patch));

  const addDemoCamera = async () => {
    const cam = await window.ezy.cameras.add({ name: 'Demo pattern', host: '127.0.0.1', viscaPort: 52381, videoSource: 'demo', videoUrl: '' });
    await refresh();
    setSelectedId(cam.id);
    setShowHelp(false);
  };

  const helpProps = {
    info,
    update,
    autoCheck: settings?.updates.autoCheck ?? true,
    onAutoCheck: (on: boolean) => void updateSettings({ updates: { autoCheck: on } }),
    onCheck: () => void window.ezy.update.check().then(setUpdate),
    onInstall: () => void window.ezy.update.install(),
    onAddCamera: () => {
      setShowHelp(false);
      setShowAdd(true);
    },
    onDemo: () => void addDemoCamera(),
  };

  const ptzCameras = cameras.filter((c) => !isMonitor(c));
  const monitorCount = cameras.length - ptzCameras.length;
  const connectedCount = ptzCameras.filter((c) => status[c.id]?.connected).length;
  const unseen = logs.slice(Math.min(logSeen, logs.length));
  const errorCount = unseen.filter((e) => e.level === 'error').length;
  const warnCount = unseen.filter((e) => e.level === 'warn').length;
  const cameraNames = Object.fromEntries(cameras.map((c) => [c.id, c.name]));
  const midiActive = midiDevices.filter((d) => d.connected && d.enabled);

  return (
    <div className="app">
      <header className="hdr">
        <span className="brand">EZY CTRL</span>
        <ShowMenu status={show} onSave={() => void saveShow()} onSaveAs={() => void saveShow(true)} onOpen={openShow} onBackups={() => void window.ezy.show.revealBackups()} />
        <span className="info">
          {ptzCameras.length} camera{ptzCameras.length === 1 ? '' : 's'} · {connectedCount} online{monitorCount ? ` · ${monitorCount} monitor${monitorCount === 1 ? '' : 's'}` : ''} · {presets.length} presets
        </span>
        <span className="spacer" />
        <span className="info" title={midiActive.map((d) => d.name).join(', ') || midi.error || 'no MIDI device'}>
          MIDI <span className={`led${midiActive.length ? ' on' : ''}`} /> {midiActive.length ? midiActive[0].name + (midiActive.length > 1 ? ` +${midiActive.length - 1}` : '') : 'none'}
        </span>
        <span className="info click" onClick={() => setShowOscMap(true)} title="OSC map: every address and name, ready to copy">OSC <span className={`led${oscStatus?.listening ? ' on' : oscStatus?.error ? ' warn' : ''}`} /> {oscStatus?.listening ? `:${oscStatus.port}` : 'off'}
        </span>
        {update?.state === 'downloaded' && (
          <button className="hb update" onClick={() => void window.ezy.update.install()} title="An update has been downloaded">
            Restart to update to v{update.version}
          </button>
        )}
        {(update?.state === 'available' || update?.state === 'downloading') && (
          <span className="info" title="Downloading in the background">
            update {update.percent ?? 0}%
          </span>
        )}
        <button className={`hb${showPanel ? ' active' : ''}`} onClick={() => setShowPanel((v) => !v)} title="Camera settings (I)" disabled={!selected}>
          Camera
        </button>
        <button className={`hb${showMapping ? ' active' : ''}`} onClick={() => setShowMapping((v) => !v)} title="Mapping (M)">
          Mapping
        </button>
        <button className={`hb${errorCount ? ' has-err' : warnCount ? ' has-warn' : ''}`} onClick={() => setShowLog((v) => !v)} title="Log (L)">
          Log
          {errorCount > 0 && <span className="badge err">{errorCount}</span>}
          {errorCount === 0 && warnCount > 0 && <span className="badge warn">{warnCount}</span>}
        </button>
        <button className="hb" onClick={() => setShowAdd(true)}>
          Add camera
        </button>
        <button className={`hb${showHelp ? ' active' : ''}`} onClick={() => setShowHelp((v) => !v)} title="Help, first steps and updates">
          ?
        </button>
      </header>

      <div className="body">
        <Rack cameras={cameras} status={status} selectedId={selectedId} tally={tally} onSelect={setSelectedId} onTally={setTally} onAdd={() => setShowAdd(true)} onEdit={setEditCamera} />

        {selected ? (
          <Stage
            camera={selected}
            status={status[selected.id]}
            speed={speed}
            onSpeed={setSpeed}
            onRemove={() => void removeCamera(selected.id)}
            onEdit={() => setEditCamera(selected)}
            activePresetName={activePreset ? `P${camPresets.indexOf(activePreset) + 1} · ${activePreset.name}` : undefined}
            onManual={() => clearActive(selected.id)}
            camState={camState[selected.id] ?? { tracking: false, recording: false, portrait: false }}
            onCamState={(patch) => setCamState(selected.id, patch)}
            tally={tally[selected.id] ?? 0}
            panelOpen={showPanel}
            onTogglePanel={() => setShowPanel((v) => !v)}
            trackBox={trackBox}
            onTrackBox={() => setTrackBox((v) => !v)}
          />
        ) : (
          <div className="stage">
            {welcomeSkipped ? (
              <div className="emptystage">
                <h3>No cameras yet</h3>
                <span>Add a Tail 2 by its IP address, a video-only source, or try the demo pattern.</span>
                <div className="helpbtns">
                  <button className="b primary" onClick={() => setShowAdd(true)}>
                    Add camera
                  </button>
                  <button className="b" onClick={() => void addDemoCamera()}>
                    Try the demo
                  </button>
                  <button className="b" onClick={() => setWelcomeSkipped(false)}>
                    Show the guide
                  </button>
                </div>
              </div>
            ) : (
              <Help {...helpProps} inline onClose={() => setWelcomeSkipped(true)} />
            )}
          </div>
        )}

        {showHelp && cameras.length > 0 && <Help {...helpProps} onClose={() => setShowHelp(false)} />}

        <Presets
          camera={selected}
          online={selectedOnline}
          monitor={isMonitor(selected)}
          presets={camPresets}
          activeId={activePreset?.id ?? null}
          recallSpeed={recallSpeed}
          onRecallSpeed={setRecallSpeed}
          onSave={savePreset}
          onRecall={recall}
          onChanged={loadPresets}
          onSnapshot={() => (selected ? (snapshotFor(selected.id, 240) ?? undefined) : undefined)}
          onNames={() => setShowOscMap(true)}
        />

        {showMapping && settings && (
          <MappingPanel
            mappings={mappings}
            onMappings={saveMappings}
            onResetMappings={() => void window.ezy.mappings.reset().then(setMappings)}
            midiDevices={midiDevices}
            midiError={midi.error}
            onMidiEnabled={(name, on) => {
              const disabledDevices = midi.setEnabled(name, on);
              void updateSettings({ midi: { disabledDevices } });
            }}
            settings={settings}
            onSettings={(patch) => void updateSettings(patch)}
            oscStatus={oscStatus}
            cameras={cameras}
            monitor={monitor}
            learn={learn}
            onLearn={setLearn}
            onOscMap={() => setShowOscMap(true)}
            onClose={() => {
              setShowMapping(false);
              setLearn(null);
            }}
          />
        )}
      </div>

      {showOscMap && settings && <OscMapPanel cameras={cameras} presets={presets} settings={settings} oscStatus={oscStatus} onSettings={(patch) => void updateSettings(patch)} onClose={() => setShowOscMap(false)} />}

      {showPanel && selected && !isMonitor(selected) && <CameraPanel camera={selected} status={status[selected.id]} onClose={() => setShowPanel(false)} />}

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

      {(showAdd || editCamera) && (
        <CameraDialog
          existing={editCamera ?? undefined}
          onClose={() => {
            setShowAdd(false);
            setEditCamera(null);
          }}
          onSaved={async (cam) => {
            setShowAdd(false);
            setEditCamera(null);
            await refresh();
            setSelectedId(cam.id);
          }}
        />
      )}
    </div>
  );
}
