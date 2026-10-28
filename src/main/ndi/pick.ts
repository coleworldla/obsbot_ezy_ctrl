/**
 * Auto NDI source matching, kept free of the NDI runtime so it can be tested on its own.
 */
import type { CameraConfig, NdiSource } from '../../shared/types';

/**
 * The source a camera on Auto receives: 1. the one advertised from its IP; 2. one whose NDI name carries the
 * camera's name; 3. a Tail 2 with Ethernet and Wi-Fi both up may advertise NDI from its other address, so the
 * one Tail 2 left over, but only while the camera's own control answers (an entry whose camera is off must not
 * borrow a neighbour's picture). 2 and 3 skip sources another camera receives or that come from another camera's
 * address.
 */
export function pickAutoSource(list: NdiSource[], cfg: Pick<CameraConfig, 'host' | 'name' | 'kind'>, others: { host: string; source: string | null }[], online: boolean): NdiSource | undefined {
  const hostOf = (s: NdiSource) => s.url.split(':')[0];
  const own = cfg.host ? list.find((s) => hostOf(s) === cfg.host) : undefined;
  if (own) return own;
  const free = list.filter((s) => !others.some((o) => o.source === s.name || (!!o.host && hostOf(s) === o.host)));
  const byName = cfg.name.trim() ? free.find((s) => s.name.toUpperCase().includes(cfg.name.trim().toUpperCase())) : undefined;
  if (byName) return byName;
  const tails = free.filter((s) => /TAIL/i.test(s.name));
  return tails.length === 1 && cfg.kind !== 'monitor' && online ? tails[0] : undefined;
}
