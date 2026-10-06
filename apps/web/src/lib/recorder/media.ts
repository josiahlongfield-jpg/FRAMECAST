export type Mode = "screen+camera" | "screen" | "camera";
export type Quality = 720 | 1080 | 2160;

const CANDIDATE_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a", // Safari
  "video/mp4",
];

export function pickMimeType() {
  return CANDIDATE_TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "video/webm";
}

export function bitrateFor(q: Quality) {
  return q >= 2160 ? 16_000_000 : q >= 1080 ? 5_000_000 : 2_500_000;
}

const dims = (q: Quality) => ({ width: Math.round((q * 16) / 9), height: q });

export async function getCamera(deviceId: string | undefined, q: Quality) {
  const { width, height } = dims(Math.min(q, 1080) as Quality);
  return navigator.mediaDevices.getUserMedia({
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } },
    audio: false,
  });
}

export async function getMic(deviceId: string | undefined) {
  return navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export async function getScreen(q: Quality) {
  const { width, height } = dims(q);
  return navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30, max: 30 } },
    audio: true, // tab/system audio where the browser supports it
  });
}

/** Mix mic and screen audio into one track so neither is lost. */
export function mixAudio(streams: MediaStream[]): { track?: MediaStreamTrack; close: () => void } {
  const sources = streams.filter((s) => s.getAudioTracks().length > 0);
  if (sources.length === 0) return { close: () => {} };
  if (sources.length === 1) return { track: sources[0].getAudioTracks()[0], close: () => {} };
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  for (const s of sources) ctx.createMediaStreamSource(s).connect(dest);
  return { track: dest.stream.getAudioTracks()[0], close: () => void ctx.close() };
}

/**
 * Float the camera above every app using Document Picture-in-Picture
 * (Chrome/Edge), falling back to classic video PiP. When the user shares
 * their entire screen the bubble is captured in the recording.
 */
export async function openCameraBubble(camera: MediaStream): Promise<() => void> {
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } })
    .documentPictureInPicture;
  if (dpip) {
    try {
      const pip = await dpip.requestWindow({ width: 240, height: 240 });
      pip.document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
      const v = pip.document.createElement("video");
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.srcObject = camera;
      v.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;transform:scaleX(-1)";
      pip.document.body.append(v);
      return () => pip.close();
    } catch {
      /* fall through */
    }
  }
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = camera;
  await v.play();
  try {
    await v.requestPictureInPicture();
    return () => void document.exitPictureInPicture().catch(() => {});
  } catch {
    return () => {};
  }
}

export function stopAll(...streams: (MediaStream | null | undefined)[]) {
  for (const s of streams) s?.getTracks().forEach((t) => t.stop());
}
