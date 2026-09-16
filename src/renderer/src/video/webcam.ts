/**
 * System video devices as a picture source: the Tail 2 over USB-C (UVC mode), or an NDI source
 * turned into a webcam by NDI Tools → Webcam Input. No native code needed.
 */

export interface VideoInput {
  deviceId: string;
  label: string;
}

/** List video inputs; opens a stream once so device labels become visible. */
export async function listVideoInputs(): Promise<VideoInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let all = await navigator.mediaDevices.enumerateDevices();
  if (all.some((d) => d.kind === 'videoinput' && !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
      all = await navigator.mediaDevices.enumerateDevices();
    } catch {
      /* no permission or no device; labels stay empty */
    }
  }
  return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

export function openWebcam(deviceId: string): Promise<MediaStream> {
  const video: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
    : { width: { ideal: 1920 }, height: { ideal: 1080 } };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}
