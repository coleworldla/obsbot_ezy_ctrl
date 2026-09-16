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
  /** Camera addressed by its name slug (/cam/<name>/…) rather than a rack number; the executor resolves it. */
  cameraName?: string;
  /** Preset addressed by its name slug (/cam/<i>/preset/<name>); the executor resolves it. */
  presetName?: string;
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

/** Camera and preset names as they appear in OSC addresses: lower-case, runs of anything but a-z / 0-9 become "_". */
export function oscSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A slug that could be mistaken for a rack number or a reserved word cannot address a camera. */
export const oscSlugUsable = (slug: string): boolean => slug !== '' && !/^\d+$/.test(slug) && slug !== 'sel' && slug !== 'selected' && slug !== 'select';

/**
 * Built-in OSC scheme, always active:
 *   /cam/select <i>                       /cam/<i>/preset/<n>          /cam/<i>/preset/save
 *   /cam/<i>/ptz/<dir> [0|1]              /cam/<i>/ptz/pan <-1..1>     /cam/<i>/ptz/tilt <-1..1>
 *   /cam/<i>/ptz/speed <1..24>            /cam/<i>/home                /cam/<i>/zoom <1..12>
 *   /cam/<i>/zoom/tele [0|1]              /cam/<i>/zoom/wide [0|1]     /cam/<i>/track [0|1]
 *   /cam/<i>/record [0|1]                 /cam/<i>/rotate [0|1]        /cam/<i>/focus/push
 *   /app/log                              /app/mapping
 * <i> is the camera's name slug (/cam/stage_left/…), its 1-based rack number, or "sel" for the selected camera.
 * Presets likewise: /cam/<i>/preset/<n> by rail position or /cam/<i>/preset/<name-slug>.
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
    const raw = input.args[0];
    const idx = num(raw);
    if (Number.isInteger(idx) && (idx as number) >= 1) return { actionId: `tally.${parts[1]}`, phase: 'press', camera: idx as number };
    const slug = typeof raw === 'string' ? oscSlug(raw) : '';
    return oscSlugUsable(slug) ? { actionId: `tally.${parts[1]}`, phase: 'press', camera: null, cameraName: slug } : null;
  }
  if (parts[0] !== 'cam') return null;
  if (parts[1] === 'select') {
    const raw = input.args[0] ?? parts[2];
    const idx = num(raw);
    if (Number.isInteger(idx) && (idx as number) >= 1) return { actionId: 'cam.select', phase: 'press', arg: idx as number };
    const slug = typeof raw === 'string' ? oscSlug(raw) : '';
    return oscSlugUsable(slug) ? { actionId: 'cam.select', phase: 'press', cameraName: slug } : null;
  }
  // Which camera: "sel", a rack number, or a name slug (case-insensitive, punctuation folded to "_").
  let camera: number | null = null;
  let cameraName: string | undefined;
  const who = parts[1] ?? '';
  if (who === 'sel' || who === 'selected') camera = null;
  else if (/^\d+$/.test(who)) {
    camera = Number(who);
    if (camera < 1) return null;
  } else {
    const slug = oscSlug(who);
    if (!oscSlugUsable(slug)) return null;
    cameraName = slug;
  }
  const target: Pick<Invocation, 'camera' | 'cameraName'> = cameraName ? { camera, cameraName } : { camera };
  const rest = parts.slice(2).join('/');
  const press = (actionId: string): Invocation => ({ actionId, phase: v === 0 ? 'release' : 'press', ...target, value: v });
  const cont = (actionId: string): Invocation | null => (v === undefined ? null : { actionId, phase: 'value', ...target, value: v, unit: 'natural' });

  const presetPart = rest.match(/^preset\/([^/]+)$/);
  if (presetPart && presetPart[1] !== 'save' && presetPart[1] !== 'active') {
    if (v === 0) return null; // button release from TouchOSC-style controls
    if (/^\d+$/.test(presetPart[1])) return { actionId: 'preset.recall', phase: 'press', ...target, arg: Number(presetPart[1]) };
    const slug = oscSlug(presetPart[1]);
    return slug ? { actionId: 'preset.recall', phase: 'press', ...target, presetName: slug } : null;
  }
  if (rest === 'preset' && v !== undefined && v >= 1) return { actionId: 'preset.recall', phase: 'press', ...target, arg: Math.round(v) };
  if (rest === 'preset' && v === undefined && typeof input.args[0] === 'string') {
    const slug = oscSlug(input.args[0]);
    return slug ? { actionId: 'preset.recall', phase: 'press', ...target, presetName: slug } : null;
  }
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
    return { actionId: v === 1 ? 'tally.pgm' : v === 2 ? 'tally.pvw' : 'tally.clear', phase: 'press', ...target };
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

// ---------------------------------------------------------------------------------------------
// OSC map: every address the app understands, per camera, with the presets spelled out by name.
// Rendered by the OSC map panel and copied into TouchOSC / Companion / a media server.
// ---------------------------------------------------------------------------------------------

export interface OscMapRow {
  section: string;
  address: string;
  /** Argument hint, e.g. "1 | 0", "<1..12>", "" for none. */
  args: string;
  desc: string;
  kind: 'in' | 'feedback';
}

