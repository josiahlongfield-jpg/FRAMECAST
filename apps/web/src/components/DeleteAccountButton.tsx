"use client";

import { useFormStatus } from "react-dom";

/** Shows that deletion is under way, since it can take a few seconds. */
export default function DeleteAccountButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
      {pending ? "Deleting…" : "Delete my account"}
    </button>
  );
}
