/**
 * Show files (.ezy): one JSON document with everything needed to bring a production back:
 * the cameras, their presets (with thumbnails), the mapping table, the OSC setup and the
 * operator's speeds. Pure code, unit-tested; the main process reads and writes the files.
 */
import { isMapping, type Mapping } from './mapping';
import { DEFAULT_VISCA_PORT, type CameraConfig, type Preset, type RecallSpeed, type Settings, type VideoSource } from './types';

export const SHOW_EXTENSION = 'ezy';
export const SHOW_FORMAT = 'ezy-show';
export const SHOW_VERSION = 1;
export const UNTITLED_SHOW = 'Untitled show';

/** How the operator drives the show; kept in the window's storage rather than the config files. */
export interface ShowOperator {
  recallSpeed?: RecallSpeed;
  speed?: { pan: number; tilt: number; zoom: number };
  trackBox?: boolean;
}

/** The parts of the setup a show carries and compares for unsaved changes. */
export interface ShowContent {
  cameras: CameraConfig[];
  presets: Preset[];
  mappings: Mapping[];
  osc: Settings['osc'];
}

export interface ShowFile {
  format: typeof SHOW_FORMAT;
  version: number;
  app: string;
  appVersion: string;
  savedAt: string;
  name: string;
  cameras: CameraConfig[];
  presets: Preset[];
  /** Absent in a hand-made file: the current mapping table stays. */
  mappings?: Mapping[];
  /** Absent in a hand-made file: the current OSC setup stays. Only the valid fields are kept. */
  osc?: Partial<Settings['osc']>;
  operator?: ShowOperator;
}

export class ShowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowError';
  }
}

export function buildShow(name: string, appVersion: string, content: ShowContent, operator?: ShowOperator, now = new Date()): ShowFile {
  return {
    format: SHOW_FORMAT,
    version: SHOW_VERSION,
    app: 'EZY CTRL',
    appVersion,
    savedAt: now.toISOString(),
    name,
    cameras: content.cameras,
    presets: content.presets,
    mappings: content.mappings,
    osc: content.osc,
    ...(operator ? { operator } : {}),
  };
}

const VIDEO_SOURCES: VideoSource[] = ['rtsp', 'ndi', 'srt', 'webui', 'demo', 'webcam'];
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function readCameras(list: unknown[], warnings: string[]): CameraConfig[] {
  const out: CameraConfig[] = [];
  const ids = new Set<string>();
  let skipped = 0;
  for (const raw of list) {
    if (!isObj(raw) || !isStr(raw.id) || !raw.id || !isStr(raw.name) || ids.has(raw.id)) {
      skipped += 1;
      continue;
    }
    ids.add(raw.id);
    out.push({
      id: raw.id,
      name: raw.name,
      host: isStr(raw.host) ? raw.host : '',
      viscaPort: isNum(raw.viscaPort) ? clampInt(raw.viscaPort, 1, 65535) : DEFAULT_VISCA_PORT,
      videoSource: VIDEO_SOURCES.includes(raw.videoSource as VideoSource) ? (raw.videoSource as VideoSource) : 'rtsp',
      videoUrl: isStr(raw.videoUrl) ? raw.videoUrl : '',
      ...(raw.kind === 'monitor' || raw.kind === 'tail2' ? { kind: raw.kind } : {}),
    });
  }
  if (skipped) warnings.push(`${plural(skipped, 'camera')} without an id or name (or with a repeated id) left out`);
  return out;
}

function readPresets(list: unknown[], cameraIds: Set<string>, warnings: string[]): Preset[] {
  const out: Preset[] = [];
  const ids = new Set<string>();
  let orphans = 0;
  let skipped = 0;
  const now = Date.now();
  list.forEach((raw, i) => {
    if (!isObj(raw) || !isStr(raw.id) || ids.has(raw.id) || !isStr(raw.cameraId) || !isNum(raw.panDeg) || !isNum(raw.tiltDeg) || !isNum(raw.zoomRatio)) {
      skipped += 1;
      return;
    }
    if (!cameraIds.has(raw.cameraId)) {
      orphans += 1;
      return;
    }
    ids.add(raw.id);
    out.push({
      id: raw.id,
      cameraId: raw.cameraId,
      name: isStr(raw.name) && raw.name.trim() ? raw.name : `Preset ${i + 1}`,
      panDeg: raw.panDeg,
      tiltDeg: raw.tiltDeg,
      zoomRatio: raw.zoomRatio,
      ...(isStr(raw.thumbnail) && raw.thumbnail.startsWith('data:image/') ? { thumbnail: raw.thumbnail } : {}),
      order: isNum(raw.order) ? raw.order : i,
      ...(isNum(raw.cameraSlot) && Number.isInteger(raw.cameraSlot) && raw.cameraSlot >= 0 && raw.cameraSlot <= 255 ? { cameraSlot: raw.cameraSlot } : {}),
      createdAt: isNum(raw.createdAt) ? raw.createdAt : now,
      updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : now,
    });
  });
  if (orphans) warnings.push(`${plural(orphans, 'preset')} for cameras that are not in the show left out`);
  if (skipped) warnings.push(`${plural(skipped, 'preset')} that could not be read left out`);
  return out;
}

