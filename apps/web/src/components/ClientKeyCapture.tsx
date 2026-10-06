"use client";

import { useEffect } from "react";
import { importKey } from "@/lib/e2e/crypto";
import { clientKeyName, saveKey } from "@/lib/e2e/keystore";

/** Saves the key from a personal link's #fragment on this device, then hides it from the address bar. */
export default function ClientKeyCapture({ clientId }: { clientId: string }) {
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (!k) return;
    importKey(k)
      .then((key) => saveKey(clientKeyName(clientId), key))
      .catch(() => {})
      .finally(() => history.replaceState(null, "", window.location.pathname));
  }, [clientId]);
  return null;
}
