import { useMemo, useState } from 'react';
import { oscMapRows, oscMapText, type OscMapFormat, type OscMapRow, type OscNaming } from '../../../shared/mapping';
import type { CameraConfig, OscStatus, Preset, Settings } from '../../../shared/types';

interface Props {
  cameras: CameraConfig[];
  presets: Preset[];
  settings: Settings;
  oscStatus: OscStatus | null;
  onSettings: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const FORMATS: { id: OscMapFormat; label: string; hint: string }[] = [
  { id: 'text', label: 'Text', hint: 'address, argument and what it does on one line each' },
  { id: 'addresses', label: 'Addresses only', hint: 'one address per line, for pasting into TouchOSC or an OSC monitor' },
  { id: 'csv', label: 'CSV', hint: 'section,address,argument,description,direction — for spreadsheets and Companion imports' },
  { id: 'markdown', label: 'Markdown', hint: 'a table for show notes or a wiki' },
];

export function OscMapPanel({ cameras, presets, settings, oscStatus, onSettings, onClose }: Props) {
  const [format, setFormat] = useState<OscMapFormat>('text');
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const naming: OscNaming = settings.osc.naming ?? 'name';

  const rows = useMemo(() => oscMapRows(cameras, presets, naming), [cameras, presets, naming]);
  const sections = useMemo(() => {
    const out: { title: string; rows: OscMapRow[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.title === r.section) last.rows.push(r);
      else out.push({ title: r.section, rows: [r] });
    }
    return out;
  }, [rows]);

  const q = filter.trim().toLowerCase();
  const matches = (r: OscMapRow) => !q || `${r.address} ${r.args} ${r.desc} ${r.section}`.toLowerCase().includes(q);

  const copy = async (what: string, list: OscMapRow[]) => {
    try {
      await navigator.clipboard.writeText(oscMapText(list, format));
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const setNaming = (n: OscNaming) => onSettings({ osc: { ...settings.osc, naming: n } });

  const host = oscStatus?.addresses?.length ? oscStatus.addresses.join(' or ') : 'this computer';
  const port = oscStatus?.listening ? oscStatus.port : settings.osc.listenPort;

  return (
    <div className="mapping oscmap">
      <div className="maphead">
        <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>OSC MAP</span>
        <span className="mono muted">
          send UDP to {host} port {port}
          {settings.osc.enabled ? '' : ' · listening is OFF (Mapping → OSC)'}
          {settings.osc.feedbackEnabled && settings.osc.feedbackHost ? ` · feedback → ${settings.osc.feedbackHost}:${settings.osc.feedbackPort}` : ''}
        </span>
        <span className="spacer" />
        <input className="input" style={{ height: 30, width: 180, fontSize: 12 }} placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="seg" style={{ width: 'auto' }} title="How cameras appear in addresses and feedback. Incoming messages always accept both forms.">
          <button className={`b sm${naming === 'name' ? ' on' : ''}`} onClick={() => setNaming('name')}>
            By name
          </button>
          <button className={`b sm${naming === 'index' ? ' on' : ''}`} onClick={() => setNaming('index')}>
            By number
          </button>
        </div>
        <div className="seg" style={{ width: 'auto' }}>
          {FORMATS.map((f) => (
            <button key={f.id} className={`b sm${format === f.id ? ' on' : ''}`} onClick={() => setFormat(f.id)} title={f.hint}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="b sm accent" onClick={() => void copy('all', rows.filter(matches))} title="Copy every address in the chosen format">
          {copied === 'all' ? 'Copied' : 'Copy all'}
        </button>
        <button className="b sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="maptable oscmap-body">
        <div className="note" style={{ margin: '8px 12px 4px' }}>
          {naming === 'name' ? (
            <>
              Cameras are addressed by <b>name</b>: lower-case, spaces and punctuation become <span className="mono">_</span> (&quot;Stage Left&quot; → <span className="mono">/cam/stage_left/…</span>). Rack numbers (
              <span className="mono">/cam/1/…</span>) and <span className="mono">sel</span> for the camera on stage work as well. Presets the same way: by name or by their number in the rail. Renaming a camera or preset renames its
              address.
            </>
          ) : (
            <>
              Cameras are addressed by their <b>rack number</b> (CAM 1 → <span className="mono">/cam/1/…</span>); names (<span className="mono">/cam/stage_left/…</span>) and <span className="mono">sel</span> for the camera on stage work
              as well. Preset numbers are the preset&apos;s position in its camera&apos;s rail.
            </>
          )}{' '}
          Buttons: send 1 to press and 0 to release, or just the address. Toggles: 1 on, 0 off, no argument flips.
        </div>
        {sections.map((s) => {
          const shown = s.rows.filter(matches);
          if (shown.length === 0) return null;
          return (
            <div key={s.title} className="oscsec">
              <div className="oscsec-head">
                <span>{s.title}</span>
                <span className="spacer" />
                <button className="b sm" onClick={() => void copy(s.title, shown)}>
                  {copied === s.title ? 'Copied' : 'Copy section'}
                </button>
              </div>
              {shown.map((r, i) => (
                <div key={`${r.address}-${r.args}-${i}`} className={`oscrow${r.kind === 'feedback' ? ' fb' : ''}`}>
                  <span className="mono addr" title="Click to copy this address" onClick={() => void navigator.clipboard.writeText(r.address).catch(() => undefined)}>
                    {r.address}
                  </span>
                  <span className="mono args">{r.args}</span>
                  <span className="desc">{r.desc}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
