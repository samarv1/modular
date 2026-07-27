"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseJakeEntryPreview } from "@/lib/jake-entry-preview";
import type { BankEntryRow } from "@/app/api/entries/route";

// source_resume has no user-editable display name yet — the intended
// design (default to the uploaded file's original name, user-editable
// afterward) needs a schema field (source_resume.display_name) plus an
// import-time default and a rename endpoint, none of which exist yet.
// Until that lands, fall back to a short id so at least entries from
// different uploads are visually distinguishable. Swap this for the real
// name once the field exists — see PLAN.md.
function resumeSourceLabel(sourceResumeId: string | null): string {
  if (!sourceResumeId) return "source unavailable"; // orphaned entry, see PLAN.md
  return sourceResumeId.slice(0, 6);
}

// Display-only bucketing for the bank pane's grouping headers and the
// preview modal title. The underlying entry.source_section is never
// touched — section titles must stay exact for the composition merge-by-
// title rule (see PLAN.md) once Phase 5 lands. This just controls what
// label a section shows as here: anything outside the common four gets
// grouped under "Other" instead of showing every custom section name
// (Technical Skills, Languages, Hobbies, Certifications, ...) as its own
// bucket.
const KNOWN_SECTIONS = new Set(["education", "experience", "projects", "leadership"]);
function bankSectionLabel(sectionTitle: string): string {
  return KNOWN_SECTIONS.has(sectionTitle.trim().toLowerCase()) ? sectionTitle : "Other";
}

// Deterministic per-card tilt, like cards pinned to a scratchpad rather than
// rows in a list — same entry always gets the same tilt across re-renders.
// Floored magnitude so no id can hash to a near-zero (visually "stuck") tilt.
function cardTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const magnitude = 0.7 + (Math.abs(hash) % 100) / 100 / 1.4; // 0.7deg .. 1.4deg
  return hash % 2 === 0 ? magnitude : -magnitude;
}

