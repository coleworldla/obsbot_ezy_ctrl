import { useEffect, useState } from 'react';
import { DEFAULT_VISCA_PORT, defaultVideoUrl, type CameraConfig, type NdiSource, type NdiStatus, type TestResult, type VideoSource } from '../../../shared/types';
import { listVideoInputs, type VideoInput } from '../video/webcam';

interface Props {
  /** When set, the dialog edits this camera instead of adding a new one. */
  existing?: CameraConfig;
  onClose: () => void;
  onSaved: (cam: CameraConfig) => void;
}

const SOURCES: { id: VideoSource; label: string }[] = [
  { id: 'ndi', label: 'NDI' },
  { id: 'rtsp', label: 'RTSP' },
  { id: 'srt', label: 'SRT' },
  { id: 'webui', label: 'Web UI' },
  { id: 'webcam', label: 'Webcam' },
  { id: 'demo', label: 'Demo' },
];

const NOTES: Record<VideoSource, string> = {
  rtsp: 'Turn on RTSP mode on the camera first: OBSBOT Center → More → Output → RTSP. Default stream: rtsp://<ip>:8554/live.',
  srt: 'Camera: OBSBOT Center → More → SRT Settings → Listener mode (default port 5000), then Output → SRT. The app connects as caller. If you enabled encryption, append ?passphrase=YOURKEY to the address.',
  webui: "Shows the camera's own web page (login Admin / Admin on first use). Works in any output mode, including NDI.",
  webcam: 'Any video device this computer can see: the Tail 2 over USB-C (UVC mode), or an NDI source turned into a webcam with NDI Tools → Webcam Input. Pick the device below.',
  ndi: 'Camera: OBSBOT Center → More → Output → NDI (licence already on the camera). The app receives the NDI proxy stream directly through the NDI runtime on this computer (installed with NDI Tools). Leave the source on Auto to pick the camera by its IP. A camera on Wi-Fi and Ethernet at once may advertise NDI from its other address; pick the source by name then.',
  demo: 'Built-in moving test pattern, no camera needed. Controls stay offline unless an IP is given.',
};

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+\.local$/i;

export function CameraDialog({ existing, onClose, onSaved }: Props) {
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.viscaPort ?? DEFAULT_VISCA_PORT));
  const [source, setSource] = useState<VideoSource>(existing?.videoSource ?? 'rtsp');
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? '');
  const [urlTouched, setUrlTouched] = useState(() => !!existing && existing.videoUrl !== defaultVideoUrl(existing.videoSource, existing.host));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<VideoInput[] | null>(null);
  const [ndiStatus, setNdiStatus] = useState<NdiStatus | null>(null);
  const [ndiSources, setNdiSources] = useState<NdiSource[] | null>(null);

  const refreshNdi = async () => {
    setNdiSources(null);
    const [status, list] = await Promise.all([window.ezy.ndi.status(), window.ezy.ndi.sources()]);
    setNdiStatus(status);
    setNdiSources(list);
  };

  useEffect(() => {
    if (source === 'ndi') void refreshNdi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (source !== 'webcam') return;
    let cancelled = false;
    setDevices(null);
    void listVideoInputs().then((list) => {
      if (cancelled) return;
      setDevices(list);
      if (list.length && !list.some((d) => d.deviceId === videoUrl)) {
        setVideoUrl(list[0].deviceId);
        setUrlTouched(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const effectiveUrl = urlTouched ? videoUrl : defaultVideoUrl(source, host || '<ip>');
  const portNum = Number(port);
  const hostOk = source === 'demo' ? host.trim() === '' || IP_RE.test(host.trim()) : IP_RE.test(host.trim());
  const valid = hostOk && Number.isInteger(portNum) && portNum > 0 && portNum < 65536 && (source !== 'webcam' || !!videoUrl);

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
    setError(null);
    try {
      const h = host.trim() || (source === 'demo' ? '127.0.0.1' : '');
      const cfg = {
        name: name.trim() || (source === 'demo' ? 'Demo pattern' : h),
        host: h,
        viscaPort: portNum,
        videoSource: source,
        // For NDI the "URL" is the source name ('' = pick by IP); for Webcam it is the device id.
        videoUrl: urlTouched ? videoUrl.trim() : defaultVideoUrl(source, h),
      };
      const cam = existing ? await window.ezy.cameras.update({ ...existing, ...cfg }) : await window.ezy.cameras.add(cfg);
      onSaved(cam);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const pickSource = (s: VideoSource) => {
    setSource(s);
    setUrlTouched(false);
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div>
          <h3>{editing ? 'Edit camera' : 'Add camera'}</h3>
          <div className="sub">{editing ? 'Changing the IP or video source reconnects the camera right away.' : 'OBSBOT Tail 2 on your local network'}</div>
        </div>

        <div className="field">
          <span className="lbl">Name</span>
          <input className="input" autoFocus placeholder="Stage Left" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="two">
          <div className="field">
            <span className="lbl">IP address</span>
            <input
              className="input mono"
              placeholder="<ip address>"
              value={host}
              onChange={(e) => {
                setHost(e.target.value);
                setResult(null);
              }}
            />
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
              <button key={s.id} className={`b${source === s.id ? ' on' : ''}`} onClick={() => pickSource(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {source === 'ndi' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="input"
                value={urlTouched ? videoUrl : ''}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  setUrlTouched(e.target.value !== '');
                }}
              >
                <option value="">Auto — the NDI source at {host.trim() || 'this IP'}</option>
                {ndiSources?.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                    {s.url ? ` (${s.url})` : ''}
                  </option>
                ))}
              </select>
              <button className="b sm" onClick={() => void refreshNdi()} disabled={ndiSources === null} title="Search the network again">
                {ndiSources === null ? 'Searching…' : 'Refresh'}
              </button>
            </div>
          )}
          {source === 'ndi' && ndiStatus && (
            <span className={`note${ndiStatus.available ? '' : ' warn-text'}`}>
              {ndiStatus.available
                ? `NDI runtime ${ndiStatus.version ?? ''} found${ndiSources ? ` · ${ndiSources.length} source${ndiSources.length === 1 ? '' : 's'} on the network` : ''}`
                : (ndiStatus.error ?? 'NDI runtime not found')}
            </span>
          )}
          {source === 'webcam' && (
            <select
              className="input"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setUrlTouched(true);
              }}
              disabled={!devices || devices.length === 0}
            >
              {devices === null && <option value="">Looking for video devices…</option>}
              {devices?.length === 0 && <option value="">No video devices found</option>}
              {devices?.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          {source !== 'ndi' && source !== 'demo' && source !== 'webcam' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="input mono"
                style={{ fontSize: 13 }}
                value={effectiveUrl}
                onChange={(e) => {
                  setUrlTouched(true);
                  setVideoUrl(e.target.value);
                }}
                title="Stream or page address; edit it if your camera uses a different port or path"
              />
              {urlTouched && (
                <button className="b sm" onClick={() => setUrlTouched(false)} title="Back to the default address for this source">
                  Default
                </button>
              )}
            </div>
          )}
          <span className="note">{NOTES[source]}</span>
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
        {error && <div className="result bad">{error}</div>}

        <div className="foot">
          <button className="b sm" disabled={!valid || testing} onClick={() => void test()}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <span className="spacer" />
          <button className="b" onClick={onClose}>
            Cancel
          </button>
          <button className="b primary" disabled={!valid || saving} onClick={() => void save()}>
            {editing ? 'Save' : 'Add camera'}
          </button>
        </div>
      </div>
    </div>
  );
}
