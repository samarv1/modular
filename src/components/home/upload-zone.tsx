"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive-limits";

export interface UploadZoneHandle {
  open: () => void;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;

// Pure file-selection: validates the picked/dropped file and hands it up via
// onFileSelected. Owns no fetch/status of its own — the import review modals
// (import-review-modal.tsx for .zip, pdf-import-review-modal.tsx for .pdf)
// do the actual upload, so this can be reused both there and as a plain
// "open the file picker" trigger (e.g. the bank pane's Upload button,
// hideDropzone: true). Accepts either a LaTeX export or a plain PDF resume;
// the caller branches on extension to pick which review modal to open.
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
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      if (file.size > MAX_ARCHIVE_BYTES) {
        onRejected?.("that ZIP is too large to import");
        return;
      }
      onFileSelected(file);
      return;
    }
    if (name.endsWith(".pdf")) {
      if (file.size > MAX_PDF_BYTES) {
        onRejected?.("that PDF is too large to import");
        return;
      }
      onFileSelected(file);
      return;
    }
    onRejected?.("only a resume .zip or .pdf is supported");
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
      accept=".zip,.pdf"
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
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span>Drop a resume ZIP or PDF, or</span>
          <button
            onClick={() => inputRef.current?.click()}
            className="font-mono text-[10.5px] uppercase tracking-wide text-brand hover:underline"
          >
            browse
          </button>
        </div>
        <span className="text-[10.5px] text-muted-fg">ZIP imports faster and keeps your exact formatting</span>
      </div>
      {input}
    </div>
  );
});
