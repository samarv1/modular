// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImportErrorMessage } from "./import-error-message";

afterEach(cleanup);

describe("ImportErrorMessage", () => {
  it("prompts the user to add their own key when the shared key hits its cap, with a link to Settings", () => {
    render(
      <ImportErrorMessage
        message="ignored for this code"
        code="shared_key_cap_reached"
      />,
    );
    expect(screen.getByText(/add your own api key/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("tells the user their key was rejected and links to Settings, for a bad BYOK key", () => {
    render(
      <ImportErrorMessage
        message="ignored for this code"
        code="byok_key_rejected"
      />,
    );
    expect(screen.getByText(/gemini api key was rejected/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("falls back to the raw server message for any other error", () => {
    render(<ImportErrorMessage message="invalid ZIP archive" />);
    expect(screen.getByText("invalid ZIP archive")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
