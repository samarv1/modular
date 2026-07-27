/** Removes unescaped LaTeX comments while preserving line boundaries. */
export function stripLatexComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== "%") continue;
        let backslashes = 0;
        for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++;
        if (backslashes % 2 === 0) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}
