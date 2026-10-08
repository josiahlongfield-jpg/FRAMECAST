"use client";

import { useEffect, useState } from "react";
import ClientPreview, { type PreviewView } from "@/components/ClientPreview";
import type { Brand } from "@/lib/branding";

export type PreviewMessage = { type: "brand-preview"; brand: Brand; view: PreviewView };

export default function BrandPreviewFrame({ initial, sender, view: initialView }: { initial: Brand; sender: string; view: PreviewView }) {
  const [brand, setBrand] = useState(initial);
  const [view, setView] = useState(initialView);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(location.origin);
    const onMessage = (e: MessageEvent) => {
      // Only the settings page on this site can change what's shown.
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data as PreviewMessage;
      if (m?.type !== "brand-preview") return;
      setBrand(m.brand);
      setView(m.view);
    };
    addEventListener("message", onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: "brand-preview-ready" }, location.origin);
    return () => removeEventListener("message", onMessage);
  }, []);

  // A picture of the pages, not the pages: links and buttons do nothing here.
  return (
    <div onClickCapture={(e) => e.preventDefault()}>
      <ClientPreview brand={brand} view={view} sender={sender} origin={origin} />
    </div>
  );
}
