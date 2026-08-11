const USEPACKAGE_RE = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;

/** Bare package names declared via \usepackage in a preamble, in source order, deduped. */
export function declaredPackages(preamble: string): string[] {
  const packages = new Set<string>();
  for (const match of preamble.matchAll(USEPACKAGE_RE)) {
    for (const name of match[1].split(",")) packages.add(name.trim());
  }
  return [...packages];
}
