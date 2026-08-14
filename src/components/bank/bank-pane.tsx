"use client";

import { useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Pencil, GripVertical, Upload as UploadIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntryEditor, HeaderFieldsEditor } from "@/components/bank/entry-editor";
import { bankEntryToExtractedEntry, bankEntryToHeaderData } from "@/lib/bank-entry-fields";
import { clearHoverCursor, setHoverCursor } from "@/lib/hover-cursor";
import { sectionGroupLabel } from "@/lib/section-label";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";
import { BANK_DRAG_PREFIX } from "@/components/dnd-ids";
import { ImportReviewModal } from "@/components/home/import-review-modal";

// The uploaded file's original name (source_resume.display_name), so
// entries from different uploads read as "Ldgr" / "Dibs" instead of an id
// fragment. Falls back to a short id for orphaned entries (source_resume_id
// is ON DELETE SET NULL, see 0001_init.sql) or entries imported before
// source_resume.display_name existed (0004 migration, backfilled as null).
const GROUP_PRIORITY = ["name & contact", "education", "experience", "leadership", "projects"];
function groupPriority(label: string) {
  const index = GROUP_PRIORITY.indexOf(label.trim().toLowerCase());
  return index === -1 ? GROUP_PRIORITY.length : index;
}

function resumeSourceLabel(entry: BankEntryRow): string {
  if (entry.source_resume?.display_name) return entry.source_resume.display_name;
  if (!entry.source_resume_id) return "source unavailable"; // orphaned entry, see PLAN.md
  return entry.source_resume_id.slice(0, 6);
}