export type OscMapFormat = 'text' | 'addresses' | 'csv' | 'markdown';

const CAM_ROWS: { rest: string; args: string; desc: string }[] = [
  { rest: 'ptz/up', args: '1 | 0', desc: 'Tilt up while held (1 start, 0 stop)' },
  { rest: 'ptz/down', args: '1 | 0', desc: 'Tilt down while held' },
  { rest: 'ptz/left', args: '1 | 0', desc: 'Pan left while held' },
  { rest: 'ptz/right', args: '1 | 0', desc: 'Pan right while held' },
  { rest: 'ptz/upleft', args: '1 | 0', desc: 'Diagonal up-left while held' },
  { rest: 'ptz/upright', args: '1 | 0', desc: 'Diagonal up-right while held' },
  { rest: 'ptz/downleft', args: '1 | 0', desc: 'Diagonal down-left while held' },
  { rest: 'ptz/downright', args: '1 | 0', desc: 'Diagonal down-right while held' },
  { rest: 'ptz/pan', args: '<-1..1>', desc: 'Pan axis for a joystick or fader: -1 full left, 0 stop, 1 full right' },
  { rest: 'ptz/tilt', args: '<-1..1>', desc: 'Tilt axis: -1 full down, 0 stop, 1 full up' },
  { rest: 'ptz/speed', args: '<1..24>', desc: 'Jog speed' },
  { rest: 'ptz/speed/up', args: '', desc: 'Jog speed one step faster' },
  { rest: 'ptz/speed/down', args: '', desc: 'Jog speed one step slower' },
  { rest: 'home', args: '', desc: 'Return to the home position' },
  { rest: 'zoom', args: '<1..12>', desc: 'Zoom to this ratio (1x wide … 12x tele)' },
  { rest: 'zoom/tele', args: '1 | 0', desc: 'Zoom in while held' },
  { rest: 'zoom/wide', args: '1 | 0', desc: 'Zoom out while held' },
  { rest: 'preset/save', args: '', desc: 'Save the current position as a new preset' },
  { rest: 'preset', args: '<n>', desc: 'Recall preset n (number as the argument, for encoders)' },
  { rest: 'track', args: '1 | 0', desc: 'AI tracking on / off (no argument flips it)' },
  { rest: 'record', args: '1 | 0', desc: 'Recording on the camera on / off' },
  { rest: 'rotate', args: '1 | 0', desc: 'Portrait (1) / landscape (0) orientation' },
  { rest: 'focus/push', args: '', desc: 'One-push autofocus' },
  { rest: 'tally', args: '0 | 1 | 2', desc: 'Tally: 0 off, 1 program (red), 2 preview (green)' },
  { rest: 'tally/pgm', args: '', desc: 'Tally program' },
  { rest: 'tally/pvw', args: '', desc: 'Tally preview' },
  { rest: 'tally/clear', args: '', desc: 'Tally off' },
];

const FEEDBACK_ROWS: { rest: string; args: string; desc: string }[] = [
  { rest: 'online', args: '0 | 1', desc: 'VISCA control reachable (sent on change)' },
  { rest: 'preset/active', args: '<n>', desc: 'Preset the camera sits on, 0 when it has moved off (sent on change)' },
  { rest: 'tally', args: '0 | 1 | 2', desc: 'Tally state (sent on change)' },
  { rest: 'position', args: '<pan> <tilt> <zoom>', desc: 'Pan °, tilt °, zoom ratio at 4 Hz' },
];

