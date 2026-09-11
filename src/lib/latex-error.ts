// pdflatex's log is dominated by a nested-paren trace of every file it
// loads — the actual problem is always on a line starting with "!", usually
// followed later by an "l.NN" reference to the line that triggered it. This
// pulls just that out so the UI can lead with a one-line cause instead of
// the raw log.
//
// Not every failure is the user's fault, though: a missing .sty/.cls file
// (or an error thrown before pdflatex even ran, e.g. Sandbox boot) means the
// compile environment is missing something or misconfigured — not that the
// user's resume content is wrong. isEnvironmentIssue distinguishes the two
// so the UI doesn't imply the user broke something they can't see or fix.
const ERROR_LINE_RE = /^! (.+)$/m;
const LINE_REF_RE = /^l\.(\d+)/m;
const MISSING_FILE_RE = /^! LaTeX Error: File `([^']+)' not found\.$/m;
const ENV_ERROR_PREFIX = "Compile environment error: ";
// Vercel Sandbox throws "Status code 402 is not ok." once the account's
// Sandbox usage quota for the billing cycle is exhausted. Unlike other
// environment errors, this won't clear on its own retry — it needs the
// billing cycle to reset or the plan to change — so it gets its own copy
// instead of the generic "try again in a moment" environment message.
const CAPACITY_ERROR_RE = /\b402\b/;
const CAPACITY_HEADLINE =
  "We've hit our plan's compiling capacity for now. Please check back soon.";

export interface CompileErrorSummary {
  headline: string;
  isEnvironmentIssue: boolean;
  isCapacityIssue: boolean;
}

export function summarizeCompileError(raw: string): CompileErrorSummary {
  if (raw.startsWith(ENV_ERROR_PREFIX)) {
    const detail = raw.slice(ENV_ERROR_PREFIX.length);
    if (CAPACITY_ERROR_RE.test(detail)) {
      return {
        headline: CAPACITY_HEADLINE,
        isEnvironmentIssue: true,
        isCapacityIssue: true,
      };
    }
    return {
      headline: detail,
      isEnvironmentIssue: true,
      isCapacityIssue: false,
    };
  }

  const missingFile = MISSING_FILE_RE.exec(raw);
  if (missingFile) {
    return {
      headline: `The compile environment is missing a required file (${missingFile[1]}).`,
      isEnvironmentIssue: true,
      isCapacityIssue: false,
    };
  }

  const errorMatch = ERROR_LINE_RE.exec(raw);
  if (errorMatch) {
    const lineMatch = LINE_REF_RE.exec(raw);
    return {
      headline: lineMatch
        ? `${errorMatch[1]} (near line ${lineMatch[1]} of the assembled document)`
        : errorMatch[1],
      isEnvironmentIssue: false,
      isCapacityIssue: false,
    };
  }

  return {
    headline: "The compiler reported an error — see the full log below.",
    isEnvironmentIssue: true,
    isCapacityIssue: false,
  };
}
