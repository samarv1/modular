"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Upload } from "lucide-react";
import type { BankEntryRow } from "@/lib/rows";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";

export interface ImportResult {
  templateShellId: string;
  sourceResumeId: string;
  entryCount: number;
  entries: BankEntryRow[];
  sections: { title: string; entryCount: number }[];
}

export interface UploadStatus {
  kind: "success" | "mismatch" | "error";
  message: string;
}

export interface UploadZoneHandle {
  open: () => void;
}

// Rendered both on the home desktop and inside the resume editor's bank
// pane — imports only ever add to the owner's bank now, so there's nothing
// folder- or resume-specific about the upload itself; callers just react to
// the entries that came back. Status (success/mismatch/error) is reported
// via onStatus rather than rendered here, since the two callers want it in
// different places (desktop: beside the drop zone; bank pane: near its
// upload button) — this component owns the upload, not where feedback shows.
export const UploadZone = forwardRef<
  UploadZoneHandle,
  {
    onImported: (result: ImportResult) => void;
    onStatus?: (status: UploadStatus | null) => void;
    // Bank pane's upload button opens the file picker directly — no visible
    // drop target, just the (still functional) hidden file input.
    hideDropzone?: boolean;
  }
>(function UploadZone({ onImported, onStatus, hideDropzone }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    open: () => inputRef.current?.click(),
  }));

  async function upload(file: File) {
    if (uploading) return; // guard double-submit — POST /api/imports isn't idempotent
    if (!file.name.toLowerCase().endsWith(".zip")) {
      onStatus?.({ kind: "error", message: "only .zip exports are supported" });
      return;
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      onStatus?.({ kind: "error", message: "that ZIP is too large to import" });
      return;
    }

    setUploading(true);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    onStatus?.(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/imports", { method: "POST", body: form });

      let body: Record<string, unknown> | null = null;
      try {
        body = await res.json();
      } catch {
        onStatus?.({ kind: "error", message: "upload failed, try again" });
        return;
      }

      if (res.ok && body?.compatible) {
        const result = body as unknown as ImportResult;
        onImported(result);
        onStatus?.({ kind: "success", message: `Added "${file.name.replace(/\.zip$/i, "")}" to your bank.` });
        statusTimerRef.current = setTimeout(() => onStatus?.(null), 3000);
        return;
      }
      if (body?.mismatchReport) {
        const report = body.mismatchReport as { reason: string };
        onStatus?.({ kind: "mismatch", message: report.reason });
        return;
      }
      onStatus?.({
        kind: "error",
        message: typeof body?.error === "string" ? body.error : "upload failed, try again",
      });
    } catch {
      onStatus?.({ kind: "error", message: "upload failed, try again" });
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

  const input = (
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
  );

  if (hideDropzone) return input;

  return (
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
      {input}
    </div>
  );
});
