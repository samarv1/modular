import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("owner-scoped route data access", () => {
  it("keeps direct service-client table access in explicitly unowned routes", () => {
    const appRoot = join(process.cwd(), "src/app");
    const allowed = new Set([
      "api/admin/seed-backfill/route.ts",
      "api/cron/keepalive/route.ts",
    ]);
    const directAccess = typescriptFiles(appRoot)
      .filter((path) =>
        /createServiceClient|\.from\("/.test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(appRoot, path));

    expect(directAccess.sort()).toEqual([...allowed].sort());
  });
});
