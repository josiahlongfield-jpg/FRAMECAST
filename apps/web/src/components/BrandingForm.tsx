"use client";

import { useState } from "react";
import { brandStyle, colorProblem, logoPath, MAX_LOGO_BYTES } from "@/lib/branding";

const SWATCHES = ["#3b55e6", "#0f766e", "#1f7a5c", "#b91c1c", "#c2410c", "#7c3aed", "#be185d", "#0f172a"];

export default function BrandingForm(props: { workspaceId: string; name: string; color: string | null; logoUrl: string | null }) {
  const [color, setColor] = useState(props.color ?? "");
  const [logoUrl, setLogoUrl] = useState(props.logoUrl);
  const [file, setFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const problem = color ? colorProblem(color) : null;
  const preview = removeLogo ? null : file ? URL.createObjectURL(file) : logoUrl;

  function pick(f: File | undefined) {
    setMsg(undefined);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) return setMsg({ ok: false, text: "Upload a PNG, JPG or WebP image." });
    if (f.size > MAX_LOGO_BYTES) return setMsg({ ok: false, text: "That image is too big. Use one under 300 KB." });
    setFile(f);
    setRemoveLogo(false);
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const fd = new FormData();
    fd.set("color", color);
    if (file) fd.set("logo", file);
    if (removeLogo) fd.set("removeLogo", "1");
    const res = await fetch("/api/workspace/branding", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Could not save" });
    setLogoUrl(data.hasLogo ? logoPath(props.workspaceId, data.version) : null);
    setFile(null);
    setRemoveLogo(false);
    setMsg({ ok: true, text: "Saved. Your clients see this now." });
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <p className="text-sm font-medium text-slate-700">Logo</p>
          <p className="text-xs text-slate-500">PNG, JPG or WebP, under 300 KB. A wide logo on a transparent background works best.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {preview ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            {preview && (
              <button type="button" onClick={() => { setFile(null); setRemoveLogo(true); }} className="text-sm text-slate-600 hover:text-slate-900">
                Remove
              </button>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Accent colour</p>
          <p className="text-xs text-slate-500">Used for buttons and links your clients see.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Use ${s}`}
                aria-pressed={color === s}
                onClick={() => setColor(s)}
                className={`h-8 w-8 rounded-full ring-offset-2 ${color === s ? "ring-2 ring-slate-900" : ""}`}
                style={{ background: s }}
              />
            ))}
            <input
              type="color"
              aria-label="Custom colour"
              value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#3b55e6"}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-slate-300"
            />
            <input
              aria-label="Colour code"
              value={color}
              placeholder="#3b55e6"
              onChange={(e) => setColor(e.target.value.trim().toLowerCase())}
              className="w-28 rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
            />
            {color && <button type="button" onClick={() => setColor("")} className="text-sm text-slate-600 hover:text-slate-900">Default</button>}
          </div>
          {problem && <p className="mt-2 text-sm text-red-700">{problem}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy || !!problem}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save branding"}
          </button>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">What your clients see</p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" style={brandStyle(problem ? null : color || null)}>
          <div className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-4 font-semibold text-slate-900">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-8 max-w-[8rem] object-contain" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">{props.name.trim().charAt(0).toUpperCase()}</span>
            )}
            <span className="truncate">{props.name}</span>
            <span className="text-xs font-normal text-slate-400">via SureFrame</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Week 3 check-in</div>
            <span className="inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Send reply</span>
            <p className="text-sm"><span className="font-medium text-brand-700">Your to-dos &amp; notes</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
