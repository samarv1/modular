import { createHash } from "crypto";
import { JAKE_CONTRACT_MACROS } from "./macros";

const NEWCOMMAND_RE =
  /\\(?:re)?newcommand\*?\s*\{\s*\\([a-zA-Z]+)\s*\}\s*(?:\[(\d+)\])?/g;

/** name -> declared arg count, read from \newcommand{\name}[N]{...} declarations. */
export function readDeclaredMacroArity(source: string): Map<string, number> {
  const arity = new Map<string, number>();
  for (const match of source.matchAll(NEWCOMMAND_RE)) {
    const [, name, argCount] = match;
    arity.set(name, argCount ? Number(argCount) : 0);
  }
  return arity;
}

export interface ContractCheck {
  compatible: boolean;
  fingerprint?: string;
  missing: string[];
  mismatched: { macro: string; expected: number; found: number }[];
}

const EXPECTED_ARITY: Record<(typeof JAKE_CONTRACT_MACROS)[number], number> = {
  resumeSubheading: 4,
  resumeProjectHeading: 2,
  resumeSubSubheading: 2,
  resumeItem: 1,
  resumeSubHeadingListStart: 0,
  resumeSubHeadingListEnd: 0,
  resumeItemListStart: 0,
  resumeItemListEnd: 0,
};

/**
 * Checks the source's declared macro arities against the Jake contract and,
 * if compatible, builds the fingerprint from that contract alone — package
 * lists, header content, and macro *bodies* are deliberately excluded (see
 * PLAN.md "Key decisions": fingerprint = macro contract only).
 */
export function checkJakeContract(source: string): ContractCheck {
  const declared = readDeclaredMacroArity(source);
  const missing: string[] = [];
  const mismatched: { macro: string; expected: number; found: number }[] = [];

  for (const macro of JAKE_CONTRACT_MACROS) {
    const found = declared.get(macro);
    if (found === undefined) {
      missing.push(macro);
      continue;
    }
    if (found !== EXPECTED_ARITY[macro]) {
      mismatched.push({ macro, expected: EXPECTED_ARITY[macro], found });
    }
  }

  if (missing.length > 0 || mismatched.length > 0) {
    return { compatible: false, missing, mismatched };
  }

  const contractString = JAKE_CONTRACT_MACROS.map(
    (macro) => `${macro}:${EXPECTED_ARITY[macro]}`,
  ).join("|");
  const fingerprint = createHash("sha256").update(contractString).digest("hex");

  return { compatible: true, fingerprint, missing: [], mismatched: [] };
}
