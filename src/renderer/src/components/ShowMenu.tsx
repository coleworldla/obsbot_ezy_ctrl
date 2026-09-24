import { useState } from 'react';
import { UNTITLED_SHOW } from '../../../shared/show';
import type { ShowStatus } from '../../../shared/types';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface Props {
  status: ShowStatus | null;
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: (file?: string) => void;
  onBackups: () => void;
}

/** Header button with the current show's name (a dot for unsaved changes) and the Save / Open menu. */
export function ShowMenu({ status, onSave, onSaveAs, onOpen, onBackups }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const recent = (status?.recent ?? []).filter((r) => r.path !== status?.path).slice(0, 6);
  const items: MenuItem[] = [
    { label: 'Save show', hint: 'Ctrl+Shift+S', onClick: onSave },
    { label: 'Save show as…', onClick: onSaveAs },
    { label: 'Open show…', hint: 'Ctrl+O', onClick: () => onOpen() },
    ...(recent.length ? [{ id: 'recent', label: 'Recent shows', disabled: true, divider: true, onClick: () => undefined }] : []),
    ...recent.map((r) => ({ id: `recent:${r.path}`, label: r.name, title: r.path, onClick: () => onOpen(r.path) })),
    { label: 'Backups folder', divider: true, title: 'Copies of the setup made before each show was opened', onClick: onBackups },
  ];
  const title = status?.path ? `${status.path}${status.dirty ? '\nChanged since it was last saved' : ''}` : 'Not saved as a show yet: Save show writes everything to a .ezy file';

  return (
    <>
      <button
        className={`hb showbtn${at ? ' active' : ''}`}
        title={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 4 });
        }}
      >
        <span className="showlbl">SHOW</span>
        <span className={`showname${status?.path ? '' : ' untitled'}`}>{status?.name ?? UNTITLED_SHOW}</span>
        {status?.dirty && <span className="showdot" aria-label="unsaved changes" />}
      </button>
      {at && <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />}
    </>
  );
}
