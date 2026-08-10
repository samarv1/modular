"use client";

import { useState } from "react";
import { Download, FileText, FolderArchive, RefreshCw } from "lucide-react";
import { summarizeCompileError } from "@/lib/latex-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_LABEL: Record<string, string> = {
  unbuilt: "Not compiled yet",
  compiling: "Compiling…",
  success: "Compiled",
  failed: "Compile failed",
  blocked_multipage: "Multi-page — export blocked",
};

const STATUS_COLOR: Record<string, string> = {
  success: "text-brand",
  failed: "text-danger",
  blocked_multipage: "text-danger",
};

export function PreviewPane({
  compileStatus,
  compileError,
  pageCount,
  pdfUrl,
  pdfDownloadUrl,
  compiling,
  onCompile,
  exporting,
  onExport,
}: {
  compileStatus: string;
  compileError: string | null;
  pageCount: number | null;
  pdfUrl: string | null;
  pdfDownloadUrl: string | null;
  compiling: boolean;
  onCompile: () => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className={STATUS_COLOR[compileStatus] ?? "text-faint"}>
            {STATUS_LABEL[compileStatus] ?? compileStatus}
          </span>
          {pageCount !== null && (
            <span className="text-faint">
              {pageCount} page{pageCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {pdfDownloadUrl && (
            <button
              onClick={() => setDownloadMenuOpen(true)}
              title="Download"
              className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
            >
              <Download className="size-3" />
              Download
            </button>
          )}
          <button
            onClick={onCompile}
            disabled={compiling}
            className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${compiling ? "animate-spin" : ""}`} />
            {compiling ? "Compiling" : "Compile"}
          </button>
        </div>
      </div>

      <Dialog open={downloadMenuOpen} onOpenChange={setDownloadMenuOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Download</DialogTitle>
            <DialogDescription>Choose what to download.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <a
              href={pdfDownloadUrl ?? undefined}
              download
              onClick={() => setDownloadMenuOpen(false)}
              className="flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-[12px] hover:border-brand hover:text-brand"
            >
              <FileText className="size-3.5" />
              <span className="flex flex-col">
                <span className="font-medium">PDF</span>
                <span className="text-[10.5px] text-faint">Just the compiled resume</span>
              </span>
            </a>
            <button
              onClick={() => {
                setDownloadMenuOpen(false);
                onExport();
              }}
              disabled={compileStatus !== "success" || exporting}
              className="flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-left text-[12px] hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderArchive className="size-3.5" />
              <span className="flex flex-col">
                <span className="font-medium">{exporting ? "Exporting…" : "LaTeX source (ZIP)"}</span>
                <span className="text-[10.5px] text-faint">
                  {compileStatus === "success"
                    ? "Full source + shell assets, no PDF"
                    : "Compile to one page to enable"}
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {compileStatus === "blocked_multipage" && (
        <p className="text-[11.5px] text-danger">
          This build compiles to more than one page. Trim it to one page before exporting.
        </p>
      )}

      {compileError &&
        (() => {
          const { headline, isEnvironmentIssue } = summarizeCompileError(compileError);
          // Environment/infra failures (a missing package on the compile
          // setup, a Sandbox boot error) are our bugs, not the user's —
          // nothing actionable for them, so no detail or log is surfaced at
          // all, just a plain retry prompt. Only genuine LaTeX content
          // errors get the headline + full log.
          if (isEnvironmentIssue) {
            return (
              <p className="rounded-md border border-line-strong bg-surface p-2 text-[11px] text-muted-fg">
                Something went wrong compiling this resume. Try again in a moment.
              </p>
            );
          }
          return (
            <div className="rounded-md border border-line-strong bg-surface p-2 text-[11px]">
              <p className="text-danger">{headline}</p>
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:text-brand">
                  Full log
                </summary>
                <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap text-[10.5px] text-faint">
                  {compileError}
                </pre>
              </details>
            </div>
          );
        })()}

      <div className="min-h-0 flex-1">
        {pdfUrl ? (
          // Size the frame to the page's own letter-size aspect ratio and
          // center it, instead of letting the iframe fill the whole pane —
          // otherwise Chrome's PDF viewer letterboxes the page in its own
          // dark canvas whenever the pane is taller than a single page.
          <div className="flex h-full w-full items-start">
            <div className="aspect-[8.5/11] w-full max-h-full">
              <iframe
                src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                title="Resume preview"
                className="h-full w-full"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[12.5px] text-faint">
            <FileText className="size-4" />
            Compile to see a preview.
          </div>
        )}
      </div>
    </div>
  );
}
