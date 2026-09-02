import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  SAMPLE_RESUME_LICENSE,
  SAMPLE_RESUME_TEX,
} from "./sample-resume-source";

const fixtureDir = join(__dirname, "../../fixtures/jakes-resume");

describe("sample resume source constants", () => {
  it("matches resume.tex byte for byte", () => {
    expect(SAMPLE_RESUME_TEX).toBe(
      readFileSync(join(fixtureDir, "resume.tex"), "utf8"),
    );
  });

  it("matches LICENSE byte for byte", () => {
    expect(SAMPLE_RESUME_LICENSE).toBe(
      readFileSync(join(fixtureDir, "LICENSE"), "utf8"),
    );
  });
});
