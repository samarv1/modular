"use client";

import { useEffect, useState } from "react";

// Shared between import-review-modal.tsx and pdf-import-review-modal.tsx:
// both wait on the same shape of thing (a file being parsed and possibly
// AI-extracted server-side), so both get the same rotating-step visual
// instead of a bare spinner. Steps are per-caller since what's actually
// happening differs (LaTeX parse vs. LLM extraction).
export function LoadingStatus({ steps }: { steps: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, 1600);
    return () => clearInterval(id);
  }, [steps]);

  return (
    <div className="flex items-center gap-2.5 py-8 justify-center">
      <span className="size-1.5 rounded-full bg-brand animate-pulse" />
      <span className="text-[12.5px] text-faint font-mono min-w-[11ch]">
        {steps[index]}
      </span>
    </div>
  );
}
