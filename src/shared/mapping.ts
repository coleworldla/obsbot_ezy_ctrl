/**
 * Action registry + mapping model, shared by main (OSC scheme) and renderer (executor, UI).
 * Pure code: no DOM, no Node, so it is unit-tested directly.
 */

export type ActionKind = 'trigger' | 'momentary' | 'toggle' | 'continuous';
export type ActionArg = 'preset' | 'camera';

export interface ActionDef {
  id: string;
  label: string;
  group: string;
  kind: ActionKind;
  /** The action takes an index argument (preset number, camera number). */
  arg?: ActionArg;
  /** OSC address template: {i} is the camera index; arg actions get /{n} appended. */
  osc: string;
  /** Natural-unit range for continuous actions (OSC values, display). */
  range?: [number, number];
  /** Default keyboard trigger. */
  key?: KeyTrigger;
}

export interface MidiTrigger {
  type: 'midi';
  /** Input device name, or undefined for any device. */
  device?: string;
  /** 1-16, or null for any channel. */
  channel: number | null;
  kind: 'note' | 'cc';
  number: number;
  /** For arg actions: numbers number..number+span-1 map to arg 1..span. */
  span?: number;
}

export interface OscTrigger {
  type: 'osc';
  address: string;
}

export interface KeyTrigger {
  type: 'key';
  /** Lower-case key as reported by KeyboardEvent.key ('a', '1', '=', 'f5'). */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** For arg actions on digit keys: key..key+span-1 map to arg 1..span. */
  span?: number;
}

export type Trigger = MidiTrigger | OscTrigger | KeyTrigger;

export interface Mapping {
  id: string;
  actionId: string;
  /** Fixed argument (preset / camera index, 1-based). Ignored when the trigger has a span. */
  arg?: number;
  /** Camera index (1-based) the action applies to; null / undefined = the selected camera. */
  camera?: number | null;
  trigger: Trigger;
}

export type Phase = 'press' | 'release' | 'value';

export interface Invocation {
  actionId: string;
  phase: Phase;
  arg?: number;
  camera?: number | null;
  /** For continuous actions. */
  value?: number;
  /** 'normalized' = 0..1 (MIDI), 'natural' = the action's own units (OSC). */
  unit?: 'normalized' | 'natural';
}

export interface MidiInput {
  type: 'midi';
  device: string;
  channel: number;
  kind: 'note' | 'cc';
  number: number;
  /** velocity or CC value, 0-127. */
  value: number;
}

export interface KeyInput {
  type: 'key';
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  phase: 'press' | 'release';
}

export interface OscInput {
  type: 'osc';
  address: string;
  args: (number | string | boolean)[];
}

export type Input = MidiInput | KeyInput | OscInput;

const k = (key: string, extra: Partial<KeyTrigger> = {}): KeyTrigger => ({ type: 'key', key, ...extra });

