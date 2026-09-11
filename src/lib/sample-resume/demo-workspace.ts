import { detectAdapter } from "@/lib/adapters/registry";
import { flattenEntries } from "@/lib/import-commit";
import { nextFreePlacement, nextPlacement } from "@/lib/desktop-placement";
import { STATIC_PAGES } from "@/lib/static-pages";
import type { BankEntryRow, ResumeRow, SourceResumeRow } from "@/lib/rows";
import type { ResumeMetaRow } from "@/lib/resume-composition-query";
import { DEMO_RESUME_ID } from "@/lib/demo-resume-id";
import { SAMPLE_RESUME_TEX } from "./sample-resume-source";

// Anonymous-visitor equivalent of seed-sample-resume.ts. Same Jake fixture
// and extraction path, held in memory instead of written to the database.
// An anonymous visitor never gets a Supabase session, so there is no owner
// to scope rows to and nothing gets written to storage.

const ROOT_FILE = "resume.tex";
const SAMPLE_TITLE = "Jake's Resume";

export { DEMO_RESUME_ID };

export interface DemoWorkspace {
  entries: BankEntryRow[];
  /** Desktop icon shape (src/app/page.tsx's resume listing). */
  resume: ResumeRow;
  /** Editor shape (src/app/resume/[id]/page.tsx -> ResumeEditor). */
  editorResume: ResumeMetaRow;
  sourceResume: SourceResumeRow;
}

let cached: DemoWorkspace | null = null;

// The fixture is fixed, so this is identical for every visitor and every
// request. Computed once per server instance, not per request.
export function getDemoWorkspace(): DemoWorkspace {
  if (cached) return cached;

  const project = { rootFile: ROOT_FILE, source: SAMPLE_RESUME_TEX };
  const { adapter, result } = detectAdapter(project);
  // The fixture is the adapter's own reference document (same assumption
  // seed-sample-resume.ts makes), so a mismatch here means the adapter or
  // the fixture changed out from under the other, not bad input.
  if (!adapter || !result.compatible) {
    throw new Error("sample resume was not recognized by any adapter");
  }

  const extracted = adapter.extract(project);
  const flatEntries = flattenEntries(extracted);
  const now = new Date().toISOString();

  const entries: BankEntryRow[] = flatEntries.map((entry) => ({
    id: `demo-entry-${entry.index}`,
    kind: entry.kind,
    source_section: entry.sourceSection,
    display_name: entry.displayName,
    raw_latex: entry.rawLatex,
    tags: [],
    required_packages: entry.requiredPackages,
    source_resume_id: "demo-source",
    source_resume: { display_name: SAMPLE_TITLE },
    created_at: now,
  }));

  // Placed the same way seed-sample-resume.ts places a real seeded resume:
  // scanned past the static pages' own default grid cells (About, Bank),
  // not at (0, 0), or it lands underneath the first static page icon.
  const staticPositions = STATIC_PAGES.map((_, i) => nextPlacement(i));
  const placement = nextFreePlacement(staticPositions);

  const resume: ResumeRow = {
    id: DEMO_RESUME_ID,
    title: SAMPLE_TITLE,
    template_shell_id: "demo-shell",
    compile_status: "unbuilt",
    folder_id: null,
    position_x: placement.x,
    position_y: placement.y,
    updated_at: now,
    created_at: now,
  };

  const editorResume: ResumeMetaRow = {
    id: DEMO_RESUME_ID,
    title: SAMPLE_TITLE,
    template_shell_id: "demo-shell",
    compile_status: "unbuilt",
    compile_error: null,
    pdf_artifact_path: null,
    page_count: null,
    updated_at: now,
  };

  const sourceResume: SourceResumeRow = {
    id: "demo-source",
    display_name: SAMPLE_TITLE,
    created_at: now,
  };

  cached = { entries, resume, editorResume, sourceResume };
  return cached;
}
