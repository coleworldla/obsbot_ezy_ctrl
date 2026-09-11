import { useState } from 'react';
import { DEFAULT_VISCA_PORT, defaultVideoUrl, type CameraConfig, type TestResult, type VideoSource } from '../../../shared/types';

interface Props {
  onClose: () => void;
  onAdded: (cam: CameraConfig) => void;
}

const SOURCES: { id: VideoSource; label: string }[] = [
  { id: 'rtsp', label: 'RTSP' },
  { id: 'ndi', label: 'NDI' },
  { id: 'srt', label: 'SRT' },
  { id: 'webui', label: 'Web UI' },
];

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+\.local$/i;

export function AddCamera({ onClose, onAdded }: Props) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(DEFAULT_VISCA_PORT));
  const [source, setSource] = useState<VideoSource>('rtsp');
  const [videoUrl, setVideoUrl] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveUrl = urlTouched ? videoUrl : defaultVideoUrl(source, host || '<ip>');
  const portNum = Number(port);
  const valid = IP_RE.test(host.trim()) && Number.isInteger(portNum) && portNum > 0 && portNum < 65536;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await window.ezy.camera.test(host.trim(), portNum));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const cam = await window.ezy.cameras.add({
        name: name.trim() || host.trim(),
        host: host.trim(),
        viscaPort: portNum,
        videoSource: source,
        videoUrl: urlTouched ? videoUrl : defaultVideoUrl(source, host.trim()),
      });
      onAdded(cam);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div>
          <h3>Add camera</h3>
          <div className="sub">OBSBOT Tail 2 on your local network</div>
        </div>

        <div className="field">
          <span className="lbl">Name</span>
          <input className="input" autoFocus placeholder="Stage Left" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="two">
          <div className="field">
            <span className="lbl">IP address</span>
            <input className="input mono" placeholder="<ip address>" value={host} onChange={(e) => { setHost(e.target.value); setResult(null); }} />
          </div>
          <div className="field">
            <span className="lbl">VISCA port (UDP)</span>
            <input className="input mono" value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <span className="lbl">Video</span>
          <div className="seg">
            {SOURCES.map((s) => (
              <button key={s.id} className={`b${source === s.id ? ' on' : ''}`} onClick={() => { setSource(s.id); setUrlTouched(false); }}>
                {s.label}
              </button>
            ))}
          </div>
          {source !== 'ndi' && (
            <input className="input mono" style={{ fontSize: 13 }} value={effectiveUrl} onChange={(e) => { setUrlTouched(true); setVideoUrl(e.target.value); }} />
          )}
          <span className="note">
            {source === 'rtsp' && 'Turn on RTSP mode on the camera first: OBSBOT Center → More → Output → RTSP.'}
            {source === 'ndi' && 'NDI needs a licence key on the camera. The NDI viewport is planned for later.'}
            {source === 'srt' && 'Set the camera to SRT listener mode (default port 5000).'}
            {source === 'webui' && 'Opens the camera web page (login Admin / Admin on first use).'}
          </span>
        </div>

        {result && (
          <div className={`result ${result.ok ? 'ok' : 'bad'}`}>
            <span className={`led${result.ok ? ' on' : ''}`} />
            <div>
              <div className="t">{result.ok ? 'Camera found' : 'No reply'}</div>
              <div className="d">
                {result.ok && result.position
                  ? `pan ${result.position.panDeg.toFixed(1)}° tilt ${result.position.tiltDeg.toFixed(1)}° zoom ${result.position.zoomRatio.toFixed(1)}× · ${result.latencyMs} ms`
                  : result.error}
              </div>
            </div>
          </div>
        )}

        <div className="foot">
          <button className="b sm" disabled={!valid || testing} onClick={() => void test()}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <span className="spacer" />
          <button className="b" onClick={onClose}>
            Cancel
          </button>
          <button className="b primary" disabled={!valid || saving} onClick={() => void save()}>
            Add camera
          </button>
        </div>
      </div>
    </div>
  );
}
