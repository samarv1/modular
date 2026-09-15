import { detectAdapter } from "@/lib/adapters/registry";
import { nextFreePlacement, nextPlacement } from "@/lib/desktop-placement";
import { DEMO_RESUME_ID } from "@/lib/demo-resume-id";
import { flattenEntries } from "@/lib/flatten-entries";
import type { ResumeMetaRow } from "@/lib/resume-composition-query";
import type { BankEntryRow, ResumeRow, SourceResumeRow } from "@/lib/rows";
import { STATIC_PAGES } from "@/lib/static-pages";
import { SAMPLE_RESUME_TEX } from "./sample-resume-source";

const ROOT_FILE = "resume.tex";
const SAMPLE_TITLE = "Jake's Resume";

export { DEMO_RESUME_ID };

export interface DemoWorkspace {
  entries: BankEntryRow[];
  resume: ResumeRow;
  editorResume: ResumeMetaRow;
  sourceResume: SourceResumeRow;
}

let cached: DemoWorkspace | null = null;

// The fixed fixture produces one immutable workspace shared by server requests.
export function getDemoWorkspace(): DemoWorkspace {
  if (cached) return cached;

  const project = { rootFile: ROOT_FILE, source: SAMPLE_RESUME_TEX };
  const { adapter, result } = detectAdapter(project);
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

  const staticPositions = STATIC_PAGES.map((_, index) => nextPlacement(index));
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

  entries.forEach((entry) => Object.freeze(entry));
  Object.freeze(entries);
  Object.freeze(resume);
  Object.freeze(editorResume);
  Object.freeze(sourceResume);

  cached = { entries, resume, editorResume, sourceResume };
  return cached;
}
