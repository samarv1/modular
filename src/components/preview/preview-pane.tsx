"use client";

import { Download, FileText, RefreshCw } from "lucide-react";
import { summarizeCompileError } from "@/lib/latex-error";

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
}: {
  compileStatus: string;
  compileError: string | null;
  pageCount: number | null;
  pdfUrl: string | null;
  pdfDownloadUrl: string | null;
  compiling: boolean;
  onCompile: () => void;
}) {
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
            <a
              href={pdfDownloadUrl}
              download
              title="Download PDF"
              className="flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
            >
              <Download className="size-3" />
              Download
            </a>
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
          // view=Fit makes Chrome's built-in PDF viewer fit the whole page
          // (not just its width), so it centers the page in its own
          // background rather than leaving an off-center gap — that's what
          // gives the Overleaf-style dark canvas around the page, with no
          // extra wrapper styling needed here.
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
            title="Resume preview"
            className="h-full w-full"
          />
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