function readOsc(raw: Record<string, unknown>): Partial<Settings['osc']> {
  const o: Partial<Settings['osc']> = {};
  if (typeof raw.enabled === 'boolean') o.enabled = raw.enabled;
  if (isNum(raw.listenPort) && raw.listenPort >= 1 && raw.listenPort <= 65535) o.listenPort = Math.round(raw.listenPort);
  if (typeof raw.feedbackEnabled === 'boolean') o.feedbackEnabled = raw.feedbackEnabled;
  if (isStr(raw.feedbackHost)) o.feedbackHost = raw.feedbackHost;
  if (isNum(raw.feedbackPort) && raw.feedbackPort >= 1 && raw.feedbackPort <= 65535) o.feedbackPort = Math.round(raw.feedbackPort);
  if (raw.naming === 'name' || raw.naming === 'index') o.naming = raw.naming;
  return o;
}

function readOperator(raw: Record<string, unknown>): ShowOperator {
  const op: ShowOperator = {};
  const rs = raw.recallSpeed;
  if (isObj(rs) && isNum(rs.pan) && isNum(rs.tilt)) op.recallSpeed = { pan: clampInt(rs.pan, 1, 24), tilt: clampInt(rs.tilt, 1, 23) };
  const sp = raw.speed;
  if (isObj(sp) && isNum(sp.pan) && isNum(sp.tilt) && isNum(sp.zoom)) op.speed = { pan: clampInt(sp.pan, 1, 24), tilt: clampInt(sp.tilt, 1, 23), zoom: clampInt(sp.zoom, 1, 8) };
  if (typeof raw.trackBox === 'boolean') op.trackBox = raw.trackBox;
  return op;
}

/** Read a .ezy file's text. Throws ShowError with a readable reason; `warnings` lists what had to be left out. */
export function parseShow(text: string): { show: ShowFile; warnings: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ShowError('this is not an EZY CTRL show (the file is not readable JSON)');
  }
  if (!isObj(raw) || raw.format !== SHOW_FORMAT) throw new ShowError('this is not an EZY CTRL show file');
  if (!isNum(raw.version) || raw.version < 1) throw new ShowError('the show file has no valid version');
  if (raw.version > SHOW_VERSION) throw new ShowError(`this show was saved by a newer EZY CTRL (show format ${raw.version}); update the app to open it`);
  if (!Array.isArray(raw.cameras)) throw new ShowError('the show file has no camera list');

  const warnings: string[] = [];
  const cameras = readCameras(raw.cameras, warnings);
  const presets = Array.isArray(raw.presets) ? readPresets(raw.presets, new Set(cameras.map((c) => c.id)), warnings) : [];
  let mappings: Mapping[] | undefined;
  if (Array.isArray(raw.mappings)) {
    mappings = raw.mappings.filter(isMapping);
    const bad = raw.mappings.length - mappings.length;
    if (bad) warnings.push(`${plural(bad, 'mapping')} that could not be read left out`);
  }
  return {
    show: {
      format: SHOW_FORMAT,
      version: raw.version,
      app: isStr(raw.app) ? raw.app : 'EZY CTRL',
      appVersion: isStr(raw.appVersion) ? raw.appVersion : '',
      savedAt: isStr(raw.savedAt) ? raw.savedAt : '',
      name: isStr(raw.name) && raw.name.trim() ? raw.name : UNTITLED_SHOW,
      cameras,
      presets,
      ...(mappings ? { mappings } : {}),
      ...(isObj(raw.osc) ? { osc: readOsc(raw.osc) } : {}),
      ...(isObj(raw.operator) ? { operator: readOperator(raw.operator) } : {}),
    },
    warnings,
  };
}

/** JSON with object keys sorted, so the same setup always gives the same text. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (isObj(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** cyrb53: a fast 53-bit string hash; plenty to notice that something changed. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Fingerprint of the parts a show carries, to tell whether the setup changed since the file was written. */
export function showFingerprint(c: ShowContent): string {
  const presets = [...c.presets].sort((a, b) => a.cameraId.localeCompare(b.cameraId) || a.order - b.order || a.id.localeCompare(b.id));
  return hash53(stableStringify({ cameras: c.cameras, presets, mappings: c.mappings, osc: c.osc }));
}

/** "D:\Shows\Sunday Service.ezy" -> "Sunday Service". */
export function showNameFromPath(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.ezy$/i, '') || UNTITLED_SHOW;
}

export function withShowExtension(file: string): string {
  return /\.ezy$/i.test(file) ? file : `${file}.${SHOW_EXTENSION}`;
}

/** The first .ezy path in a command line (a double-clicked show). */
export function showFileFromArgv(argv: string[]): string | null {
  return argv.find((a) => /\.ezy$/i.test(a) && !a.startsWith('-')) ?? null;
}
