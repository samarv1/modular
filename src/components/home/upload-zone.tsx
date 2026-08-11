"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";

export interface UploadZoneHandle {
  open: () => void;
}

// Pure file-selection: validates the picked/dropped file and hands it up via
// onFileSelected. Owns no fetch/status of its own — the import review modal
// (src/components/home/import-review-modal.tsx) does the actual upload, so
// this can be reused both there and as a plain "open the file picker"
// trigger (e.g. the bank pane's Upload button, hideDropzone: true).
export const UploadZone = forwardRef<
  UploadZoneHandle,
  {
    onFileSelected: (file: File) => void;
    onRejected?: (message: string) => void;
    hideDropzone?: boolean;
  }
>(function UploadZone({ onFileSelected, onRejected, hideDropzone }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => inputRef.current?.click(),
  }));

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      onRejected?.("only .zip exports are supported");
      return;
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      onRejected?.("that ZIP is too large to import");
      return;
    }
    onFileSelected(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".zip"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
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
        className="font-mono text-[10.5px] uppercase tracking-wide text-brand hover:underline"
      >
        browse
      </button>
      {input}
    </div>
  );
});
