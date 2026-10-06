"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

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
  return kind === "AUDIO" ? (
    <audio ref={el} src={src} controls preload="metadata" className={className ?? "w-full"} />
  ) : (
    <video ref={el} src={src} controls playsInline preload="metadata" className={className ?? "aspect-video w-full rounded-lg bg-black"} />
  );
});

export default MediaPlayer;
