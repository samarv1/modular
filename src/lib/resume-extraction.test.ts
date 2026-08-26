import { describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: vi.fn() };
});

const { generateText } = await import("ai");
const { validateByokKey } = await import("./resume-extraction");

// Regression test: verified against the real API that Google's Generative
// Language API rejects a bad key with 400 INVALID_ARGUMENT and an
// API_KEY_INVALID reason in the response body, not 401/403. A version of
// this code that only checked statusCode 401/403 silently misclassified
// every bad key as a generic "check failed" instead of "invalid key".
describe("validateByokKey", () => {
  it("classifies a 401, if Google ever sends one instead of its usual 400, as an invalid key", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(
      new APICallError({
        message: "Incorrect API key provided",
        url: "https://generativelanguage.googleapis.com/...",
        requestBodyValues: {},
        statusCode: 401,
      }),
    );
    const result = await validateByokKey({ apiKey: "x" });
    expect(result).toEqual({ valid: false, reason: "invalid_key" });
  });

  it("classifies Google's 400 API_KEY_INVALID as an invalid key, not a generic failure", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(
      new APICallError({
        message: "API key not valid. Please pass a valid API key.",
        url: "https://generativelanguage.googleapis.com/...",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: JSON.stringify({
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            details: [{ reason: "API_KEY_INVALID" }],
          },
        }),
      }),
    );
    const result = await validateByokKey({ apiKey: "x" });
    expect(result).toEqual({ valid: false, reason: "invalid_key" });
  });

  it("classifies an unrelated 400 as a generic check failure, not an invalid key", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(
      new APICallError({
        message: "model not found",
        url: "https://generativelanguage.googleapis.com/...",
        requestBodyValues: {},
        statusCode: 400,
        responseBody: JSON.stringify({
          error: { code: 400, status: "NOT_FOUND" },
        }),
      }),
    );
    const result = await validateByokKey({ apiKey: "x" });
    expect(result).toEqual({ valid: false, reason: "check_failed" });
  });
});
