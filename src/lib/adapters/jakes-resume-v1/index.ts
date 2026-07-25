import type {
  AssembledLatexProject,
  DetectionResult,
  ParsedLatexProject,
  ResumeComposition,
  TemplateAdapter,
} from "../types";
import { checkJakeContract } from "./fingerprint";
import { extractJakeResume } from "./extract";

const ADAPTER_ID = "jakes-resume-v1";

export const jakesResumeV1: TemplateAdapter = {
  id: ADAPTER_ID,

  detect(project: ParsedLatexProject): DetectionResult {
    const contract = checkJakeContract(project.source);
    if (!contract.compatible) {
      const details = [
        ...contract.missing.map((m) => `missing required macro \\${m}`),
        ...contract.mismatched.map(
          (m) => `\\${m.macro} expected ${m.expected} argument(s), found ${m.found}`,
        ),
      ];
      return {
        compatible: false,
        adapterId: ADAPTER_ID,
        mismatchReport: { reason: "macro contract mismatch", details },
      };
    }
    return { compatible: true, adapterId: ADAPTER_ID, fingerprint: contract.fingerprint };
  },

  extract(project: ParsedLatexProject) {
    return extractJakeResume(project.source);
  },

  assemble(_input: ResumeComposition): AssembledLatexProject {
    // Phase 6: reassembles a ResumeComposition into a compile-ready document
    // using the preamble-union rule in PLAN.md. Not needed until the compile
    // worker exists, so left unimplemented for now.
    throw new Error("jakes-resume-v1.assemble is not implemented yet (Phase 6)");
  },
};
