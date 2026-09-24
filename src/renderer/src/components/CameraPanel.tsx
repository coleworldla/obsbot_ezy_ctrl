import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, CameraFullState, CameraLiveState, CameraSet, CameraStatus } from '../../../shared/types';

interface Props {
  camera: CameraConfig;
  status?: CameraStatus;
  onClose: () => void;
}

const SHUTTER: Record<number, string> = {
  0x09: '1/8000', 0x0a: '1/6400', 0x0b: '1/5000', 0x0c: '1/4000', 0x0d: '1/3200', 0x0e: '1/2500', 0x0f: '1/2000', 0x10: '1/1600',
  0x11: '1/1250', 0x12: '1/1000', 0x13: '1/800', 0x14: '1/640', 0x15: '1/500', 0x16: '1/400', 0x17: '1/320', 0x18: '1/240',
  0x19: '1/200', 0x1a: '1/160', 0x1b: '1/120', 0x1c: '1/100', 0x1d: '1/80', 0x1e: '1/60', 0x1f: '1/50', 0x20: '1/40', 0x21: '1/30', 0x22: '1/25',
};
const EV = [-3, -2.7, -2.3, -2, -1.7, -1.3, -1, -0.7, -0.3, 0, 0.3, 0.7, 1, 1.3, 1.7, 2, 2.3, 2.7, 3];
const SPEEDS = ['Super lazy', 'Lazy', 'Slow', 'Fast', 'Crazy'];
const AUTO_ZOOM = ['Off', 'Close-up', 'Half body', 'Above knees', 'Nine-head', 'Full body', 'Long shot 1', 'Long shot 2'];
/** Auto-zoom framing that exists only for single-person tracking: the Tail 2 refuses it in group mode (OBSBOT's VISCA table). */
const CLOSE_UP = 1;
const WB = ['Auto', 'Daylight', 'Fluorescent', 'One-push', 'Tungsten', 'Manual', 'Cloudy'];
const STYLES = ['Standard', 'Outdoor', 'Pastel', 'Custom'];

/** Electron wraps errors thrown in the main process ("Error invoking remote method 'camera:set': Error: syntax error"); keep the camera's own words. */
const ipcErrorText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': /, '').replace(/^\w*Error: /, '');

function describeSet(s: CameraSet): string {
  if (s.key === 'autoZoom') return `auto-zoom "${AUTO_ZOOM[s.value] ?? s.value}"`;
  if (s.key === 'trackSpeed') return `tracking speed "${SPEEDS[s.value] ?? s.value}"`;
  return 'value' in s ? `${s.key} = ${String(s.value)}` : s.key;
}

const DEFAULTS: CameraFullState = {
  track: false, trackMode: 'single', record: false, portrait: false, focusAuto: true, exposureAuto: true, wbMode: 0,
  trackSpeed: 3, autoZoom: 0, onlyMe: false, focusPos: 50, expComp: 9, backlight: false, flicker: 0, shutter: 0x1e, gain: 1,
  colorTemp: 5500, rGain: 128, bGain: 128, style: 0, bright: 50, contrast: 50, saturation: 50, sharpness: 50, hue: 50,
  unsupported: [],
};

/** How long a click's optimistic value wins over the polled state. */
const OPTIMISTIC_MS = 4000;

