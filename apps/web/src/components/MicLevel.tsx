"use client";

import { useEffect, useRef, useState } from "react";
import { getMic, stopAll } from "@/lib/recorder/media";

/** How loud counts as "we can hear you" (RMS of the signal, 0 to 1). */
const HEARD = 0.02;
/** Silence this long after the meter starts gets a warning. */
const QUIET_MS = 6000;

/**
 * A live level bar for the chosen microphone, shown while setting up, so
 * nobody records a whole video before finding out the mic wasn't working.
 * It only measures loudness on this device; nothing is recorded or sent.
 */
export default function MicLevel({ deviceId }: { deviceId: string | undefined }) {
  const bar = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"starting" | "listening" | "heard" | "quiet" | "blocked">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;
    let quietTimer = 0;
    let cancelled = false;
    setState("starting");

    getMic(deviceId)
      .then((s) => {
        if (cancelled) return stopAll(s);
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let level = 0;
        let heard = false;
        setState("listening");
        quietTimer = window.setTimeout(() => !heard && setState("quiet"), QUIET_MS);
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          const rms = Math.sqrt(sum / samples.length);
          // Rise quickly, fall gently, so speech reads as a steady bar.
          level = Math.max(rms, level * 0.9);
          if (bar.current) bar.current.style.width = `${Math.min(100, Math.round(Math.sqrt(level) * 220))}%`;
          if (!heard && rms > HEARD) {
            heard = true;
            window.clearTimeout(quietTimer);
            setState("heard");
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => !cancelled && setState("blocked"));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(quietTimer);
      stopAll(stream);
      void ctx?.close().catch(() => {});
    };
  }, [deviceId]);

  return (
    <div className="grid gap-1" data-testid="mic-level" data-state={state}>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div ref={bar} className={`h-full w-0 rounded-full transition-[width] duration-75 ${state === "quiet" ? "bg-amber-500" : "bg-emerald-500"}`} />
      </div>
      <span className={`text-xs ${state === "quiet" || state === "blocked" ? "text-amber-800" : "text-slate-500"}`} aria-live="polite">
        {state === "starting" && "Checking your microphone…"}
        {state === "listening" && "Say something to test your microphone."}
        {state === "heard" && "Your microphone is working."}
        {state === "quiet" && "We can't hear anything yet. Check the microphone is plugged in, not muted, and the right one is selected above."}
        {state === "blocked" && "We can't use this microphone. Allow it in your browser's address bar, or pick another one above."}
      </span>
    </div>
  );
}
