/**
 * Shutter and ISO as the camera panel and the mappable actions offer them. OBSBOT's VISCA table has
 * no direct shutter or gain command, only one notch up or down, so the main process steps the camera
 * to a chosen value and reads it back (Tail2.set). Gain is kept as the camera reports it: ISO / 100.
 */

/** Shutter index -> label, from the OBSBOT inquiry table (0x09 fastest … 0x22 slowest). */
export const SHUTTER_LABELS: Record<number, string> = {
  0x09: '1/8000', 0x0a: '1/6400', 0x0b: '1/5000', 0x0c: '1/4000', 0x0d: '1/3200', 0x0e: '1/2500', 0x0f: '1/2000', 0x10: '1/1600',
  0x11: '1/1250', 0x12: '1/1000', 0x13: '1/800', 0x14: '1/640', 0x15: '1/500', 0x16: '1/400', 0x17: '1/320', 0x18: '1/240',
  0x19: '1/200', 0x1a: '1/160', 0x1b: '1/120', 0x1c: '1/100', 0x1d: '1/80', 0x1e: '1/60', 0x1f: '1/50', 0x20: '1/40', 0x21: '1/30', 0x22: '1/25',
};
export const SHUTTER_FASTEST = 0x09;
export const SHUTTER_SLOWEST = 0x22;

/** Every shutter index, slowest first (the order the panel lists them). */
export const SHUTTER_INDICES: number[] = Array.from({ length: SHUTTER_SLOWEST - SHUTTER_FASTEST + 1 }, (_, i) => SHUTTER_SLOWEST - i);

export const shutterLabel = (index: number): string => SHUTTER_LABELS[index] ?? `index 0x${index.toString(16)}`;

/** 1/250 -> 250. */
const denominator = (index: number): number => Number(SHUTTER_LABELS[index].split('/')[1]);

/** The shutter index whose 1/x is nearest to `x` (OSC sends 250 for 1/250), compared in stops. */
export function shutterIndexFor(x: number): number {
  const want = Math.log(Math.max(1, x));
  const off = (i: number) => Math.abs(Math.log(denominator(i)) - want);
  return SHUTTER_INDICES.reduce((best, i) => (off(i) < off(best) ? i : best));
}

/** One notch faster or slower, within the camera's range. */
export const stepShutter = (index: number, faster: boolean): number => Math.min(SHUTTER_SLOWEST, Math.max(SHUTTER_FASTEST, index + (faster ? -1 : 1)));

/** ISO choices in the panel, a stop apart. The camera may sit between them (set elsewhere); see isoChoices. */
export const ISO_STEPS = [100, 200, 400, 800, 1600, 3200, 6400];
export const GAIN_MIN = 1;
export const GAIN_MAX = 64;

export const isoLabel = (gain: number): string => `ISO ${gain * 100}`;

/** The panel's ISO list, with the camera's current value added when it is not one of the stops. */
export function isoChoices(gain: number): number[] {
  const steps = ISO_STEPS.map((iso) => iso / 100);
  return steps.includes(gain) || gain < 1 ? steps : [...steps, gain].sort((a, b) => a - b);
}

/** The next ISO stop above or below `gain` (as ISO / 100); stays put at either end of the list. */
export function stepIso(gain: number, up: boolean): number {
  const steps = ISO_STEPS.map((iso) => iso / 100);
  return up ? (steps.find((s) => s > gain) ?? Math.max(gain, steps[steps.length - 1])) : ([...steps].reverse().find((s) => s < gain) ?? Math.min(gain, steps[0]));
}