export function BankPane({ initialEntries }: { initialEntries: BankEntryRow[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [, startTransition] = useTransition();
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);
  // Derived from `entries` (not a captured snapshot) so tag edits made
  // inside the modal itself show up immediately rather than going stale.
  const previewEntry = entries.find((e) => e.id === previewEntryId) ?? null;

  // Grouped by display section, in the order those sections first appear in
  // `entries` — that's upload/original-resume order (see the API route's
  // ordering), not alphabetical. Map preserves key insertion order.
  const groups = useMemo(() => {
    const map = new Map<string, BankEntryRow[]>();
    for (const entry of entries) {
      const label = bankSectionLabel(entry.source_section);
      const group = map.get(label);
      if (group) group.push(entry);
      else map.set(label, [entry]);
    }
    return Array.from(map.entries());
  }, [entries]);

  async function patchEntry(id: string, values: { displayName?: string; tags?: string[] }) {
    const prev = entries;
    setEntries((cur) =>
      cur.map((e) =>
        e.id === id
          ? {
              ...e,
              ...(values.displayName !== undefined ? { display_name: values.displayName } : {}),
              ...(values.tags !== undefined ? { tags: values.tags } : {}),
            }
          : e,
      ),
    );
    startTransition(async () => {
      const res = await fetch(`/api/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) setEntries(prev);
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 pr-2">
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong p-7 text-center text-[12.5px] text-faint">
              <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
                No entries yet
              </div>
              Import a resume ZIP to start extracting reusable entries.
            </div>
          ) : (
            groups.map(([sectionTitle, sectionEntries]) => (
              <div key={sectionTitle} className="flex flex-col gap-2">
                <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
                  {sectionTitle}
                </div>
                {sectionEntries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onPatch={patchEntry}
                    onOpenPreview={() => setPreviewEntryId(entry.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={previewEntry !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewEntryId(null);
        }}
      >
        {previewEntry && <EntryPreviewDialog entry={previewEntry} onPatch={patchEntry} />}
      </Dialog>
    </div>
  );
}

function EntryPreviewDialog({
  entry,
  onPatch,
}: {
  entry: BankEntryRow;
  onPatch: (id: string, values: { displayName?: string; tags?: string[] }) => void;
}) {
  const preview = useMemo(
    () => parseJakeEntryPreview(entry.kind, entry.raw_latex),
    [entry.kind, entry.raw_latex],
  );

  const [titleDraft, setTitleDraft] = useState(entry.display_name);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Keep the title from growing past the modal's title row instead of
  // letting it silently scroll off — once a keystroke would overflow the
  // input's box, drop it. Only while the field is actually focused, so an
  // already-long title isn't retroactively truncated just from opening the
  // dialog.
  useEffect(() => {
    const el = titleInputRef.current;
    if (!el || document.activeElement !== el) return;
    if (el.scrollWidth > el.clientWidth) {
      setTitleDraft((cur) => cur.slice(0, -1));
    }
  }, [titleDraft]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(entry.display_name);
      return;
    }
    if (trimmed !== entry.display_name) onPatch(entry.id, { displayName: trimmed });
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[8.5in]" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="flex items-baseline gap-2 leading-normal">
          <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-fg uppercase tracking-wide">
            {bankSectionLabel(entry.source_section)}
          </span>
          <input
            ref={titleInputRef}
            className="min-w-0 flex-1 border-b border-line-strong bg-transparent text-[13px] font-semibold outline-none focus:border-brand"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitleDraft(entry.display_name);
                e.currentTarget.blur();
              }
            }}
          />
        </DialogTitle>
        <DialogDescription className="sr-only">Preview of {entry.display_name}</DialogDescription>
      </DialogHeader>

      {/* Overleaf/compiled-PDF look — literal serif stack (font-latex),
          scoped to this block only. The rest of the modal stays in the
          app's own mono/sans scheme. */}
      <div className="rounded-sm border border-line-strong bg-white p-5 font-latex text-[#111] shadow-[0_1px_0_var(--line-strong)]">
        {preview.title && (
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[15px] font-bold">{preview.title}</div>
            {preview.subtitle && <div className="shrink-0 text-[12.5px]">{preview.subtitle}</div>}
          </div>
        )}
        {(preview.meta || preview.location) && (
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12.5px] italic">
            <span>{preview.meta}</span>
            <span className="shrink-0">{preview.location}</span>
          </div>
        )}
        {preview.bullets.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] not-italic">
            {preview.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        )}
      </div>
    </DialogContent>
  );
}

function EntryCard({
  entry,
  onPatch,
  onOpenPreview,
}: {
  entry: BankEntryRow;
  onPatch: (id: string, values: { displayName?: string; tags?: string[] }) => void;
  onOpenPreview: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(entry.display_name);

  function commitName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed) {
      setName(entry.display_name);
      return;
    }
    if (trimmed !== entry.display_name) onPatch(entry.id, { displayName: trimmed });
  }

  const tilt = useMemo(() => cardTilt(entry.id), [entry.id]);

  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Don't hijack typing in the name-edit / tag-draft inputs — everything
    // else on the card (including the name label) can start a drag.
    if (e.target instanceof HTMLElement && e.target.closest("input")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setDragging(true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setOffset({ x: dx, y: dy });
  }
  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
    setOffset({ x: 0, y: 0 }); // no drop target yet (outline pane is Phase 5) — snap back
  }
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target instanceof HTMLElement && e.target.closest("input")) return;
    if (moved.current) return; // was a drag, not a click
    onOpenPreview();
  }
  function stopCardClick(e: MouseEvent) {
    e.stopPropagation();
  }

  const active = dragging || hovering;
  // Only set an inline transform while the card is actually being interacted
  // with — leaving one on every resting card promotes each to its own GPU
  // compositing layer, which causes stale-frame flicker on fast scroll with
  // this many siblings.
  const style = active
    ? {
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${tilt}deg)`,
        transition: dragging
          ? "none"
          : "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease-out",
      }
    : undefined;

  return (
    <Card
      size="sm"
      style={style}
      className={`touch-none select-none ${dragging ? "z-20 cursor-grabbing shadow-[4px_7px_14px_-2px_rgba(18,24,28,0.28)]" : "z-0 cursor-grab shadow-[2px_3px_0_0_var(--line-strong)] hover:z-10 hover:shadow-[3px_5px_10px_-2px_rgba(18,24,28,0.22)]"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <CardContent className="flex flex-row items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-line-strong" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {editingName ? (
            <input
              autoFocus
              className="border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setName(entry.display_name);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <span
              className="w-fit cursor-grab text-[12.5px] font-semibold"
              onClick={stopCardClick}
              onDoubleClick={() => setEditingName(true)}
              title="Double-click to rename"
            >
              {entry.display_name}
            </span>
          )}
          <div className="font-mono text-[10px] text-faint">
            {resumeSourceLabel(entry.source_resume_id)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
