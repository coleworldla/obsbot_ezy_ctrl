import { Fragment, useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown on the right, e.g. a shortcut. */
  hint?: string;
  /** Tooltip, e.g. a full file path. */
  title?: string;
  /** Draw a divider above this item. */
  divider?: boolean;
  /** React key when labels can repeat. */
  id?: string;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return (
    <div className="menu" ref={ref} style={{ left, top }}>
      {items.map((it) => (
        <Fragment key={it.id ?? it.label}>
          {it.divider && <div className="menu-sep" />}
          <button
            className={`menu-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            title={it.title}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
