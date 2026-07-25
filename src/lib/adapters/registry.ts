import type { ParsedLatexProject, TemplateAdapter } from "./types";
import { jakesResumeV1 } from "./jakes-resume-v1";

export const ADAPTERS: TemplateAdapter[] = [jakesResumeV1];

export function detectAdapter(project: ParsedLatexProject) {
  for (const adapter of ADAPTERS) {
    const result = adapter.detect(project);
    if (result.compatible) return { adapter, result };
  }
  // Single-adapter MVP: report the (only) mismatch we have against the first adapter.
  return { adapter: null, result: ADAPTERS[0].detect(project) };
}
