"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useVideoFrame } from "@/lib/videoFrame";

/**
 * Plays a raw browser recording. WebM files recorded in the browser have no
 * duration in their header until they are transcoded; seeking far ahead makes
 * the browser scan the file so the scrubber works immediately.
 */
export function fixDuration(el: HTMLMediaElement) {
  const run = () => {
    if (el.duration !== Infinity) return;
    el.addEventListener("durationchange", () => (el.currentTime = 0), { once: true });
    el.currentTime = 1e101;
  };
  el.addEventListener("loadedmetadata", run, { once: true });
  return () => el.removeEventListener("loadedmetadata", run);
}

type Props = { src: string; kind: "VIDEO" | "AUDIO"; className?: string };

const MediaPlayer = forwardRef<HTMLMediaElement | null, Props>(function MediaPlayer({ src, kind, className }, ref) {
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useImperativeHandle(ref, () => el.current!, []);
  useEffect(() => (el.current ? fixDuration(el.current) : undefined), [src]);
  // Video replies take their own shape (a phone's portrait camera too), so they fill the frame without black bars.
  const frame = useVideoFrame("60vh");
  const frameRef = frame.ref;
  useEffect(() => frameRef(el.current), [frameRef, src]);
  if (kind === "AUDIO") return <audio ref={el} src={src} controls preload="metadata" className={className ?? "w-full"} />;
  if (className) return <video ref={el} src={src} controls playsInline preload="metadata" className={className} />;
  return (
    <div style={frame.style} className="relative mx-auto overflow-hidden rounded-lg bg-black">
      <video ref={el} src={src} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
    </div>
  );
});

export default MediaPlayer;
