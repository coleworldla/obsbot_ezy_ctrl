import { useEffect, useState } from 'react';
import { DEFAULT_VISCA_PORT, defaultVideoUrl, type CameraConfig, type CameraKind, type NdiSource, type NdiStatus, type TestResult, type VideoSource } from '../../../shared/types';
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

const KINDS: { id: CameraKind; label: string; hint: string }[] = [
  { id: 'tail2', label: 'OBSBOT Tail 2', hint: 'Pan / tilt / zoom over VISCA, presets, camera settings and the picture.' },
  { id: 'monitor', label: 'Video only', hint: 'Picture and tally only: an SDI / NDI encoder, another camera, a media server output.' },
];

const NOTES: Record<VideoSource, string> = {
  rtsp: 'Turn on RTSP mode on the camera first: OBSBOT Center → More → Output → RTSP. Default stream: rtsp://<ip>:8554/live.',
  srt: 'Camera: OBSBOT Center → More → SRT Settings → Listener mode (default port 5000), then Output → SRT. The app connects as caller. If you enabled encryption, append ?passphrase=YOURKEY to the address.',
  webui: "Shows the camera's own web page (login Admin / Admin on first use). Works in any output mode, including NDI.",
  webcam: 'Any video device this computer can see: the Tail 2 over USB-C (UVC mode), or an NDI source turned into a webcam with NDI Tools → Webcam Input. Pick the device below.',
  ndi: 'Camera: OBSBOT Center → More → Output → NDI (licence already on the camera). The app receives the NDI proxy stream directly through the NDI runtime on this computer (installed with NDI Tools). Leave the source on Auto to pick the camera by its IP. A camera on Wi-Fi and Ethernet at once may advertise NDI from its other address; pick the source by name then.',
  demo: 'Built-in moving test pattern, no camera needed. Controls stay offline unless an IP is given.',
};

const MONITOR_NOTES: Record<VideoSource, string> = {
  ndi: "Pick the NDI source by name. Type the device's IP address first and the app asks it directly, which finds encoders that do not announce themselves on the network (or sit on another subnet).",
  rtsp: "The stream address from the device's web page or manual, e.g. rtsp://<ip>:554/… (H.264 or H.265, no re-encoding).",
  srt: 'srt://<ip>:<port> with the device in listener mode; the app connects as caller. Append ?passphrase=YOURKEY if the stream is encrypted.',
  webui: "Shows the device's own web page inside the app.",
  webcam: 'Any video device this computer can see: a capture card, a USB camera, or NDI Tools → Webcam Input.',
  demo: 'Built-in moving test pattern.',
};

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+\.local$/i;
const DOTTED_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
/** "ZOWIEBOX-SDI-46014 (ZowieBox-SDI-46014)" → "ZowieBox-SDI-46014" */
const shortNdiName = (name: string) => /\(([^)]+)\)\s*$/.exec(name)?.[1] ?? name;

