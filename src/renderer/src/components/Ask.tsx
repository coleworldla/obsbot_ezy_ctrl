/**
 * In-window replacements for window.confirm / window.prompt. On Windows the native confirm leaves the
 * page's text fields unable to take typing until the user switches to another window and back
 * (electron/electron#40212), and Electron does not implement prompt() at all.
 */
import { useEffect, useRef, useState } from 'react';

export interface AskOptions {
  title: string;
  detail?: string;
  /** Label of the confirming button. */
  ok?: string;
  danger?: boolean;
  /** Ask for a value: the field starts with this text. */
  value?: string;
  /** Label above the field. */
  label?: string;
  /** Why the typed value cannot be used, or null when it can. */
  validate?: (value: string) => string | null;
}

interface Request extends AskOptions {
  resolve: (value: string | null) => void;
}

let show: ((r: Request) => void) | null = null;

/** Ask in the window; resolves with the field's text ('' without a field), or null when cancelled. */
export function ask(opts: AskOptions): Promise<string | null> {
  return new Promise((resolve) => (show ? show({ ...opts, resolve }) : resolve(null)));
}

export const confirmAsk = async (opts: AskOptions): Promise<boolean> => (await ask(opts)) !== null;

/** Rendered once by App; shows whatever ask() was last called with. */
export function AskHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [text, setText] = useState('');
  const current = useRef<Request | null>(null);

  useEffect(() => {
    show = (r) => {
      current.current?.resolve(null);
      current.current = r;
      setText(r.value ?? '');
      setReq(r);
    };
    return () => {
      show = null;
    };
  }, []);

  const close = (value: string | null) => {
    current.current?.resolve(value);
    current.current = null;
    setReq(null);
  };

  if (!req) return null;
  const field = req.value !== undefined;
  const problem = field ? (req.validate?.(text) ?? null) : null;
  const submit = () => {
    if (!problem) close(field ? text : '');
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div
        className="dialog ask"
        // Keys stay in the dialog: digits and letters behind it recall presets and jog the camera.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') close(null);
          else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) submit();
        }}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <div>
          <h3>{req.title}</h3>
          {req.detail && <div className="sub">{req.detail}</div>}
        </div>
        {field && (
          <div className="field">
            {req.label && <span className="lbl">{req.label}</span>}
            <input className="input mono" autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
            {problem && text.trim() !== '' && <span className="note warn-text">{problem}</span>}
          </div>
        )}
        <div className="foot">
          <span className="spacer" />
          <button className="b" onClick={() => close(null)}>
            Cancel
          </button>
          <button className={`b ${req.danger ? 'danger' : 'primary'}`} autoFocus={!field} disabled={!!problem} onClick={submit}>
            {req.ok ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
