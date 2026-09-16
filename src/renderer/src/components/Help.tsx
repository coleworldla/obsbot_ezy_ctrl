import type { AppInfo, UpdateStatus } from '../../../shared/types';

interface Props {
  info: AppInfo | null;
  update: UpdateStatus | null;
  autoCheck: boolean;
  onAutoCheck: (on: boolean) => void;
  onCheck: () => void;
  onInstall: () => void;
  onAddCamera: () => void;
  onDemo: () => void;
  /** Rendered inside the stage when there is no camera yet (no Close button). */
  inline?: boolean;
  onClose?: () => void;
}

const link = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {label}
  </a>
);

export function updateLabel(u: UpdateStatus | null): string {
  if (!u) return '';
  switch (u.state) {
    case 'unsupported':
      return u.message ?? 'updates only work in the installed app';
    case 'idle':
      return 'not checked yet';
    case 'checking':
      return 'checking…';
    case 'none':
      return `up to date${u.checkedAt ? ` (checked ${new Date(u.checkedAt).toLocaleTimeString()})` : ''}`;
    case 'available':
      return `version ${u.version} found, downloading…`;
    case 'downloading':
      return `downloading version ${u.version ?? ''} · ${u.percent ?? 0}%`;
    case 'downloaded':
      return `version ${u.version} is ready — restart to install`;
    case 'error':
      return `update check failed: ${u.message ?? 'unknown error'}`;
  }
}

export function Help({ info, update, autoCheck, onAutoCheck, onCheck, onInstall, onAddCamera, onDemo, inline = false, onClose }: Props) {
  return (
    <div className={`help${inline ? ' inline' : ''}`}>
      <div className="helphead">
        <span style={{ fontWeight: 700 }}>{inline ? 'Welcome to EZY CTRL' : 'Help'}</span>
        <span className="mono muted">
          v{info?.version ?? '…'} · {info?.platform === 'darwin' ? 'macOS' : info?.platform === 'win32' ? 'Windows' : info?.platform ?? ''}
        </span>
        <span className="spacer" />
        {!inline && (
          <button className="b sm" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="helpbody">
        <section className="helpcol">
          <div className="lbl">Get a Tail 2 on screen</div>
          <ol className="steps">
            <li>
              Power the camera and put it on the same network as this computer: Ethernet into the LAN / PoE+ port, or join it to your Wi-Fi from the Obsbot Start app.
            </li>
            <li>
              Find its IP address: OBSBOT Center → Settings → Device Management, Obsbot Start → More → About device → Network, or your router's client list. The camera's own web page is at <span className="mono">http://&lt;ip&gt;</span> (login Admin / Admin).
            </li>
            <li>
              Turn on a video output: OBSBOT Center → More → Output → <b>NDI</b> (licence on the camera; the computer needs the NDI runtime that comes with NDI Tools) or <b>RTSP</b>. Only one output mode runs at a time, so use the one your switcher or media server takes and give the app the same source.
            </li>
            <li>
              Press <b>Add camera</b>, type the IP, hit <b>Test connection</b>. A reply with pan / tilt / zoom means control works; the picture follows once RTSP mode is on.
            </li>
          </ol>
          <div className="note">
            Not a Tail 2? An SDI-to-NDI encoder, another camera or your media server's output goes in as <b>Add camera → Video only</b>: pick its NDI name or stream address and it sits in the rack with picture and tally, no controls.
          </div>
          <div className="helpbtns">
            <button className="b primary" onClick={onAddCamera}>
              Add camera
            </button>
            <button className="b" onClick={onDemo} title="A moving test pattern with a simulated camera, no hardware needed">
              Try the demo
            </button>
          </div>
          <div className="note">
            More from OBSBOT: {link('https://www.obsbot.com/explore/obsbot-tail-2/web-ui-user-guide', 'Web UI guide')} · {link('https://www.obsbot.com/explore/obsbot-tail-air/visca-over-ip', 'VISCA over IP')} ·{' '}
            {link('https://www.obsbot.com/explore/obsbot-tail-2/srt-protocol', 'SRT setup')}
          </div>
        </section>

        <section className="helpcol">
          <div className="lbl">Driving it</div>
          <table className="keys mono">
            <tbody>
              <tr>
                <td>Q W E / A D / Z S C</td>
                <td>jog</td>
              </tr>
              <tr>
                <td>H</td>
                <td>home</td>
              </tr>
              <tr>
                <td>− / =</td>
                <td>zoom wide / tele</td>
              </tr>
              <tr>
                <td>[ / ]</td>
                <td>jog speed</td>
              </tr>
              <tr>
                <td>1 … 9</td>
                <td>recall preset</td>
              </tr>
              <tr>
                <td>Ctrl+S</td>
                <td>save preset</td>
              </tr>
              <tr>
                <td>Ctrl+1 … 9</td>
                <td>select camera</td>
              </tr>
              <tr>
                <td>T / R / O / F</td>
                <td>track / record / rotate / AF push</td>
              </tr>
              <tr>
                <td>I / M / L</td>
                <td>camera settings / mapping / log</td>
              </tr>
            </tbody>
          </table>
          <div className="note">
            Every key, MIDI control and OSC address lives in <b>Mapping</b>: click Learn on a row and move a control. OSC listens on UDP 9000 with addresses like <span className="mono">/cam/1/preset/4</span>; the panel has a copyable address list for TouchOSC or Companion.
          </div>
          <div className="note">
            Presets are unlimited and stored in this app with a thumbnail. Right-click a camera in the rack for program / preview tally. When something misbehaves, open <b>Log</b>.
          </div>
        </section>

        <section className="helpcol">
          <div className="lbl">Updates</div>
          <div className="devrow">
            <span className="devname">Check for updates on startup</span>
            <button className={`toggle${autoCheck ? ' on' : ''}`} onClick={() => onAutoCheck(!autoCheck)}>
              <span className="dot" />
            </button>
          </div>
          <div className="note mono">{updateLabel(update)}</div>
          <div className="helpbtns">
            <button className="b sm" disabled={!info?.packaged || update?.state === 'checking' || update?.state === 'downloading'} onClick={onCheck}>
              Check now
            </button>
            {update?.state === 'downloaded' && (
              <button className="b sm primary" onClick={onInstall}>
                Restart to update
              </button>
            )}
          </div>
          <div className="note">
            Releases: {link('https://github.com/coleworldla/obsbot_ezy_ctrl/releases', 'github.com/coleworldla/obsbot_ezy_ctrl/releases')}. Builds are unsigned: Windows SmartScreen asks once (More info → Run anyway); on macOS
            on macOS open System Settings → Privacy and Security, scroll to Security and click Open Anyway (macOS 13–14: right-click the app → Open); allow local network access when asked. If it says the app is damaged, run <span className="mono">xattr -cr "/Applications/EZY CTRL.app"</span> once. Full steps in the README.
          </div>
        </section>
      </div>
    </div>
  );
}