export function BankPane({
  entries,
  usedEntryIds,
  onEntryPatched,
  onEntriesImported,
}: {
  entries: BankEntryRow[];
  // Entries already placed in the active resume — hidden from the bank
  // entirely (see PLAN.md-adjacent: dragging into the outline pane "moves"
  // the card, not copies it) until removed via the outline's "X", which
  // drops the id from here and brings the card back.
  usedEntryIds: Set<string>;
  // Mirrors a display-name/tags edit up to the parent so the outline pane
  // and bank pane render from the same canonical entry state.
  onEntryPatched?: (id: string, values: { displayName?: string; tags?: string[]; rawLatex?: string }) => void;
  onEntriesImported?: (entries: BankEntryRow[]) => void;
}) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const patchVersions = useRef(new Map<string, number>());
  // Derived from `entries` (not a captured snapshot) so tag edits made
  // inside the modal itself show up immediately rather than going stale.
  const editingEntry = entries.find((e) => e.id === editingEntryId) ?? null;

  // Grouped by display section. Within that, group headers follow a fixed
  // priority — Education, Experience, Leadership, Projects, then Other last
  // — rather than upload order, so "Other" doesn't end up sitting above a
  // known section just because its first entry happened to import earlier.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byLabel = new Map<string, BankEntryRow[]>();
    for (const entry of entries) {
      const label = sectionGroupLabel(entry.source_section);
      if (!byLabel.has(label)) {
        order.push(label);
        byLabel.set(label, []);
      }
      if (!usedEntryIds.has(entry.id)) byLabel.get(label)!.push(entry);
    }
    return order
      .map((label): [string, BankEntryRow[]] => [label, byLabel.get(label)!])
      .filter(([, group]) => group.length > 0)
      .sort(([a], [b]) => groupPriority(a) - groupPriority(b));
  }, [entries, usedEntryIds]);

  async function patchEntry(id: string, values: { displayName?: string; tags?: string[] }) {
    const previous = entries.find((entry) => entry.id === id);
    if (!previous) return;
    const version = (patchVersions.current.get(id) ?? 0) + 1;
    patchVersions.current.set(id, version);

    onEntryPatched?.(id, values);
    try {
      const res = await fetch(`/api/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("entry update failed");
      const body = (await res.json()) as {
        entry?: { display_name?: string; tags?: string[] };
      };
      if (patchVersions.current.get(id) !== version || !body.entry) return;
      onEntryPatched?.(id, {
        displayName: body.entry.display_name,
        tags: body.entry.tags,
      });
    } catch {
      if (patchVersions.current.get(id) !== version) return;
      onEntryPatched?.(id, {
        displayName: previous.display_name,
        tags: previous.tags,
      });
      setEntryError("Entry changes could not be saved.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        {entryError ? (
          <span className="truncate text-[11.5px] text-danger">{entryError}</span>
        ) : (
          <span />
        )}
        <button
          onClick={() => setImportModalOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
        >
          <UploadIcon className="size-3" />
          Upload
        </button>
        <ImportReviewModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          onImported={(imported) => {
            onEntriesImported?.(imported);
          }}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {/* pr-4, not pr-2 — the scrollbar (base-ui ScrollArea) is an overlay
            that floats over the viewport rather than reserving its own
            layout space, so the card list needs enough clearance that the
            scrollbar's own hit area (w-2.5) doesn't sit on top of card
            content and steal its hover/click. */}
        <div className="flex flex-col gap-4 pr-4 pb-4">
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong p-7 text-center text-[12.5px] text-faint">
              <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-fg">
                No entries yet
              </div>
              Import a resume to start extracting reusable entries.
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
                    onOpenEdit={() => setEditingEntryId(entry.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntryId(null);
        }}
      >
        {editingEntry && (
          <EntryEditDialog
            key={`${editingEntry.id}:${editingEntry.raw_latex}`}
            entry={editingEntry}
            onSaved={(values) => {
              onEntryPatched?.(editingEntry.id, values);
              setEditingEntryId(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EntryEditDialog({
  entry,
  onSaved,
}: {
  entry: BankEntryRow;
  onSaved: (values: { displayName?: string; rawLatex?: string }) => void;
}) {
  const isHeader = entry.kind === "header_chunk";
  const [headerDraft, setHeaderDraft] = useState(() => bankEntryToHeaderData(entry));
  const [entryDraft, setEntryDraft] = useState<ExtractedEntry>(() => bankEntryToExtractedEntry(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isHeader ? { header: headerDraft } : { entry: entryDraft }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "could not save this entry");
      }
      onSaved({ displayName: body?.entry?.display_name, rawLatex: body?.entry?.raw_latex });
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save this entry");
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[8.5in]">
      <DialogHeader>
        <DialogTitle className="flex items-baseline gap-2 leading-normal">
          <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-fg uppercase tracking-wide">
            {sectionGroupLabel(entry.source_section)}
          </span>
        </DialogTitle>
        <DialogDescription className="sr-only">Edit {entry.display_name}</DialogDescription>
      </DialogHeader>

      {isHeader ? (
        <HeaderFieldsEditor
          header={headerDraft}
          onChange={(patch) => setHeaderDraft((prev) => ({ ...prev, ...patch }))}
        />
      ) : (
        <EntryEditor entry={entryDraft} onChange={(patch) => setEntryDraft((prev) => ({ ...prev, ...patch }))} />
      )}

      {error && <span className="text-[11.5px] text-danger">{error}</span>}

      <DialogFooter>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// Static rendering of a bank card's look — used for the cross-pane
// DragOverlay clone so a card being dragged into the outline still looks
// like the card it came from, instead of jumping to a different style.
export function BankEntryCardVisual({ entry }: { entry: BankEntryRow }) {
  return (
    <Card size="sm" className="z-20 cursor-grabbing shadow-[4px_7px_14px_-2px_rgba(18,24,28,0.28)]">
      <CardContent className="flex flex-row items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-line-strong" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="w-fit text-[12.5px] font-semibold">{entry.display_name}</span>
          <div className="font-mono text-[10px] text-faint">
            {resumeSourceLabel(entry)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryCard({
  entry,
  onPatch,
  onOpenEdit,
}: {
  entry: BankEntryRow;
  onPatch: (id: string, values: { displayName?: string; tags?: string[] }) => void;
  onOpenEdit: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(entry.display_name);
  const [hovering, setHovering] = useState(false);
  const cancelNameRef = useRef(false);

  function commitName() {
    setEditingName(false);
    if (cancelNameRef.current) {
      cancelNameRef.current = false;
      setName(entry.display_name);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setName(entry.display_name);
      return;
    }
    if (trimmed !== entry.display_name) onPatch(entry.id, { displayName: trimmed });
  }

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BANK_DRAG_PREFIX + entry.id,
  });

  function onPointerDownGuarded(e: PointerEvent<HTMLDivElement>) {
    // Don't hijack typing in the name-edit input, or the edit button's own
    // click — everything else on the card can start a drag.
    if (e.target instanceof HTMLElement && e.target.closest("input, button")) return;
    listeners?.onPointerDown?.(e);
  }
  function stopEditButtonDrag(e: MouseEvent) {
    e.stopPropagation();
  }

  // While dragging, the DragOverlay clone (BankEntryCardVisual) is what
  // follows the cursor — this source card just fades in place instead of
  // also tracking the pointer, or the two would visibly move independently.
  // Write the resting cursor only after pointer-enter. The implementation
  // before the dnd-kit migration also updated React state on hover; restoring
  // that DOM update prevents an occasional stale native cursor after Chrome
  // moves the pointer onto a newly composited card.
  const style = {
    cursor: isDragging ? "grabbing" : hovering ? "grab" : undefined,
    ...(isDragging ? { opacity: 0.35 } : {}),
  };

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      style={style}
      // Resting shadow is soft/diffused (paper flat on the desk) rather than
      // a hard flat offset — that flat-line look is what read as "AI card."
      // Hover only lifts the shadow (no rotation) — the tilt-on-hover read
      // as gimmicky once this became the drag source for a real editor.
      className={`touch-none select-none ${isDragging ? "z-20 cursor-grabbing shadow-[4px_7px_14px_-2px_rgba(18,24,28,0.28)]" : "z-0 cursor-auto shadow-[0_1px_2px_rgba(18,24,28,0.10)] transition-shadow duration-150 ease-out hover:z-10 hover:shadow-[3px_5px_10px_-2px_rgba(18,24,28,0.22)]"}`}
      {...attributes}
      {...listeners}
      onPointerDown={onPointerDownGuarded}
      onPointerEnter={() => {
        setHovering(true);
        setHoverCursor("grab");
      }}
      onPointerLeave={() => {
        setHovering(false);
        clearHoverCursor("grab");
      }}
    >
      <CardContent className="pointer-events-none flex flex-row items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-line-strong" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {editingName ? (
            <input
              autoFocus
              data-cursor-override="text"
              className="pointer-events-auto cursor-text border-b border-line-strong bg-transparent text-[12.5px] font-semibold outline-none focus:border-brand"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  cancelNameRef.current = true;
                  setName(entry.display_name);
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <span
              className="pointer-events-auto w-fit text-[12.5px] font-semibold"
              onDoubleClick={() => {
                cancelNameRef.current = false;
                setName(entry.display_name);
                setEditingName(true);
              }}
              title="Double-click to rename"
            >
              {entry.display_name}
            </span>
          )}
          <div className="font-mono text-[10px] text-faint">
            {resumeSourceLabel(entry)}
          </div>
        </div>
        {/* Explicit edit action — the card itself is the drag source
            (grab cursor everywhere), so opening the editor needed its own
            target instead of overloading a plain click on a draggable. */}
        <button
          onClick={onOpenEdit}
          onPointerDown={stopEditButtonDrag}
          data-cursor-override="pointer"
          title="Edit"
          aria-label={`Edit ${entry.display_name}`}
          className="pointer-events-auto shrink-0 self-center cursor-pointer rounded-sm p-1 text-faint hover:bg-surface-sunken hover:text-brand"
        >
          <Pencil className="pointer-events-none size-3.5" />
        </button>
      </CardContent>
    </Card>
  );
}