export function CameraDialog({ existing, onClose, onSaved }: Props) {
  const editing = !!existing;
  const [kind, setKind] = useState<CameraKind>(existing?.kind ?? 'tail2');
  const monitor = kind === 'monitor';
  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.viscaPort ?? DEFAULT_VISCA_PORT));
  const [source, setSource] = useState<VideoSource>(existing?.videoSource ?? 'rtsp');
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? '');
  const [urlTouched, setUrlTouched] = useState(() => !!existing && existing.videoUrl !== defaultVideoUrl(existing.videoSource, existing.host, existing.kind));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<VideoInput[] | null>(null);
  const [ndiStatus, setNdiStatus] = useState<NdiStatus | null>(null);
  const [ndiSources, setNdiSources] = useState<NdiSource[] | null>(null);
  const [queriedIp, setQueriedIp] = useState<string | null>(null);
  /** Shown under Type after the dialog switched it on its own. */
  const [kindNote, setKindNote] = useState<string | null>(null);

  const trimmedHost = host.trim();
  const hostGiven = trimmedHost !== '';

  const refreshNdi = async (extraIp?: string) => {
    setNdiSources(null);
    if (extraIp) setQueriedIp(extraIp);
    const [status, list] = await Promise.all([window.ezy.ndi.status(), window.ezy.ndi.sources(extraIp)]);
    setNdiStatus(status);
    setNdiSources(list);
  };

  useEffect(() => {
    if (source === 'ndi') void refreshNdi(DOTTED_RE.test(trimmedHost) ? trimmedHost : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Once a full IP is typed, ask that address for its NDI sources (devices that mDNS does not surface).
  useEffect(() => {
    if (source !== 'ndi' || !DOTTED_RE.test(trimmedHost) || trimmedHost === queriedIp) return;
    const t = window.setTimeout(() => void refreshNdi(trimmedHost), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedHost, source]);

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

  const effectiveUrl = urlTouched ? videoUrl : defaultVideoUrl(source, trimmedHost || '<ip>', kind);
  const portNum = Number(port);
  const hostOk = hostGiven ? IP_RE.test(trimmedHost) : monitor || source === 'demo';
  const portOk = monitor || (Number.isInteger(portNum) && portNum > 0 && portNum < 65536);
  const urlOk =
    source === 'ndi'
      ? (urlTouched && videoUrl.trim() !== '') || hostGiven
      : source === 'webcam'
        ? !!videoUrl
        : source === 'demo'
          ? true
          : urlTouched
            ? videoUrl.trim() !== ''
            : hostGiven;
  const valid = hostOk && portOk && urlOk;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await window.ezy.camera.test(trimmedHost, portNum));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const h = trimmedHost || (source === 'demo' && !monitor ? '127.0.0.1' : '');
      const ndiName = source === 'ndi' && urlTouched ? videoUrl.trim() : '';
      const fallbackName = ndiName ? shortNdiName(ndiName) : source === 'demo' ? 'Demo pattern' : h || (monitor ? 'Monitor' : '');
      const cfg = {
        name: name.trim() || fallbackName,
        host: h,
        viscaPort: monitor ? DEFAULT_VISCA_PORT : portNum,
        videoSource: source,
        // For NDI the "URL" is the source name ('' = pick by IP); for Webcam it is the device id.
        videoUrl: urlTouched ? videoUrl.trim() : defaultVideoUrl(source, h, kind),
        kind,
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

  const pickKind = (k: CameraKind) => {
    if (k === kind) return;
    setKind(k);
    setKindNote(null);
    setResult(null);
    setUrlTouched(false);
    if (!editing) setSource(k === 'monitor' ? 'ndi' : 'rtsp');
  };

  const title = editing ? (monitor ? 'Edit video source' : 'Edit camera') : monitor ? 'Add video source' : 'Add camera';
  const sub = editing ? 'Changing the address or video source reconnects right away.' : monitor ? KINDS[1].hint : 'OBSBOT Tail 2 on your local network';

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div>
          <h3>{title}</h3>
          <div className="sub">{sub}</div>
        </div>

        <div className="field">
          <span className="lbl">Type</span>
          <div className="seg">
            {KINDS.map((k) => (
              <button key={k.id} className={`b${kind === k.id ? ' on' : ''}`} onClick={() => pickKind(k.id)} title={k.hint}>
                {k.label}
              </button>
            ))}
          </div>
          {kindNote && <span className="note">{kindNote}</span>}
        </div>

        <div className="field">
          <span className="lbl">Name</span>
          <input className="input" autoFocus placeholder={monitor ? 'SDI encoder' : 'Stage Left'} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className={monitor ? 'field' : 'two'}>
          <div className="field">
            <span className="lbl">IP address{monitor ? ' (optional)' : ''}</span>
            <input
              className="input mono"
              placeholder={monitor ? '<ip address>' : '<ip address>'}
              value={host}
              onChange={(e) => {
                setHost(e.target.value);
                setResult(null);
              }}
            />
          </div>
          {!monitor && (
            <div className="field">
              <span className="lbl">VISCA port (UDP)</span>
              <input className="input mono" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          )}
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
                  const v = e.target.value;
                  setVideoUrl(v);
                  setUrlTouched(v !== '');
                  // Picking a source that is plainly not a Tail 2 while adding: make it a monitor, and say so.
                  if (!editing && v && kind === 'tail2' && !/TAIL ?2/i.test(v)) {
                    setKind('monitor');
                    setKindNote(`"${shortNdiName(v)}" does not look like a Tail 2, so Type switched to Video only. Switch it back if this is a PTZ camera the app should drive over VISCA.`);
                  }
                }}
              >
                <option value="">{hostGiven ? `Auto — the NDI source at ${trimmedHost}` : monitor ? 'Choose an NDI source…' : 'Auto — the NDI source at this IP'}</option>
                {ndiSources?.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                    {s.url ? ` (${s.url})` : ''}
                  </option>
                ))}
              </select>
              <button
                className="b sm"
                onClick={() => void refreshNdi(DOTTED_RE.test(trimmedHost) ? trimmedHost : undefined)}
                disabled={ndiSources === null}
                title="Search the network again"
              >
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
          {source === 'ndi' && ndiStatus && !ndiStatus.available && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ndiStatus.downloadUrl && (
                <a className="b sm" href={ndiStatus.downloadUrl} target="_blank" rel="noreferrer" title={ndiStatus.downloadUrl}>
                  Get the NDI runtime
                </a>
              )}
              <button
                className="b sm"
                onClick={() =>
                  void window.ezy.ndi.locate().then((st) => {
                    setNdiStatus(st);
                    if (st.available) void refreshNdi(DOTTED_RE.test(trimmedHost) ? trimmedHost : undefined);
                  })
                }
                title="Point the app at the runtime library yourself"
              >
                Locate runtime…
              </button>
            </div>
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
                title="Stream or page address; edit it if your device uses a different port or path"
              />
              {urlTouched && (
                <button className="b sm" onClick={() => setUrlTouched(false)} title="Back to the default address for this source">
                  Default
                </button>
              )}
            </div>
          )}
          <span className="note">{(monitor ? MONITOR_NOTES : NOTES)[source]}</span>
        </div>

        {result && (
          <div className={`result ${result.ok ? 'ok' : 'bad'}`}>
            <span className={`led${result.ok ? ' on' : ''}`} />
            <div>
              <div className="t">{result.ok ? 'Camera found' : 'No reply'}</div>
              <div className="d">
                {result.ok && result.position
                  ? `pan ${result.position.panDeg.toFixed(1)}° tilt ${result.position.tiltDeg.toFixed(1)}° zoom ${result.position.zoomRatio.toFixed(1)}× · ${result.latencyMs} ms`
                  : `${result.error ?? 'no reply'}. Check the camera is on the same network as this computer. Only if this device is not a Tail 2: set Type to Video only.`}
              </div>
            </div>
          </div>
        )}
        {error && <div className="result bad">{error}</div>}

        <div className="foot">
          {!monitor && (
            <button className="b sm" disabled={!valid || testing} onClick={() => void test()}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          )}
          <span className="spacer" />
          <button className="b" onClick={onClose}>
            Cancel
          </button>
          <button className="b primary" disabled={!valid || saving} onClick={() => void save()}>
            {editing ? 'Save' : monitor ? 'Add source' : 'Add camera'}
          </button>
        </div>
      </div>
    </div>
  );
}
