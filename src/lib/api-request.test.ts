import { describe, expect, it } from "vitest";
import { mutationErrorStatus, readJsonObject } from "./api-request";

describe("readJsonObject", () => {
  it("accepts plain JSON objects", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ title: "Resume" }),
    });
    await expect(readJsonObject(request)).resolves.toEqual({ title: "Resume" });
  });

  it.each(["null", "[]", '"text"', "{"])(
    "rejects a non-object or malformed body: %s",
    async (body) => {
      const request = new Request("http://localhost", { method: "POST", body });
      await expect(readJsonObject(request)).resolves.toBeNull();
    },
  );
});

describe("mutationErrorStatus", () => {
  it("maps expected database failures without disguising server errors as 404s", () => {
    expect(mutationErrorStatus({ code: "PGRST116" })).toBe(404);
    expect(mutationErrorStatus({ code: "23503" })).toBe(422);
    expect(mutationErrorStatus({ code: "22P02" })).toBe(400);
    expect(mutationErrorStatus({ code: "unexpected" })).toBe(500);
  });
});
