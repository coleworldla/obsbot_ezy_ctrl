import { useState } from 'react';
import { ACTIONS, ACTION_GROUPS, describeTrigger, oscAddress, oscAddressList, type Mapping } from '../../../shared/mapping';
import type { CameraConfig, OscStatus, Settings } from '../../../shared/types';
import type { MidiDeviceInfo } from '../control/midi';

export interface MonitorEntry {
  id: number;
  ts: number;
  kind: 'midi' | 'osc' | 'key' | 'out';
  text: string;
}

export interface LearnState {
  actionId: string;
  kind: 'midi' | 'key';
}

interface Props {
  mappings: Mapping[];
  onMappings: (m: Mapping[]) => void;
  onResetMappings: () => void;
  midiDevices: MidiDeviceInfo[];
  midiError: string | null;
  onMidiEnabled: (name: string, on: boolean) => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  oscStatus: OscStatus | null;
  cameras: CameraConfig[];
  monitor: MonitorEntry[];
  learn: LearnState | null;
  onLearn: (l: LearnState | null) => void;
  onClose: () => void;
}

const time = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export function MappingPanel({
  mappings,
  onMappings,
  onResetMappings,
  midiDevices,
  midiError,
  onMidiEnabled,
  settings,
  onSettings,
  oscStatus,
  cameras,
  monitor,
  learn,
  onLearn,
  onClose,
}: Props) {
  const [port, setPort] = useState(String(settings.osc.listenPort));
  const [fbHost, setFbHost] = useState(settings.osc.feedbackHost);
  const [fbPort, setFbPort] = useState(String(settings.osc.feedbackPort));
  const [copied, setCopied] = useState(false);

  const trigger = (actionId: string, type: 'midi' | 'key') => mappings.find((m) => m.actionId === actionId && m.trigger.type === type);
  const clear = (actionId: string, type: 'midi' | 'key') => onMappings(mappings.filter((m) => !(m.actionId === actionId && m.trigger.type === type)));

  const copyAddresses = async () => {
    try {
      await navigator.clipboard.writeText(oscAddressList(cameras.length).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const applyPort = () => {
    const p = Number(port);
    if (Number.isInteger(p) && p > 0 && p < 65536 && p !== settings.osc.listenPort) onSettings({ osc: { ...settings.osc, listenPort: p } });
    else setPort(String(settings.osc.listenPort));
  };

  const applyFeedback = () => {
    const p = Number(fbPort);
    const valid = Number.isInteger(p) && p > 0 && p < 65536;
    onSettings({ osc: { ...settings.osc, feedbackHost: fbHost.trim(), feedbackPort: valid ? p : settings.osc.feedbackPort } });
    if (!valid) setFbPort(String(settings.osc.feedbackPort));
  };

  const midiOn = midiDevices.some((d) => d.connected && d.enabled);

  return (
    <div className="mapping">
      <div className="maphead">
        <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>MAPPING</span>
        <span className="mono muted">MIDI · OSC · keyboard</span>
        <span className="spacer" />
        {learn && (
          <span className="learnhint mono">
            Waiting for {learn.kind === 'midi' ? 'a MIDI note or control…' : 'a key…'}{' '}
            <button className="b sm" onClick={() => onLearn(null)}>
              Cancel
            </button>
          </span>
        )}
        <button className="b sm" onClick={onResetMappings} title="Restore the default keyboard layout and drop all MIDI / OSC bindings">
          Reset to defaults
        </button>
        <button className="b sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="mapbody">
        <div className="maptable">
          <div className="maprow head mono">
            <span>Action</span>
            <span>MIDI</span>
            <span>OSC address (always on)</span>
            <span>Keyboard</span>
          </div>
          {ACTION_GROUPS.map((group) => (
            <div key={group}>
              <div className="mapgroup mono">{group}</div>
              {ACTIONS.filter((a) => a.group === group).map((a) => {
                const midi = trigger(a.id, 'midi');
                const key = trigger(a.id, 'key');
                const learningMidi = learn?.actionId === a.id && learn.kind === 'midi';
                const learningKey = learn?.actionId === a.id && learn.kind === 'key';
                const osc = a.arg === 'preset' ? `${oscAddress(a, 'sel')}/<n>` : a.arg === 'camera' ? `${a.osc} <n>` : a.kind === 'continuous' && a.range ? `${oscAddress(a, 'sel')} <${a.range[0]}..${a.range[1]}>` : oscAddress(a, 'sel');
                return (
                  <div key={a.id} className={`maprow${learningMidi || learningKey ? ' learning' : ''}`}>
                    <span className="mapaction">
                      {a.label}
                      {a.arg && <span className="mono muted"> · {a.arg === 'preset' ? 'note range → preset 1…64' : 'note range → camera 1…9'}</span>}
                    </span>
                    <span className="mapcell">
                      <button className={`chip midi${midi ? '' : ' empty'}${learningMidi ? ' pulse' : ''}`} onClick={() => onLearn(learningMidi ? null : { actionId: a.id, kind: 'midi' })} title="Click, then move a control on your MIDI device">
                        {learningMidi ? 'Waiting for MIDI…' : midi ? describeTrigger(midi.trigger) : 'Learn'}
                      </button>
                      {midi && (
                        <button className="chipx" title="Remove" onClick={() => clear(a.id, 'midi')}>
                          ×
                        </button>
                      )}
                    </span>
                    <span className="mapcell mono osc" title={osc}>
                      {osc}
                    </span>
                    <span className="mapcell">
                      <button className={`chip key${key ? '' : ' empty'}${learningKey ? ' pulse' : ''}`} onClick={() => onLearn(learningKey ? null : { actionId: a.id, kind: 'key' })} title="Click, then press a key">
                        {learningKey ? 'Press a key…' : key ? describeTrigger(key.trigger) : 'Set'}
                      </button>
                      {key && (
                        <button className="chipx" title="Remove" onClick={() => clear(a.id, 'key')}>
                          ×
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mapside">
          <div className="side-section">
            <div className="lbl">
              MIDI inputs <span className={`led${midiOn ? ' on' : ''}`} />
            </div>
            {midiError && <div className="note">{midiError}</div>}
            {!midiError && midiDevices.length === 0 && <div className="note">No MIDI input devices found. Plug one in; it shows up here automatically.</div>}
            {midiDevices.map((d) => (
              <div key={d.id} className={`devrow${d.connected ? '' : ' off'}`}>
                <span className={`led${d.connected && d.enabled ? ' on' : ''}`} />
                <span className="devname">
                  {d.name}
                  {d.manufacturer ? <span className="muted"> · {d.manufacturer}</span> : null}
                </span>
                <button className={`toggle${d.enabled ? ' on' : ''}`} onClick={() => onMidiEnabled(d.name, !d.enabled)} title={d.enabled ? 'Ignore this device' : 'Use this device'}>
                  <span className="dot" />
                </button>
              </div>
            ))}
            <div className="note">Buttons: notes or CC ≥ 64 press, &lt; 64 release. Faders / knobs: CC 0–127 for zoom, jog speed, pan and tilt axes.</div>
          </div>

          <div className="side-section">
            <div className="lbl">
              OSC <span className={`led${oscStatus?.listening ? ' on' : oscStatus?.error ? ' warn' : ''}`} />
            </div>
            <div className="devrow">
              <span className="devname">Listen for OSC</span>
              <button className={`toggle${settings.osc.enabled ? ' on' : ''}`} onClick={() => onSettings({ osc: { ...settings.osc, enabled: !settings.osc.enabled } })}>
                <span className="dot" />
              </button>
            </div>
            <div className="devrow">
              <span className="devname">Listen port (UDP)</span>
              <input className="input mono small" value={port} onChange={(e) => setPort(e.target.value)} onBlur={applyPort} onKeyDown={(e) => e.key === 'Enter' && applyPort()} />
            </div>
            <div className="note mono">
              {oscStatus?.listening ? `listening on ${oscStatus.port}` : oscStatus?.error ? `not listening: ${oscStatus.error}` : 'not listening'}
              {oscStatus && oscStatus.addresses.length > 0 ? ` · this machine ${oscStatus.addresses.join(', ')}` : ''}
            </div>
            <div className="devrow" style={{ marginTop: 8 }}>
              <span className="devname">Send feedback</span>
              <button className={`toggle${settings.osc.feedbackEnabled ? ' on' : ''}`} onClick={() => onSettings({ osc: { ...settings.osc, feedbackEnabled: !settings.osc.feedbackEnabled } })}>
                <span className="dot" />
              </button>
            </div>
            <div className="devrow">
              <span className="devname">Feedback to</span>
              <input className="input mono small" style={{ width: 130 }} placeholder="<ip address>" value={fbHost} onChange={(e) => setFbHost(e.target.value)} onBlur={applyFeedback} onKeyDown={(e) => e.key === 'Enter' && applyFeedback()} />
              <input className="input mono small" style={{ width: 64 }} value={fbPort} onChange={(e) => setFbPort(e.target.value)} onBlur={applyFeedback} onKeyDown={(e) => e.key === 'Enter' && applyFeedback()} />
            </div>
            <div className="note">Feedback: /cam/select, /cam/&lt;i&gt;/preset/active, /cam/&lt;i&gt;/online, /cam/&lt;i&gt;/position (4 Hz).</div>
            <button className="b sm" onClick={() => void copyAddresses()} style={{ marginTop: 6 }}>
              {copied ? 'Copied' : 'Copy address list'}
            </button>
          </div>

          <div className="side-section" style={{ flex: 1, minHeight: 0 }}>
            <div className="lbl">Monitor</div>
            <div className="monitor mono">
              {monitor.length === 0 && <span className="muted">Nothing received yet.</span>}
              {monitor.map((m) => (
                <div key={m.id} className={`mline ${m.kind}`}>
                  <span className="muted">{time(m.ts)}</span> <span className="mkind">{m.kind === 'osc' ? 'OSC ' : m.kind === 'midi' ? 'MIDI' : m.kind === 'out' ? 'OUT ' : 'KEY '}</span> {m.text}
                </div>
              ))}
            </div>
          </div>

          <div className="note">Works with TouchOSC, Bitfocus Companion (generic OSC) and any class-compliant MIDI controller.</div>
        </div>
      </div>
    </div>
  );
}
