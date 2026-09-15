"use client";

import {
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
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
import {
  EntryEditor,
  HeaderFieldsEditor,
} from "@/components/bank/entry-editor";
import {
  bankEntryToExtractedEntry,
  bankEntryToHeaderData,
} from "@/lib/bank-entry-fields";
import { clearHoverCursor, setHoverCursor } from "@/lib/hover-cursor";
import { sectionGroupLabel } from "@/lib/section-label";
import { groupEntriesBySection } from "@/lib/group-by-section";
import type { ExtractedEntry } from "@/lib/resume-extraction-schema";
import type { BankEntryRow } from "@/lib/rows";
import { BANK_DRAG_PREFIX } from "@/components/dnd-ids";
import { ImportReviewModal } from "@/components/home/import-review-modal";

const GROUP_PRIORITY = [
  "name & contact",
  "education",
  "experience",
  "leadership",
  "projects",
];
function groupPriority(label: string) {
  const index = GROUP_PRIORITY.indexOf(label.trim().toLowerCase());
  return index === -1 ? GROUP_PRIORITY.length : index;
}

function resumeSourceLabel(entry: BankEntryRow): string {
  if (entry.source_resume?.display_name)
    return entry.source_resume.display_name;
  if (!entry.source_resume_id) return "source unavailable";
  return entry.source_resume_id.slice(0, 6);
}

export function BankPane({
  entries,
  usedEntryIds,
  onEntryPatched,
  onEntriesImported,
  demo = false,
  onRequireSignIn,
}: {
  entries: BankEntryRow[];
  usedEntryIds: Set<string>;
  onEntryPatched?: (
    id: string,
    values: { displayName?: string; tags?: string[]; rawLatex?: string },
  ) => void;
  onEntriesImported?: (entries: BankEntryRow[]) => void;
  demo?: boolean;
  onRequireSignIn?: () => void;
}) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const patchVersions = useRef(new Map<string, number>());
  const editingEntry = entries.find((e) => e.id === editingEntryId) ?? null;

  const groups = useMemo(() => {
    return groupEntriesBySection(
      entries.filter((entry) => !usedEntryIds.has(entry.id)),
      (entry) => sectionGroupLabel(entry.source_section),
    )
      .map(({ key, entries: groupEntries }): [string, BankEntryRow[]] => [
        key,
        groupEntries,
      ])
      .sort(([a], [b]) => groupPriority(a) - groupPriority(b));
  }, [entries, usedEntryIds]);

  async function patchEntry(
    id: string,
    values: { displayName?: string; tags?: string[] },
  ) {
    if (demo) {
      onRequireSignIn?.();
      return;
    }
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
          <span className="truncate text-[11.5px] text-danger">
            {entryError}
          </span>
        ) : (
          <span />
        )}
        <button
          onClick={() => {
            if (demo) {
              onRequireSignIn?.();
              return;
            }
            setImportModalOpen(true);
          }}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-fg hover:border-brand hover:text-brand"
        >
          <UploadIcon className="size-3" />
          Upload
        </button>
        {!demo && (
          <ImportReviewModal
            open={importModalOpen}
            onOpenChange={setImportModalOpen}
            onImported={(imported) => {
              onEntriesImported?.(imported);
            }}
          />
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {/* The overlay scrollbar needs clearance from card controls. */}
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
                    demo={demo}
                    onRequireSignIn={onRequireSignIn}
                    onPatch={patchEntry}
                    onOpenEdit={() => {
                      if (demo) {
                        onRequireSignIn?.();
                        return;
                      }
                      setEditingEntryId(entry.id);
                    }}
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
  const [headerDraft, setHeaderDraft] = useState(() =>
    bankEntryToHeaderData(entry),
  );
  const [entryDraft, setEntryDraft] = useState<ExtractedEntry>(() =>
    bankEntryToExtractedEntry(entry),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isHeader ? { header: headerDraft } : { entry: entryDraft },
        ),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "could not save this entry",
        );
      }
      onSaved({
        displayName: body?.entry?.display_name,
        rawLatex: body?.entry?.raw_latex,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "could not save this entry",
      );
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
        <DialogDescription className="sr-only">
          Edit {entry.display_name}
        </DialogDescription>
      </DialogHeader>

      {isHeader ? (
        <HeaderFieldsEditor
          header={headerDraft}
          onChange={(patch) =>
            setHeaderDraft((prev) => ({ ...prev, ...patch }))
          }
        />
      ) : (
        <EntryEditor
          entry={entryDraft}
          onChange={(patch) => setEntryDraft((prev) => ({ ...prev, ...patch }))}
        />
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

export function BankEntryCardVisual({ entry }: { entry: BankEntryRow }) {
  return (
    <Card
      size="sm"
      className="z-20 cursor-grabbing shadow-[4px_7px_14px_-2px_rgba(18,24,28,0.28)]"
    >
      <CardContent className="flex flex-row items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-line-strong" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="w-fit text-[12.5px] font-semibold">
            {entry.display_name}
          </span>
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
  demo = false,
  onRequireSignIn,
}: {
  entry: BankEntryRow;
  onPatch: (
    id: string,
    values: { displayName?: string; tags?: string[] },
  ) => void;
  onOpenEdit: () => void;
  demo?: boolean;
  onRequireSignIn?: () => void;
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
    if (trimmed !== entry.display_name)
      onPatch(entry.id, { displayName: trimmed });
  }

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BANK_DRAG_PREFIX + entry.id,
  });

  function onPointerDownGuarded(e: PointerEvent<HTMLDivElement>) {
    // Interactive controls must not start a drag.
    if (e.target instanceof HTMLElement && e.target.closest("input, button"))
      return;
    listeners?.onPointerDown?.(e);
  }
  function stopEditButtonDrag(e: MouseEvent) {
    e.stopPropagation();
  }

  // Reapply the cursor after Chrome moves onto a newly composited card.
  const style = {
    cursor: isDragging ? "grabbing" : hovering ? "grab" : undefined,
    ...(isDragging ? { opacity: 0.35 } : {}),
  };

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      style={style}
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
                if (demo) {
                  onRequireSignIn?.();
                  return;
                }
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
