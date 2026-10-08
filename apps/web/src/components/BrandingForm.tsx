"use client";

import { useCallback, useMemo, useState } from "react";
import { colorProblem, logoPath, type Brand } from "@/lib/branding";
import { prepareLogo } from "@/lib/logoFile";
import { FullPreview, PreviewStage, Segmented, VIEWS, type Device } from "./BrandPreview";
import type { PreviewView } from "./ClientPreview";

const SWATCHES = ["#3b55e6", "#0f766e", "#1f7a5c", "#b91c1c", "#c2410c", "#7c3aed", "#be185d", "#0f172a"];

export default function BrandingForm(props: { workspaceId: string; name: string; color: string | null; logoUrl: string | null }) {
  const [saved, setSaved] = useState({ color: props.color ?? "", logoUrl: props.logoUrl });
  const [color, setColor] = useState(props.color ?? "");
  // A newly picked logo, ready to upload, and how it looks (a data: URL, shown before saving).
  const [file, setFile] = useState<{ file: File; dataUrl: string; resized: boolean } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [view, setView] = useState<PreviewView>("video");
  const [device, setDevice] = useState<Device>("desktop");
  const [full, setFull] = useState(false);

  const problem = color ? colorProblem(color) : null;
  const logo = removeLogo ? null : file ? file.dataUrl : saved.logoUrl;
  const dirty = !!file || removeLogo || color !== saved.color;
  // The preview follows every change straight away, saved or not. A colour that
  // can't be saved shows the last one that can.
  const brand: Brand = useMemo(() => ({ name: props.name, logoUrl: logo, color: problem ? saved.color || null : color || null }), [props.name, logo, problem, color, saved.color]);

  async function pick(input: HTMLInputElement) {
    const f = input.files?.[0];
    // Let the same file be picked again after removing it.
    input.value = "";
    setMsg(undefined);
    setLogoMsg(undefined);
    if (!f) return;
    const ready = await prepareLogo(f);
    if ("error" in ready) return setLogoMsg(ready.error);
    setFile(ready);
    setRemoveLogo(false);
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const fd = new FormData();
    fd.set("color", color);
    if (file) fd.set("logo", file.file);
    if (removeLogo) fd.set("removeLogo", "1");
    const res = await fetch("/api/workspace/branding", { method: "POST", body: fd }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: data.error ?? "Could not save. Check your connection and try again." });
    setSaved({ color: data.color ?? "", logoUrl: data.hasLogo ? logoPath(props.workspaceId, data.version) : null });
    setColor(data.color ?? "");
    setFile(null);
    setRemoveLogo(false);
    setMsg({ ok: true, text: "Saved. Your clients see this now." });
  }

  const closeFull = useCallback(() => setFull(false), []);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-700">Logo</p>
          <p className="text-xs text-slate-500">PNG, JPG, WebP or SVG. A wide logo on a transparent background works best; large images are resized for you.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="grid h-14 w-40 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Your logo" data-testid="logo-thumb" className="max-h-10 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
            </span>
            <label className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-600">
              {logo ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="sr-only" onChange={(e) => pick(e.currentTarget)} />
            </label>
            {logo && (
              <button type="button" onClick={() => { setFile(null); setRemoveLogo(true); setLogoMsg(undefined); }} className="text-sm text-slate-600 hover:text-slate-900">
                Remove
              </button>
            )}
          </div>
          {logoMsg && <p role="alert" className="mt-2 text-sm text-red-700">{logoMsg}</p>}
          {file?.resized && <p className="mt-2 text-xs text-slate-500">Resized to fit. It stays sharp at the size clients see it.</p>}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Accent colour</p>
          <p className="text-xs text-slate-500">Used for buttons, links and your clients&apos; reply bubbles.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 md:col-span-2">
          <button
            onClick={save}
            disabled={busy || !!problem || !dirty}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save branding"}
          </button>
          {msg ? (
            <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>
          ) : dirty ? (
            <p className="text-sm text-amber-700" data-testid="unsaved">Not saved yet. The preview shows your changes; clients still see the saved version.</p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="preview-title">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full">
            <h2 id="preview-title" className="text-lg font-semibold text-slate-900">What your clients see</h2>
            <p className="text-sm text-slate-500">A live preview with sample content. It updates as you change your logo and colour.</p>
          </div>
          <Segmented label="Page" value={view} options={VIEWS} onChange={setView} />
          <Segmented label="Screen size" value={device} options={[{ id: "desktop", label: "Desktop" }, { id: "phone", label: "Phone" }]} onChange={setDevice} />
          <button type="button" onClick={() => setFull(true)} className="ml-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Open full preview
          </button>
        </div>
        <div className={`mt-4 rounded-2xl p-4 sm:p-6 ${device === "phone" ? "bg-slate-200/70" : "bg-slate-100"}`}>
          <PreviewStage brand={brand} view={view} device={device} testId="brand-preview" />
        </div>
        <p className="mt-2 text-xs text-slate-500">The small &ldquo;Made with SureFrame&rdquo; credit always stays at the bottom of client pages.</p>
      </section>

      {full && <FullPreview brand={brand} view={view} device={device} onView={setView} onDevice={setDevice} onClose={closeFull} />}
    </div>
  );
}
