import { useMemo, useState } from 'react';
import { namesList, namesText, oscMapRows, oscMapText, type NamesFormat, type OscMapFormat, type OscMapRow, type OscNaming } from '../../../shared/mapping';
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
  { id: 'addresses', label: 'Addresses', hint: 'one address per line — paste straight into TouchOSC, Companion, Resolume, TouchDesigner…' },
  { id: 'text', label: 'With notes', hint: 'address, argument and what it does on one line each' },
  { id: 'csv', label: 'CSV', hint: 'section,address,argument,description,direction — for spreadsheets and Companion imports' },
  { id: 'markdown', label: 'Markdown', hint: 'a table for show notes or a wiki' },
];

export function OscMapPanel({ cameras, presets, settings, oscStatus, onSettings, onClose }: Props) {
  const [format, setFormat] = useState<OscMapFormat>('addresses');
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  const copyOne = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRow(key);
      window.setTimeout(() => setCopiedRow((c) => (c === key ? null : c)), 1200);
    } catch {
      /* clipboard blocked */
    }
  };
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const naming: OscNaming = settings.osc.naming ?? 'name';

  const rows = useMemo(() => oscMapRows(cameras, presets, naming), [cameras, presets, naming]);
  const names = useMemo(() => namesList(cameras, presets, naming), [cameras, presets, naming]);
  const [copiedNames, setCopiedNames] = useState<NamesFormat | null>(null);
  const copyNames = async (f: NamesFormat) => {
    try {
      await navigator.clipboard.writeText(namesText(names, f));
      setCopiedNames(f);
      window.setTimeout(() => setCopiedNames((c) => (c === f ? null : c)), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
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
        {!q && (
          <div className="oscsec names" id="osc-names">
            <div className="oscsec-head">
              <span>Names</span>
              <span className="mono muted" style={{ fontWeight: 400 }}>
                what you typed → how it appears in OSC
              </span>
              <span className="spacer" />
              <button className="b sm" onClick={() => void copyNames('names')} title="Camera and preset names, one per line">
                {copiedNames === 'names' ? 'Copied' : 'Copy names'}
              </button>
              <button className="b sm" onClick={() => void copyNames('osc')} title="The OSC form of each name, one per line">
                {copiedNames === 'osc' ? 'Copied' : 'Copy OSC names'}
              </button>
              <button className="b sm" onClick={() => void copyNames('both')} title="Name and address side by side">
                {copiedNames === 'both' ? 'Copied' : 'Copy both'}
              </button>
              <button className="b sm" onClick={() => void copyNames('csv')} title="kind, number, name, osc_name, address, camera">
                {copiedNames === 'csv' ? 'Copied' : 'CSV'}
              </button>
            </div>
            {names.length === 0 && <div className="oscrow"><span className="desc">No cameras yet.</span></div>}
            {names.map((r, i) => (
              <div key={`${r.kind}-${i}`} className={`oscrow namerow${r.kind === 'preset' ? ' preset' : ''}`}>
                <span className="nm" title="Click to copy the name" onClick={() => void navigator.clipboard.writeText(r.name).catch(() => undefined)}>
                  {r.kind === 'camera' ? <span className="mono muted">CAM {r.index} </span> : <span className="mono muted">P{r.index} </span>}
                  {r.name}
                  {r.monitor ? <span className="muted"> (video only)</span> : null}
                </span>
                <span className="mono args" title="Click to copy the OSC name" onClick={() => void navigator.clipboard.writeText(r.slug).catch(() => undefined)}>
                  {r.slug || '—'}
                </span>
                <span className="mono addr" title="Click to copy this address" onClick={() => void navigator.clipboard.writeText(r.address).catch(() => undefined)}>
                  {r.address}
                </span>
                <button className="b xs" onClick={() => void copyOne(r.address, `name/${i}`)} title="Copy this address">
                  {copiedRow === `name/${i}` ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        )}
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
                  <button className="b xs" onClick={() => void copyOne(r.address, `${s.title}/${i}`)} title="Copy this address">
                    {copiedRow === `${s.title}/${i}` ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
