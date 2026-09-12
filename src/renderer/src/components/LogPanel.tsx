import { useEffect, useRef, useState } from 'react';
import type { LogEntry, LogLevel } from '../../../shared/types';

interface Props {
  entries: LogEntry[];
  cameraNames: Record<string, string>;
  onClear: () => void;
  onClose: () => void;
}

const time = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export function LogPanel({ entries, cameraNames, onClear, onClose }: Props) {
  const [minLevel, setMinLevel] = useState<LogLevel>('info');
  const [filter, setFilter] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const shown = entries.filter((e) => {
    if (minLevel === 'error' && e.level !== 'error') return false;
    if (minLevel === 'warn' && e.level === 'info') return false;
    if (filter && !`${e.source} ${e.message}`.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (stick.current && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shown.length]);

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.level] += 1;
      return acc;
    },
    { info: 0, warn: 0, error: 0 } as Record<LogLevel, number>,
  );

  return (
    <div className="logpanel">
      <div className="loghead">
        <span style={{ fontWeight: 700 }}>Log</span>
        <span className="mono muted">
          {counts.error} errors · {counts.warn} warnings · {counts.info} info
        </span>
        <div className="seg" style={{ width: 220 }}>
          {(['info', 'warn', 'error'] as LogLevel[]).map((l) => (
            <button key={l} className={`b sm${minLevel === l ? ' on' : ''}`} onClick={() => setMinLevel(l)}>
              {l === 'info' ? 'All' : l === 'warn' ? 'Warn+' : 'Errors'}
            </button>
          ))}
        </div>
        <input className="input" style={{ height: 30, width: 200, fontSize: 12 }} placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="spacer" />
        <button className="b sm" onClick={() => void window.ezy.log.reveal()} title="Show the log file in Explorer">
          Open log file
        </button>
        <button className="b sm" onClick={onClear}>
          Clear
        </button>
        <button className="b sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div
        className="logbody mono"
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
      >
        {shown.length === 0 && <div className="muted">Nothing logged yet.</div>}
        {shown.map((e) => (
          <div key={e.id} className={`logline ${e.level}`}>
            <span className="lt">{time(e.ts)}</span>
            <span className={`ll ${e.level}`}>{e.level.toUpperCase()}</span>
            <span className="ls">{e.source}</span>
            {e.cameraId && cameraNames[e.cameraId] && !e.message.startsWith(cameraNames[e.cameraId]) && (
              <span className="lc">{cameraNames[e.cameraId]}</span>
            )}
            <span className="lm">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