function Seg<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg cpseg">
      {options.map((o) => (
        <button key={String(o.v)} className={`b sm${o.v === value ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="dot" />
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cprow">
      <span className="cplabel">{label}</span>
      <span className="cpctl">{children}</span>
    </div>
  );
}

export function CameraPanel({ camera, status, onClose }: Props) {
  const id = camera.id;
  const online = status?.connected ?? false;
  const live = status?.state;
  const [full, setFull] = useState<CameraFullState>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Values the user just clicked, shown until the camera confirms or the timer runs out. */
  const [pending, setPending] = useState<Partial<CameraLiveState>>({});
  const pendingTimers = useRef<Record<string, number>>({});
  const refreshTimer = useRef<number | null>(null);
  const sliderTimers = useRef<Record<string, number>>({});
  const errTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!online) return;
    setLoading(true);
    try {
      setFull(await window.ezy.camera.fullState(id));
      setLoaded(true);
    } catch (e) {
      showErr(`could not read the camera state: ${ipcErrorText(e)}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, online]);

  useEffect(() => {
    setFull(DEFAULTS);
    setLoaded(false);
    setPending({});
    void load();
  }, [load]);

  // Drop an optimistic value as soon as the camera reports the same thing.
  useEffect(() => {
    if (!live) return;
    setPending((p) => {
      const next = { ...p };
      let changed = false;
      for (const k of Object.keys(next) as (keyof CameraLiveState)[]) {
        if (live[k] === next[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [live]);

  const showErr = (message: string) => {
    setErr(message);
    if (errTimer.current) window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setErr(null), 6000);
  };

  const scheduleRefresh = () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void load(), 600);
  };

  const optimistic = (patch: Partial<CameraLiveState>) => {
    setPending((p) => ({ ...p, ...patch }));
    for (const k of Object.keys(patch)) {
      if (pendingTimers.current[k]) window.clearTimeout(pendingTimers.current[k]);
      pendingTimers.current[k] = window.setTimeout(() => setPending((p) => { const n = { ...p }; delete n[k as keyof CameraLiveState]; return n; }), OPTIMISTIC_MS);
    }
  };

  const send = (s: CameraSet) =>
    window.ezy.camera.set(id, s).catch((e: unknown) => {
      const why = ipcErrorText(e);
      showErr(s.key === 'autoZoom' && s.value === CLOSE_UP && trackMode === 'group' ? `Close-up works only in Single mode (camera said: ${why}). Set Mode to Single first.` : `could not set ${describeSet(s)}: ${why}`);
    });

  /** Image-state settings: update the local copy at once, send, then re-read. */
  const set = (s: CameraSet) => {
    if ('value' in s) setFull((f) => ({ ...f, [s.key]: s.value }) as CameraFullState);
    void send(s);
    scheduleRefresh();
  };

  /** Live-state settings (tracking, focus/exposure/WB mode): show the click immediately, confirm from the poll. */
  const setLive = (s: CameraSet, patch: Partial<CameraLiveState>) => {
    optimistic(patch);
    setFull((f) => ({ ...f, ...patch }));
    void send(s);
    scheduleRefresh();
  };

  /** Sliders: send at most every 120 ms while dragging. */
  const setSlider = (key: Extract<CameraSet, { value: number }>['key'], value: number) => {
    setFull((f) => ({ ...f, [key]: value }));
    if (sliderTimers.current[key]) window.clearTimeout(sliderTimers.current[key]);
    sliderTimers.current[key] = window.setTimeout(() => {
      void send({ key, value } as CameraSet);
      scheduleRefresh();
    }, 120);
  };

  const track = pending.track ?? live?.track ?? full.track;
  const trackMode = pending.trackMode ?? live?.trackMode ?? full.trackMode;
  const focusAuto = pending.focusAuto ?? live?.focusAuto ?? full.focusAuto;
  const exposureAuto = pending.exposureAuto ?? live?.exposureAuto ?? full.exposureAuto;
  const wbMode = pending.wbMode ?? live?.wbMode ?? full.wbMode;

  const statusText = !online
    ? 'camera offline'
    : loading
      ? 'reading…'
      : err
        ? err
        : !loaded
          ? 'showing defaults until the camera answers'
          : full.unsupported.length
            ? `live · not reported by this camera: ${full.unsupported.join(', ')}`
            : 'live';

  return (
    <div className="campanel">
      <div className="cphead">
        <span style={{ fontWeight: 700 }}>Camera settings · {camera.name}</span>
        <span className={`mono ${err ? 'warn-text' : 'muted'}`} title={full.unsupported.length ? 'For these the panel shows the last value you set, or a default' : undefined}>
          {statusText}
        </span>
        <span className="spacer" />
        <button className="b sm" disabled={!online} onClick={() => void load()}>
          Refresh
        </button>
        <button className="b sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="cpbody">
        {/* ---- AI tracking ---- */}
        <section className="cpsection">
          <div className="lbl">AI tracking</div>
          <Row label="Tracking">
            <Toggle on={track} disabled={!online} onChange={(v) => setLive({ key: 'track', value: v }, { track: v })} />
          </Row>
          <Row label="Mode">
            <Seg value={trackMode} disabled={!online} options={[{ v: 'single', label: 'Single' }, { v: 'group', label: 'Group' }]} onChange={(v) => setLive({ key: 'trackMode', value: v }, { trackMode: v })} />
          </Row>
          <Row label="Speed">
            <Seg value={full.trackSpeed} disabled={!online} options={SPEEDS.map((label, v) => ({ v, label }))} onChange={(v) => set({ key: 'trackSpeed', value: v })} />
          </Row>
          <Row label="Auto-zoom">
            <select
              className="input small sel"
              disabled={!online}
              value={full.autoZoom}
              title={trackMode === 'group' ? 'Group mode has no Close-up framing; switch Mode to Single for it' : undefined}
              onChange={(e) => set({ key: 'autoZoom', value: Number(e.target.value) })}
            >
              {AUTO_ZOOM.map((label, v) => {
                const singleOnly = v === CLOSE_UP && trackMode === 'group';
                return (
                  <option key={v} value={v} disabled={singleOnly}>
                    {singleOnly ? `${label} (Single mode only)` : label}
                  </option>
                );
              })}
            </select>
          </Row>
          <Row label="Only me">
            <Toggle on={full.onlyMe} disabled={!online} onChange={(v) => set({ key: 'onlyMe', value: v })} />
          </Row>
        </section>

        {/* ---- focus & exposure ---- */}
        <section className="cpsection">
          <div className="lbl">Focus &amp; exposure</div>
          <Row label="Focus">
            <Seg value={focusAuto ? 'auto' : 'manual'} disabled={!online} options={[{ v: 'auto', label: 'Auto' }, { v: 'manual', label: 'Manual' }]} onChange={(v) => setLive({ key: 'focusAuto', value: v === 'auto' }, { focusAuto: v === 'auto' })} />
            <button className="b sm" disabled={!online} onClick={() => set({ key: 'focusPush' })}>
              One-push
            </button>
          </Row>
          {!focusAuto && (
            <Row label="Focus position">
              <input type="range" min={0} max={100} value={full.focusPos} disabled={!online} onChange={(e) => setSlider('focusPos', Number(e.target.value))} />
              <output className="mono">{full.focusPos}</output>
            </Row>
          )}
          <Row label="Exposure">
            <Seg value={exposureAuto ? 'auto' : 'manual'} disabled={!online} options={[{ v: 'auto', label: 'Auto' }, { v: 'manual', label: 'Manual' }]} onChange={(v) => setLive({ key: 'exposureAuto', value: v === 'auto' }, { exposureAuto: v === 'auto' })} />
          </Row>
          {exposureAuto ? (
            <Row label="Exp. comp">
              <input type="range" min={0} max={18} value={full.expComp} disabled={!online} onChange={(e) => setSlider('expComp', Number(e.target.value))} />
              <output className="mono">{`${(EV[full.expComp] ?? 0) >= 0 ? '+' : ''}${EV[full.expComp] ?? 0} EV`}</output>
            </Row>
          ) : (
            <>
              <Row label="Shutter">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'shutterDown' })}>
                  −
                </button>
                <output className="mono">{SHUTTER[full.shutter] ?? full.shutter}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'shutterUp' })}>
                  +
                </button>
              </Row>
              <Row label="Gain">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'gainDown' })}>
                  −
                </button>
                <output className="mono">{`ISO ${full.gain * 100}`}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'gainUp' })}>
                  +
                </button>
              </Row>
            </>
          )}
          <Row label="Backlight">
            <Toggle on={full.backlight} disabled={!online} onChange={(v) => set({ key: 'backlight', value: v })} />
          </Row>
          <Row label="Anti-flicker">
            <Seg value={full.flicker} disabled={!online} options={[{ v: 0, label: 'Off' }, { v: 1, label: '50 Hz' }, { v: 2, label: '60 Hz' }]} onChange={(v) => set({ key: 'flicker', value: v })} />
          </Row>
        </section>

        {/* ---- white balance & image ---- */}
        <section className="cpsection">
          <div className="lbl">White balance &amp; image</div>
          <Row label="White balance">
            <select className="input small sel" disabled={!online} value={wbMode} onChange={(e) => setLive({ key: 'wbMode', value: Number(e.target.value) }, { wbMode: Number(e.target.value) })}>
              {WB.map((label, v) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {wbMode === 3 && (
              <button className="b sm" disabled={!online} onClick={() => set({ key: 'wbPush' })}>
                Trigger
              </button>
            )}
          </Row>
          {wbMode === 5 && (
            <>
              <Row label="Colour temp">
                <input type="range" min={2000} max={10000} step={100} value={full.colorTemp} disabled={!online} onChange={(e) => setSlider('colorTemp', Number(e.target.value))} />
                <output className="mono">{`${full.colorTemp} K`}</output>
              </Row>
              <Row label="R / B gain">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'rGainDown' })}>
                  R−
                </button>
                <output className="mono">{full.rGain}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'rGainUp' })}>
                  R+
                </button>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'bGainDown' })}>
                  B−
                </button>
                <output className="mono">{full.bGain}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'bGainUp' })}>
                  B+
                </button>
              </Row>
            </>
          )}
          <Row label="Style">
            <Seg value={full.style} disabled={!online} options={STYLES.map((label, v) => ({ v, label }))} onChange={(v) => set({ key: 'style', value: v })} />
          </Row>
          {(['bright', 'contrast', 'saturation', 'sharpness', 'hue'] as const).map((key) => (
            <Row key={key} label={key === 'bright' ? 'Brightness' : key[0].toUpperCase() + key.slice(1)}>
              <input type="range" min={0} max={100} value={full[key]} disabled={!online} onChange={(e) => setSlider(key, Number(e.target.value))} />
              <output className="mono">{full[key]}</output>
            </Row>
          ))}
        </section>
      </div>
    </div>
  );
}
