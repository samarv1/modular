"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { BackToDesktopLink } from "@/components/back-to-desktop";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "checking" | "invalid" | "check_failed" | "rate_limited"
  >("idle");

  useEffect(() => {
    fetch("/api/byok")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => setConfigured(Boolean(body.configured)))
      .catch(() => setConfigured(false));
  }, []);

  async function save() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setStatus("checking");
    let result;
    try {
      const res = await fetch("/api/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      result = await res.json().catch(() => null);
    } catch {
      result = null;
    }
    if (!result || result.valid !== true) {
      setStatus(
        result?.reason === "invalid_key"
          ? "invalid"
          : result?.reason === "rate_limited"
            ? "rate_limited"
            : "check_failed",
      );
      return;
    }
    setConfigured(true);
    setApiKey("");
    setStatus("idle");
  }

  async function clear() {
    await fetch("/api/byok", { method: "DELETE" });
    setConfigured(false);
    setApiKey("");
    setStatus("idle");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 pt-4 pb-1">
        <BackToDesktopLink />
        <span className="px-1 py-1 text-[13px] font-semibold text-ink">
          Settings
        </span>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[13px] uppercase tracking-wide text-muted-fg">
            Use your own Gemini API key
          </h2>
          <p className="text-[11.5px] text-ink">
            Our Gemini access is limited, so add your own key to keep importing
            without limits. It&apos;s free from{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline hover:no-underline"
            >
              aistudio.google.com
            </a>
            .
          </p>
          <p className="text-[11.5px] text-ink">
            Your key is encrypted and stored securely. We only use it for your
            own imports.
          </p>

          {configured && (
            <p className="text-[11.5px] text-brand">
              Currently using your own Gemini key.
            </p>
          )}

          <label className="flex flex-col gap-1 text-[11.5px] text-ink">
            Gemini API key
            <div className="relative">
              <input
                type={revealKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setStatus("idle");
                }}
                placeholder="AIza..."
                className="w-full rounded-md border border-line-strong bg-transparent px-2 py-1.5 pr-8 text-[12.5px] text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => setRevealKey((v) => !v)}
                aria-label={revealKey ? "Hide API key" : "Show API key"}
                className="absolute inset-y-0 right-2 flex items-center text-muted-fg hover:text-ink"
              >
                {revealKey ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
              </button>
            </div>
          </label>

          {status === "invalid" && (
            <p className="text-[11.5px] text-danger">
              That key was rejected by Gemini. Double check it and try again.
            </p>
          )}
          {status === "check_failed" && (
            <p className="text-[11.5px] text-danger">
              Could not verify that key right now. Try again in a moment.
            </p>
          )}
          {status === "rate_limited" && (
            <p className="text-[11.5px] text-danger">
              Too many attempts. Please wait a bit and try again.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={!apiKey.trim() || status === "checking"}
            >
              {status === "checking" ? "Checking…" : "Save"}
            </Button>
            {configured && (
              <Button variant="outline" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
