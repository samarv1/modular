import type {
  AssembledLatexProject,
  DetectionResult,
  ParsedLatexProject,
  ResumeComposition,
  TemplateAdapter,
} from "../types";
import { checkJakeContract } from "./fingerprint";
import { extractJakeResume } from "./extract";
import { assembleJakeResume } from "./assemble";

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

  assemble(input: ResumeComposition): AssembledLatexProject {
    return assembleJakeResume(input);
  },
};