export type OscNaming = 'name' | 'index';

/** The address key for a camera: its name slug when addressing by name and the slug is usable, else its rack number. */
export function oscCameraKey(camera: { name: string }, index: number, naming: OscNaming): string {
  const slug = oscSlug(camera.name);
  return naming === 'name' && oscSlugUsable(slug) ? slug : String(index + 1);
}

export function oscMapRows(cameras: { id: string; name: string; kind?: string }[], presets: { cameraId: string; name: string }[], naming: OscNaming = 'name'): OscMapRow[] {
  const out: OscMapRow[] = [];
  const n = Math.max(1, cameras.length);
  const push = (section: string, address: string, args: string, desc: string, kind: 'in' | 'feedback' = 'in') => out.push({ section, address, args, desc, kind });
  const byName = naming === 'name';

  push('Global', '/cam/select', byName ? '<name> or <1..' + n + '>' : `<1..${n}>`, 'Put that camera on stage');
  push('Global', '/tally/pgm', byName ? '<name> or <i>' : '<i>', 'Camera program (switcher style)');
  push('Global', '/tally/pvw', byName ? '<name> or <i>' : '<i>', 'Camera preview');
  push('Global', '/app/panel', '', 'Toggle the camera settings drawer');
  push('Global', '/app/log', '', 'Toggle the Log');
  push('Global', '/app/mapping', '', 'Toggle the Mapping panel');

  const camSections: { key: string; title: string; id: string | null; monitor: boolean }[] = [
    { key: 'sel', title: 'Selected camera (/cam/sel/…)', id: null, monitor: false },
    ...cameras.map((c, i) => {
      const key = oscCameraKey(c, i, naming);
      const alt = byName ? (key === String(i + 1) ? ' (name not usable as an address, so by number)' : ` · also /cam/${i + 1}/…`) : ` · also /cam/${oscSlug(c.name)}/…`;
      return { key, title: `CAM ${i + 1} · ${c.name}${c.kind === 'monitor' ? ' (video only)' : ''}${alt}`, id: c.id, monitor: c.kind === 'monitor' };
    }),
  ];
  for (const sec of camSections) {
    const base = `/cam/${sec.key}`;
    if (sec.monitor) {
      push(sec.title, `${base}/tally`, '0 | 1 | 2', 'Tally: 0 off, 1 program, 2 preview');
      push(sec.title, `${base}/tally/pgm`, '', 'Tally program');
      push(sec.title, `${base}/tally/pvw`, '', 'Tally preview');
      push(sec.title, `${base}/tally/clear`, '', 'Tally off');
      push(sec.title, `${base}/tally`, '0 | 1 | 2', 'Feedback: tally state', 'feedback');
      continue;
    }
    const mine = sec.id ? presets.filter((p) => p.cameraId === sec.id) : [];
    if (mine.length) {
      const seen = new Set<string>();
      mine.forEach((p, i) => {
        const slug = oscSlug(p.name);
        if (byName && slug && !/^\d+$/.test(slug)) {
          const dup = seen.has(slug);
          seen.add(slug);
          push(sec.title, `${base}/preset/${slug}`, '', `Recall preset ${i + 1} · "${p.name}"${dup ? ' (same name as an earlier preset: the earlier one answers; rename to fix)' : ''}`);
        } else push(sec.title, `${base}/preset/${i + 1}`, '', `Recall preset ${i + 1} · "${p.name}"`);
      });
      push(sec.title, `${base}/preset/<n>`, '', byName ? 'Recall a preset by its number in the rail' : 'Recall preset n (its number in the rail)');
    } else push(sec.title, `${base}/preset/<n>`, '', sec.id ? 'Recall preset n (no presets saved yet)' : 'Recall preset n of the camera on stage');
    if (!sec.id) push(sec.title, `${base}/preset/<name>`, '', 'Recall a preset by name (lower-case, spaces → _)');
    for (const r of CAM_ROWS) push(sec.title, `${base}/${r.rest}`, r.args, r.desc);
    for (const r of FEEDBACK_ROWS) push(sec.title, `${base}/${r.rest}`, r.args, `Feedback: ${r.desc}`, 'feedback');
  }
  push('Feedback (global)', '/cam/select', '<n>', 'Feedback: camera n went on stage', 'feedback');
  return out;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function oscMapText(rows: OscMapRow[], format: OscMapFormat): string {
  switch (format) {
    case 'addresses':
      return [...new Set(rows.map((r) => r.address))].join('\n');
    case 'csv':
      return ['section,address,argument,description,direction', ...rows.map((r) => [r.section, r.address, r.args, r.desc, r.kind === 'feedback' ? 'out' : 'in'].map(csvCell).join(','))].join('\n');
    case 'markdown': {
      const lines: string[] = [];
      let section = '';
      for (const r of rows) {
        if (r.section !== section) {
          section = r.section;
          lines.push('', `### ${section}`, '', '| Address | Argument | Does |', '|---|---|---|');
        }
        lines.push(`| \`${r.address}\` | ${r.args || '—'} | ${r.kind === 'feedback' ? '(feedback) ' : ''}${r.desc} |`);
      }
      return lines.join('\n').trim();
    }
    default: {
      const width = Math.min(40, Math.max(...rows.map((r) => r.address.length + (r.args ? r.args.length + 1 : 0))));
      const lines: string[] = [];
      let section = '';
      for (const r of rows) {
        if (r.section !== section) {
          section = r.section;
          if (lines.length) lines.push('');
          lines.push(`# ${section}`);
        }
        const left = r.args ? `${r.address} ${r.args}` : r.address;
        lines.push(`${left.padEnd(width)}  ${r.kind === 'feedback' ? '(feedback) ' : ''}${r.desc}`);
      }
      return lines.join('\n');
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Names list: every camera and preset name with its OSC slug, for pasting into other software.
// ---------------------------------------------------------------------------------------------

export interface NameRow {
  kind: 'camera' | 'preset';
  /** Rack number for cameras, rail position for presets (1-based). */
  index: number;
  name: string;
  slug: string;
  /** OSC address prefix (camera) or full recall address (preset). */
  address: string;
  /** For presets: the camera they belong to. */
  camera?: string;
  monitor?: boolean;
}

export function namesList(cameras: { id: string; name: string; kind?: string }[], presets: { cameraId: string; name: string }[], naming: OscNaming = 'name'): NameRow[] {
  const out: NameRow[] = [];
  cameras.forEach((c, i) => {
    const key = oscCameraKey(c, i, naming);
    out.push({ kind: 'camera', index: i + 1, name: c.name, slug: oscSlug(c.name), address: `/cam/${key}`, monitor: c.kind === 'monitor' });
    presets
      .filter((p) => p.cameraId === c.id)
      .forEach((p, j) => {
        const slug = oscSlug(p.name);
        const usable = naming === 'name' && slug && !/^\d+$/.test(slug);
        out.push({ kind: 'preset', index: j + 1, name: p.name, slug, address: `/cam/${key}/preset/${usable ? slug : j + 1}`, camera: c.name });
      });
  });
  return out;
}

export type NamesFormat = 'names' | 'osc' | 'both' | 'csv';

export function namesText(rows: NameRow[], format: NamesFormat): string {
  if (format === 'names') return rows.map((r) => (r.kind === 'camera' ? r.name : `  ${r.name}`)).join('\n');
  if (format === 'osc') return rows.map((r) => r.slug || String(r.index)).join('\n');
  if (format === 'csv') return ['kind,number,name,osc_name,address,camera', ...rows.map((r) => [r.kind, String(r.index), r.name, r.slug, r.address, r.camera ?? ''].map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))].join('\n');
  const w = Math.max(8, ...rows.map((r) => r.name.length + (r.kind === 'preset' ? 4 : 0)));
  return rows.map((r) => (r.kind === 'camera' ? `CAM ${r.index}  ${r.name.padEnd(w)}  ${r.address}${r.monitor ? '  (video only)' : ''}` : `  P${String(r.index).padEnd(3)} ${r.name.padEnd(w)}  ${r.address}`)).join('\n');
}
