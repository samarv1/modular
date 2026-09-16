import { describe, expect, it } from "vitest";
import {
  CompositionError,
  compositionErrorStatus,
  validateCompositionSections,
} from "@/lib/composition";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

describe("validateCompositionSections", () => {
  it("normalizes titles and preserves entry order", () => {
    expect(
      validateCompositionSections([
        { title: " Experience ", entries: [firstId, secondId] },
      ]),
    ).toEqual([{ title: "Experience", entries: [firstId, secondId] }]);
  });

  it.each([
    [undefined, "sections must be an array", 400],
    [[{ title: "", entries: [] }], "each section needs a title", 400],
    [
      [{ title: "Experience", entries: ["bad-id"] }],
      "entry ids must be UUIDs",
      400,
    ],
    [
      [
        { title: "Experience", entries: [] },
        { title: " Experience ", entries: [] },
      ],
      "section titles must be unique within a resume",
      409,
    ],
    [
      [
        { title: "Experience", entries: [firstId] },
        { title: "Projects", entries: [firstId] },
      ],
      "an entry can only appear once in a resume",
      409,
    ],
  ])("rejects invalid input %#", (input, message, status) => {
    try {
      validateCompositionSections(input);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CompositionError);
      expect((error as Error).message).toBe(message);
      expect(compositionErrorStatus((error as CompositionError).code)).toBe(
        status,
      );
    }
  });
});
