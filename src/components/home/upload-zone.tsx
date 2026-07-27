"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import type { ResumeRow } from "@/app/api/resumes/route";

interface MismatchReport {
  reason: string;
  details?: unknown;
}

// Only ever rendered inside an open folder (see Desktop) — uploading isn't
// a top-level desktop action, it's something you do once you've drilled
// into a folder to add source material to it. The resulting resume lands
// in that same folder (`folderId`), not on the top-level desktop, and
// `onUploaded` splices it into Desktop's state directly — no navigation or
// full page reload.
export function UploadZone({
  folderId,
  onUploaded,
}: {
  folderId: string;
  onUploaded: (resume: ResumeRow) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mismatch, setMismatch] = useState<MismatchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  async function upload(file: File) {
    if (uploading) return; // guard double-submit — POST /api/imports isn't idempotent
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("only .zip exports are supported");
      return;
    }

    setUploading(true);
    setError(null);
    setMismatch(null);
    setImported(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folderId", folderId);
      const res = await fetch("/api/imports", { method: "POST", body: form });

      let body: Record<string, unknown> | null = null;
      try {
        body = await res.json();
      } catch {
        setError("upload failed, try again");
        return;
      }

      if (res.ok && body?.compatible) {
        const resume = body.resume as ResumeRow;
        onUploaded(resume);
        setImported(resume.title);
        setTimeout(() => setImported(null), 3000);
        return;
      }
      if (body?.mismatchReport) {
        setMismatch(body.mismatchReport as MismatchReport);
        return;
      }
      setError(typeof body?.error === "string" ? body.error : "upload failed, try again");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-[11.5px] transition-colors ${
          dragOver ? "border-brand bg-brand-wash" : "border-line-strong text-faint"
        }`}
      >
        <Upload className="size-3.5 shrink-0" />
        <span>Drop a resume ZIP, or</span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="font-mono text-[10.5px] uppercase tracking-wide text-brand hover:underline disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "browse"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {imported && (
        <div className="rounded-md border border-ok bg-ok-bg px-3 py-2 text-[11.5px] text-ink">
          Imported &quot;{imported}&quot; &mdash; it&apos;s in this folder now.
        </div>
      )}
      {mismatch && (
        <div className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-[11.5px] text-ink">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-danger">
            Structural mismatch
          </div>
          <p className="mt-1 text-muted-fg">{mismatch.reason}</p>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-[11.5px] text-ink">
          {error}
        </div>
      )}
    </div>
  );
}