export const ACTIONS: ActionDef[] = [
  { id: 'cam.select', label: 'Select camera', group: 'Cameras', kind: 'trigger', arg: 'camera', osc: '/cam/select', key: k('1', { ctrl: true, span: 9 }) },
  { id: 'tally.pgm', label: 'Tally: program', group: 'Cameras', kind: 'trigger', osc: '/cam/{i}/tally/pgm' },
  { id: 'tally.pvw', label: 'Tally: preview', group: 'Cameras', kind: 'trigger', osc: '/cam/{i}/tally/pvw' },
  { id: 'tally.clear', label: 'Tally: clear', group: 'Cameras', kind: 'trigger', osc: '/cam/{i}/tally/clear' },

  { id: 'ptz.up', label: 'Jog up', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/up', key: k('w') },
  { id: 'ptz.down', label: 'Jog down', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/down', key: k('s') },
  { id: 'ptz.left', label: 'Jog left', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/left', key: k('a') },
  { id: 'ptz.right', label: 'Jog right', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/right', key: k('d') },
  { id: 'ptz.upleft', label: 'Jog up-left', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/upleft', key: k('q') },
  { id: 'ptz.upright', label: 'Jog up-right', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/upright', key: k('e') },
  { id: 'ptz.downleft', label: 'Jog down-left', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/downleft', key: k('z') },
  { id: 'ptz.downright', label: 'Jog down-right', group: 'Pan / Tilt', kind: 'momentary', osc: '/cam/{i}/ptz/downright', key: k('c') },
  { id: 'ptz.pan', label: 'Pan axis (−1 … 1)', group: 'Pan / Tilt', kind: 'continuous', osc: '/cam/{i}/ptz/pan', range: [-1, 1] },
  { id: 'ptz.tilt', label: 'Tilt axis (−1 … 1)', group: 'Pan / Tilt', kind: 'continuous', osc: '/cam/{i}/ptz/tilt', range: [-1, 1] },
  { id: 'ptz.speed', label: 'Jog speed (1 … 24)', group: 'Pan / Tilt', kind: 'continuous', osc: '/cam/{i}/ptz/speed', range: [1, 24] },
  { id: 'ptz.speed.down', label: 'Jog speed −1', group: 'Pan / Tilt', kind: 'trigger', osc: '/cam/{i}/ptz/speed/down', key: k('[') },
  { id: 'ptz.speed.up', label: 'Jog speed +1', group: 'Pan / Tilt', kind: 'trigger', osc: '/cam/{i}/ptz/speed/up', key: k(']') },
  { id: 'ptz.home', label: 'Home', group: 'Pan / Tilt', kind: 'trigger', osc: '/cam/{i}/home', key: k('h') },

  { id: 'zoom.level', label: 'Zoom level (1 … 12×)', group: 'Zoom', kind: 'continuous', osc: '/cam/{i}/zoom', range: [1, 12] },
  { id: 'zoom.tele', label: 'Zoom tele (hold)', group: 'Zoom', kind: 'momentary', osc: '/cam/{i}/zoom/tele', key: k('=') },
  { id: 'zoom.wide', label: 'Zoom wide (hold)', group: 'Zoom', kind: 'momentary', osc: '/cam/{i}/zoom/wide', key: k('-') },

  { id: 'preset.recall', label: 'Recall preset', group: 'Presets', kind: 'trigger', arg: 'preset', osc: '/cam/{i}/preset', key: k('1', { span: 9 }) },
  { id: 'preset.save', label: 'Save current position', group: 'Presets', kind: 'trigger', osc: '/cam/{i}/preset/save', key: k('s', { ctrl: true }) },

  { id: 'ai.track', label: 'Tracking on / off', group: 'AI & recording', kind: 'toggle', osc: '/cam/{i}/track', key: k('t') },
  { id: 'record', label: 'Record start / stop', group: 'AI & recording', kind: 'toggle', osc: '/cam/{i}/record', key: k('r') },
  { id: 'orientation', label: 'Portrait / landscape', group: 'AI & recording', kind: 'toggle', osc: '/cam/{i}/rotate', key: k('o') },
  { id: 'focus.push', label: 'One-push autofocus', group: 'AI & recording', kind: 'trigger', osc: '/cam/{i}/focus/push', key: k('f') },

  { id: 'panel.toggle', label: 'Show / hide camera settings', group: 'App', kind: 'trigger', osc: '/app/panel', key: k('i') },
  { id: 'log.toggle', label: 'Show / hide log', group: 'App', kind: 'trigger', osc: '/app/log', key: k('l') },
  { id: 'mapping.toggle', label: 'Show / hide mapping', group: 'App', kind: 'trigger', osc: '/app/mapping', key: k('m') },
];

export const actionById = (id: string): ActionDef | undefined => ACTIONS.find((a) => a.id === id);

export const ACTION_GROUPS: string[] = [...new Set(ACTIONS.map((a) => a.group))];

/** Default mapping set: the keyboard layout. */
export function defaultMappings(): Mapping[] {
  return ACTIONS.filter((a) => a.key).map((a) => ({ id: `key:${a.id}`, actionId: a.id, trigger: a.key! }));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note name with C3 = 60 (the convention most controllers and DAWs print). */
export function noteName(n: number): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`;
}

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case 'midi': {
      const ch = t.channel === null ? '' : ` · ch${t.channel}`;
      const dev = t.device ? ` · ${t.device}` : '';
      if (t.kind === 'cc') return `CC ${t.number}${ch}${dev}`;
      const span = t.span && t.span > 1 ? `${noteName(t.number)} … ${noteName(t.number + t.span - 1)}` : `Note ${noteName(t.number)}`;
      return `${span}${ch}${dev}`;
    }
    case 'osc':
      return t.address;
    case 'key': {
      const mods = [t.ctrl ? 'Ctrl' : '', t.alt ? 'Alt' : '', t.shift ? 'Shift' : ''].filter(Boolean);
      const key = t.key.length === 1 ? t.key.toUpperCase() : t.key;
      const base = [...mods, key].join('+');
      if (t.span && t.span > 1 && /^[0-9]$/.test(t.key)) return `${base} … ${Number(t.key) + t.span - 1}`;
      return base;
    }
  }
}

/** OSC address for an action on a camera ('sel' = selected) with an optional index argument. */
export function oscAddress(action: ActionDef, camera: number | 'sel' = 'sel', arg?: number): string {
  let a = action.osc.replace('{i}', String(camera));
  if (action.arg && arg !== undefined) a += `/${arg}`;
  return a;
}

function keyMatches(t: KeyTrigger, ev: KeyInput): number | null {
  if (!!t.ctrl !== ev.ctrl || !!t.shift !== ev.shift || !!t.alt !== ev.alt) return null;
  if (t.span && t.span > 1 && /^[0-9]$/.test(t.key) && /^[0-9]$/.test(ev.key)) {
    const idx = Number(ev.key) - Number(t.key);
    return idx >= 0 && idx < t.span ? idx + 1 : null;
  }
  return t.key === ev.key ? 0 : null;
}

function midiMatches(t: MidiTrigger, ev: MidiInput): number | null {
  if (t.kind !== ev.kind) return null;
  if (t.channel !== null && t.channel !== ev.channel) return null;
  if (t.device && t.device !== ev.device) return null;
  if (t.span && t.span > 1) {
    const idx = ev.number - t.number;
    return idx >= 0 && idx < t.span ? idx + 1 : null;
  }
  return t.number === ev.number ? 0 : null;
}

/** Turn an input event into action invocations using the user's mapping table. */
export function matchMappings(mappings: Mapping[], input: Input): Invocation[] {
  const out: Invocation[] = [];
  for (const m of mappings) {
    const action = actionById(m.actionId);
    if (!action) continue;
    let spanArg: number | null = null;
    if (input.type === 'key' && m.trigger.type === 'key') spanArg = keyMatches(m.trigger, input);
    else if (input.type === 'midi' && m.trigger.type === 'midi') spanArg = midiMatches(m.trigger, input);
    else if (input.type === 'osc' && m.trigger.type === 'osc') spanArg = m.trigger.address === input.address ? 0 : null;
    else continue;
    if (spanArg === null) continue;
    const arg = spanArg > 0 ? spanArg : m.arg;
    const base = { actionId: m.actionId, arg, camera: m.camera ?? null };

    if (input.type === 'key') {
      out.push({ ...base, phase: input.phase });
    } else if (input.type === 'midi') {
      if (action.kind === 'continuous') {
        out.push({ ...base, phase: 'value', value: input.value / 127, unit: 'normalized' });
      } else if (input.kind === 'note') {
        out.push({ ...base, phase: input.value > 0 ? 'press' : 'release' });
      } else {
        out.push({ ...base, phase: input.value >= 64 ? 'press' : 'release' });
      }
    } else {
      const v = typeof input.args[0] === 'number' ? input.args[0] : typeof input.args[0] === 'boolean' ? (input.args[0] ? 1 : 0) : undefined;
      if (action.kind === 'continuous') {
        if (v !== undefined) out.push({ ...base, phase: 'value', value: v, unit: 'natural' });
      } else {
        out.push({ ...base, phase: v === 0 ? 'release' : 'press', value: v });
      }
    }
  }
  return out;
}

/**
 * Built-in OSC scheme, always active:
 *   /cam/select <i>                       /cam/<i>/preset/<n>          /cam/<i>/preset/save
 *   /cam/<i>/ptz/<dir> [0|1]              /cam/<i>/ptz/pan <-1..1>     /cam/<i>/ptz/tilt <-1..1>
 *   /cam/<i>/ptz/speed <1..24>            /cam/<i>/home                /cam/<i>/zoom <1..12>
 *   /cam/<i>/zoom/tele [0|1]              /cam/<i>/zoom/wide [0|1]     /cam/<i>/track [0|1]
 *   /cam/<i>/record [0|1]                 /cam/<i>/rotate [0|1]        /cam/<i>/focus/push
 *   /app/log                              /app/mapping
 * <i> is the 1-based camera index or "sel" for the selected camera.
 */
export function parseBuiltinOsc(input: OscInput): Invocation | null {
  const num = (x: unknown): number | undefined => (typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x)) ? Number(x) : undefined);
  const v = num(input.args[0]);
  const parts = input.address.split('/').filter(Boolean);
  if (parts[0] === 'app' && parts.length === 2) {
    const id = parts[1] === 'log' ? 'log.toggle' : parts[1] === 'mapping' ? 'mapping.toggle' : parts[1] === 'panel' ? 'panel.toggle' : null;
    return id ? { actionId: id, phase: 'press' } : null;
  }
  // Switcher-style tally: /tally/pgm <i>, /tally/pvw <i>
  if (parts[0] === 'tally' && parts.length === 2 && (parts[1] === 'pgm' || parts[1] === 'pvw')) {
    const idx = num(input.args[0]);
    return Number.isInteger(idx) && (idx as number) >= 1 ? { actionId: `tally.${parts[1]}`, phase: 'press', camera: idx as number } : null;
  }
  if (parts[0] !== 'cam') return null;
  if (parts[1] === 'select') {
    const idx = num(input.args[0]) ?? Number(parts[2]);
    return Number.isInteger(idx) && idx >= 1 ? { actionId: 'cam.select', phase: 'press', arg: idx } : null;
  }
  const camera = parts[1] === 'sel' || parts[1] === 'selected' ? null : Number(parts[1]);
  if (camera !== null && (!Number.isInteger(camera) || camera < 1)) return null;
  const rest = parts.slice(2).join('/');
  const press = (actionId: string): Invocation => ({ actionId, phase: v === 0 ? 'release' : 'press', camera, value: v });
  const cont = (actionId: string): Invocation | null => (v === undefined ? null : { actionId, phase: 'value', camera, value: v, unit: 'natural' });

  if (/^preset\/\d+$/.test(rest)) {
    if (v === 0) return null; // button release from TouchOSC-style controls
    return { actionId: 'preset.recall', phase: 'press', camera, arg: Number(rest.split('/')[1]) };
  }
  if (rest === 'preset' && v !== undefined && v >= 1) return { actionId: 'preset.recall', phase: 'press', camera, arg: Math.round(v) };
  if (rest === 'preset/save') return press('preset.save');
  const jog = rest.match(/^ptz\/(up|down|left|right|upleft|upright|downleft|downright)$/);
  if (jog) return press(`ptz.${jog[1]}`);
  if (rest === 'ptz/pan') return cont('ptz.pan');
  if (rest === 'ptz/tilt') return cont('ptz.tilt');
  if (rest === 'ptz/speed') return cont('ptz.speed');
  if (rest === 'ptz/speed/up') return press('ptz.speed.up');
  if (rest === 'ptz/speed/down') return press('ptz.speed.down');
  if (rest === 'home') return press('ptz.home');
  if (rest === 'zoom') return cont('zoom.level');
  if (rest === 'zoom/tele') return press('zoom.tele');
  if (rest === 'zoom/wide') return press('zoom.wide');
  if (rest === 'track') return press('ai.track');
  if (rest === 'record') return press('record');
  if (rest === 'rotate') return press('orientation');
  if (rest === 'focus/push') return press('focus.push');
  if (rest === 'tally') {
    if (v === undefined) return null;
    return { actionId: v === 1 ? 'tally.pgm' : v === 2 ? 'tally.pvw' : 'tally.clear', phase: 'press', camera };
  }
  if (rest === 'tally/pgm') return press('tally.pgm');
  if (rest === 'tally/pvw') return press('tally.pvw');
  if (rest === 'tally/clear') return press('tally.clear');
  return null;
}

/** Normalise a KeyboardEvent into a KeyInput. Returns null for pure modifier presses. */
export function keyInputFrom(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, phase: 'press' | 'release'): KeyInput | null {
  const raw = e.key;
  if (raw === 'Control' || raw === 'Shift' || raw === 'Alt' || raw === 'Meta') return null;
  let key = raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase();
  if (key === '+') key = '=';
  return { type: 'key', key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, phase };
}

/** The full list of built-in OSC addresses for `count` cameras, for the "copy address list" button. */
export function oscAddressList(count: number): string[] {
  const out: string[] = ['/cam/select <1..' + Math.max(1, count) + '>'];
  const cams: (number | 'sel')[] = ['sel', ...Array.from({ length: count }, (_, i) => i + 1)];
  for (const c of cams) {
    for (const a of ACTIONS) {
      if (!a.osc.includes('{i}')) continue;
      const addr = oscAddress(a, c);
      if (a.arg === 'preset') out.push(`${addr}/<n>`);
      else if (a.kind === 'continuous' && a.range) out.push(`${addr} <${a.range[0]}..${a.range[1]}>`);
      else if (a.kind === 'momentary' || a.kind === 'toggle') out.push(`${addr} [0|1]`);
      else out.push(addr);
    }
  }
  out.push('/cam/<i>/tally <0|1|2>', '/tally/pgm <i>', '/tally/pvw <i>', '/app/panel', '/app/log', '/app/mapping');
  return out;
}
