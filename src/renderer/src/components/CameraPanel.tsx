import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, CameraFullState, CameraSet, CameraStatus } from '../../../shared/types';

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
const WB = ['Auto', 'Daylight', 'Fluorescent', 'One-push', 'Tungsten', 'Manual', 'Cloudy'];
const STYLES = ['Standard', 'Outdoor', 'Pastel', 'Custom'];

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
  const [full, setFull] = useState<CameraFullState | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const sliderTimers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!online) return;
    setLoading(true);
    try {
      setFull(await window.ezy.camera.fullState(id));
    } catch {
      /* stays as is; the log has the reason */
    } finally {
      setLoading(false);
    }
  }, [id, online]);

  useEffect(() => {
    setFull(null);
    void load();
  }, [load]);

  const scheduleRefresh = () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void load(), 500);
  };

  const set = (s: CameraSet) => {
    // Optimistic update for immediate feedback; the refresh confirms it.
    if ('value' in s) setFull((f) => (f ? { ...f, [s.key === 'portrait' ? 'portrait' : s.key]: s.value } as CameraFullState : f));
    window.ezy.camera.set(id, s).catch(() => undefined);
    scheduleRefresh();
  };

  /** Sliders: send at most every 120 ms while dragging. */
  const setSlider = (key: Extract<CameraSet, { value: number }>['key'], value: number) => {
    setFull((f) => (f ? { ...f, [key]: value } : f));
    if (sliderTimers.current[key]) window.clearTimeout(sliderTimers.current[key]);
    sliderTimers.current[key] = window.setTimeout(() => {
      window.ezy.camera.set(id, { key, value } as CameraSet).catch(() => undefined);
      scheduleRefresh();
    }, 120);
  };

  const track = live?.track ?? false;
  const trackMode = live?.trackMode ?? 'single';
  const focusAuto = live?.focusAuto ?? true;
  const exposureAuto = live?.exposureAuto ?? true;
  const wbMode = live?.wbMode ?? 0;

  return (
    <div className="campanel">
      <div className="cphead">
        <span style={{ fontWeight: 700 }}>Camera settings · {camera.name}</span>
        <span className="mono muted">{online ? (loading ? 'reading…' : full ? 'live' : 'no state yet') : 'camera offline'}</span>
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
            <Toggle on={track} disabled={!online} onChange={(v) => set({ key: 'track', value: v })} />
          </Row>
          <Row label="Mode">
            <Seg value={trackMode} disabled={!online} options={[{ v: 'single', label: 'Single' }, { v: 'group', label: 'Group' }]} onChange={(v) => set({ key: 'trackMode', value: v })} />
          </Row>
          <Row label="Speed">
            <Seg value={full?.trackSpeed ?? 3} disabled={!online || !full} options={SPEEDS.map((label, v) => ({ v, label }))} onChange={(v) => set({ key: 'trackSpeed', value: v })} />
          </Row>
          <Row label="Auto-zoom">
            <select className="input small sel" disabled={!online || !full} value={full?.autoZoom ?? 0} onChange={(e) => set({ key: 'autoZoom', value: Number(e.target.value) })}>
              {AUTO_ZOOM.map((label, v) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Only me">
            <Toggle on={full?.onlyMe ?? false} disabled={!online || !full} onChange={(v) => set({ key: 'onlyMe', value: v })} />
          </Row>
        </section>

        {/* ---- focus & exposure ---- */}
        <section className="cpsection">
          <div className="lbl">Focus &amp; exposure</div>
          <Row label="Focus">
            <Seg value={focusAuto ? 'auto' : 'manual'} disabled={!online} options={[{ v: 'auto', label: 'Auto' }, { v: 'manual', label: 'Manual' }]} onChange={(v) => set({ key: 'focusAuto', value: v === 'auto' })} />
            <button className="b sm" disabled={!online} onClick={() => set({ key: 'focusPush' })}>
              One-push
            </button>
          </Row>
          {!focusAuto && (
            <Row label="Focus position">
              <input type="range" min={0} max={100} value={full?.focusPos ?? 50} disabled={!online || !full} onChange={(e) => setSlider('focusPos', Number(e.target.value))} />
              <output className="mono">{full?.focusPos ?? '—'}</output>
            </Row>
          )}
          <Row label="Exposure">
            <Seg value={exposureAuto ? 'auto' : 'manual'} disabled={!online} options={[{ v: 'auto', label: 'Auto' }, { v: 'manual', label: 'Manual' }]} onChange={(v) => set({ key: 'exposureAuto', value: v === 'auto' })} />
          </Row>
          {exposureAuto ? (
            <Row label="Exp. comp">
              <input type="range" min={0} max={18} value={full?.expComp ?? 9} disabled={!online || !full} onChange={(e) => setSlider('expComp', Number(e.target.value))} />
              <output className="mono">{full ? `${EV[full.expComp] >= 0 ? '+' : ''}${EV[full.expComp] ?? 0} EV` : '—'}</output>
            </Row>
          ) : (
            <>
              <Row label="Shutter">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'shutterDown' })}>
                  −
                </button>
                <output className="mono">{full ? (SHUTTER[full.shutter] ?? full.shutter) : '—'}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'shutterUp' })}>
                  +
                </button>
              </Row>
              <Row label="Gain">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'gainDown' })}>
                  −
                </button>
                <output className="mono">{full ? `ISO ${full.gain * 100}` : '—'}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'gainUp' })}>
                  +
                </button>
              </Row>
            </>
          )}
          <Row label="Backlight">
            <Toggle on={full?.backlight ?? false} disabled={!online || !full} onChange={(v) => set({ key: 'backlight', value: v })} />
          </Row>
          <Row label="Anti-flicker">
            <Seg value={full?.flicker ?? 0} disabled={!online || !full} options={[{ v: 0, label: 'Off' }, { v: 1, label: '50 Hz' }, { v: 2, label: '60 Hz' }]} onChange={(v) => set({ key: 'flicker', value: v })} />
          </Row>
        </section>

        {/* ---- white balance & image ---- */}
        <section className="cpsection">
          <div className="lbl">White balance &amp; image</div>
          <Row label="White balance">
            <select className="input small sel" disabled={!online} value={wbMode} onChange={(e) => set({ key: 'wbMode', value: Number(e.target.value) })}>
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
                <input type="range" min={2000} max={10000} step={100} value={full?.colorTemp ?? 5500} disabled={!online || !full} onChange={(e) => setSlider('colorTemp', Number(e.target.value))} />
                <output className="mono">{full ? `${full.colorTemp} K` : '—'}</output>
              </Row>
              <Row label="R / B gain">
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'rGainDown' })}>
                  R−
                </button>
                <output className="mono">{full?.rGain ?? '—'}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'rGainUp' })}>
                  R+
                </button>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'bGainDown' })}>
                  B−
                </button>
                <output className="mono">{full?.bGain ?? '—'}</output>
                <button className="b sm" disabled={!online} onClick={() => set({ key: 'bGainUp' })}>
                  B+
                </button>
              </Row>
            </>
          )}
          <Row label="Style">
            <Seg value={full?.style ?? 0} disabled={!online || !full} options={STYLES.map((label, v) => ({ v, label }))} onChange={(v) => set({ key: 'style', value: v })} />
          </Row>
          {(['bright', 'contrast', 'saturation', 'sharpness', 'hue'] as const).map((key) => (
            <Row key={key} label={key === 'bright' ? 'Brightness' : key[0].toUpperCase() + key.slice(1)}>
              <input type="range" min={0} max={100} value={full?.[key] ?? 50} disabled={!online || !full} onChange={(e) => setSlider(key, Number(e.target.value))} />
              <output className="mono">{full?.[key] ?? '—'}</output>
            </Row>
          ))}
        </section>
      </div>
    </div>
  );
}
