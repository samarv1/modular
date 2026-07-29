import { Sandbox } from "@vercel/sandbox";

// PLAN.md: compile worker boots from a pre-built snapshot with TeX Live
// already installed, rather than installing texlive per-request (multi-GB,
// would blow the request budget). Run scripts/create-texlive-snapshot.mjs
// once and set TEXLIVE_SNAPSHOT_ID to produce this.
const PASS_TIMEOUT_MS = 60_000;
const SOURCE_FILENAME = "resume.tex";
const PDF_FILENAME = "resume.pdf";

export interface CompileResult {
  success: boolean;
  pdf: Buffer | null;
  log: string;
  pageCount: number | null;
}

const PAGE_COUNT_RE = /Output written on \S+ \((\d+) pages?,/;

export async function compileLatexInSandbox(source: string): Promise<CompileResult> {
  const snapshotId = process.env.TEXLIVE_SNAPSHOT_ID;
  if (!snapshotId) {
    throw new Error(
      "TEXLIVE_SNAPSHOT_ID is not set. Run `node scripts/create-texlive-snapshot.mjs` once and add the resulting id to .env.",
    );
  }

  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: PASS_TIMEOUT_MS * 2 + 30_000,
  });

  try {
    await sandbox.writeFiles([{ path: SOURCE_FILENAME, content: source }]);

    let result;
    // Run pdflatex twice (PLAN.md decision): resolves cross-references
    // (\ref, \pageref, TOC-style headers/footers) some Jake variants may
    // introduce via header/footer restyling. The canonical template doesn't
    // need it, but the cost of a second pass is small next to sandbox boot.
    for (let pass = 0; pass < 2; pass++) {
      result = await sandbox.runCommand(
        "pdflatex",
        ["-interaction=nonstopmode", "-halt-on-error", SOURCE_FILENAME],
        { timeoutMs: PASS_TIMEOUT_MS },
      );
    }

    const log = await result!.stdout();
    if (result!.exitCode !== 0) {
      return { success: false, pdf: null, log, pageCount: null };
    }

    const pdf = await sandbox.readFileToBuffer({ path: PDF_FILENAME });
    const pageCount = PAGE_COUNT_RE.exec(log)?.[1];
    return { success: pdf !== null, pdf, log, pageCount: pageCount ? Number(pageCount) : null };
  } finally {
    await sandbox.stop();
  }
}
