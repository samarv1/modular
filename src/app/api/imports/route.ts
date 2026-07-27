import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { uploadArchive } from "@/lib/storage";
import { setResumeComposition } from "@/lib/composition";
import { nextPlacement } from "@/lib/desktop-placement";

// Without generated Database types, supabase-js's select() return type
// collapses to an unusable GenericStringError rather than a clean `any`.
// This just asserts the row shape each call site already knows it needs.
type Row = Record<string, unknown>;
function asRow<T extends Row>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}
function asRows<T extends Row>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  // Upload only ever happens from inside an open folder (see UploadZone /
  // Desktop) — the resulting resume lands there, not on the top-level desktop.
  const folderIdField = form.get("folderId");
  const folderId = typeof folderIdField === "string" && folderIdField ? folderIdField : null;

  const zipBytes = new Uint8Array(await file.arrayBuffer());

  let archive;
  try {
    archive = await parseLatexArchive(zipBytes);
  } catch (err) {
    if (err instanceof ArchiveRejectedError) {
      return NextResponse.json(
        { error: err.reason, details: err.details },
        { status: 422 },
      );
    }
    throw err;
  }

  const { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });

  if (!adapter || !result.compatible) {
    // Not persisted — an incompatible upload was never really "imported"
    // (see PLAN.md Phase 3 notes). The client gets the mismatch report only.
    return NextResponse.json(
      { compatible: false, mismatchReport: result.mismatchReport },
      { status: 422 },
    );
  }

  const extracted = adapter.extract({ rootFile: archive.rootFile, source: archive.source });
  const ownerId = getOwnerId();
  const archivePath = `${ownerId}/${randomUUID()}.zip`;
  await uploadArchive(archivePath, zipBytes, "application/zip");

  // First compatible upload for this fingerprint establishes the shell;
  // later ones reuse it (see PLAN.md: "first upload becomes the template shell").
  const shells = ownerScopedTable("template_shell");
  const { data: existingShell, error: shellLookupError } = asRow<{ id: string }>(
    await shells
      .select("id")
      .eq("adapter_id", adapter.id)
      .eq("fingerprint", result.fingerprint!)
      .limit(1)
      .maybeSingle(),
  );
  if (shellLookupError) throw new Error(shellLookupError.message);

  let templateShellId = existingShell?.id;
  if (!templateShellId) {
    const { data: newShell, error: insertShellError } = asRow<{ id: string }>(
      await shells
        .insert({
          archive_path: archivePath,
          root_file: archive.rootFile,
          adapter_id: adapter.id,
          fingerprint: result.fingerprint,
          preamble: extracted.preamble,
        })
        .select("id")
        .single(),
    );
    if (insertShellError) throw new Error(insertShellError.message);
    templateShellId = newShell!.id;
  }

  const { data: sourceResume, error: sourceResumeError } = asRow<{ id: string }>(
    await ownerScopedTable("source_resume")
      .insert({
        template_shell_id: templateShellId,
        archive_path: archivePath,
        import_status: "success",
        display_name: file.name.replace(/\.zip$/i, ""),
      })
      .select("id")
      .single(),
  );
  if (sourceResumeError) throw new Error(sourceResumeError.message);
  const sourceResumeId = sourceResume!.id;

  const entryRows = extracted.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      source_resume_id: sourceResumeId,
      kind: entry.kind,
      source_section: section.title,
      raw_latex: entry.rawLatex,
      source_offset_start: entry.sourceOffsetStart,
      source_offset_end: entry.sourceOffsetEnd,
      required_packages: entry.requiredPackages,
      display_name: entry.displayName,
      tags: [],
    })),
  );

  const { data: insertedEntries, error: entriesError } = asRows<{ id: string }>(
    await ownerScopedTable("bank_entry").insert(entryRows).select("id"),
  );
  if (entriesError) throw new Error(entriesError.message);

  // Desktop placement (Phase 6) — a resume auto-created by import needs a
  // spot in whichever folder it was uploaded into, same as any other new
  // icon, not just the position_x/position_y column defaults (which would
  // stack every import at (0,0)).
  let containerCount: number;
  if (folderId) {
    const { data: folderResumes, error: folderResumesError } = asRows<{ id: string }>(
      await ownerScopedTable("resume").select("id").eq("folder_id", folderId),
    );
    if (folderResumesError) throw new Error(folderResumesError.message);
    containerCount = folderResumes?.length ?? 0;
  } else {
    const { data: topLevelResumes, error: topLevelError } = asRows<{ id: string }>(
      await ownerScopedTable("resume").select("id").is("folder_id", null),
    );
    if (topLevelError) throw new Error(topLevelError.message);
    const { data: existingFolders, error: foldersError } = asRows<{ id: string }>(
      await ownerScopedTable("resume_folder").select("id"),
    );
    if (foldersError) throw new Error(foldersError.message);
    containerCount = (topLevelResumes?.length ?? 0) + (existingFolders?.length ?? 0);
  }
  const pos = nextPlacement(containerCount);

  // Imports become saved builds matching their original structure
  // (PLAN.md) — mirror the extracted sections into a resume right away
  // rather than leaving the import as bank entries with nothing assembled.
  const { data: newResume, error: resumeError } = asRow<{
    id: string;
    title: string;
    template_shell_id: string;
    compile_status: string;
    folder_id: string | null;
    position_x: number;
    position_y: number;
    updated_at: string;
    created_at: string;
  }>(
    await ownerScopedTable("resume")
      .insert({
        title: file.name.replace(/\.zip$/i, ""),
        template_shell_id: templateShellId,
        source_resume_id: sourceResumeId,
        position_x: pos.x,
        position_y: pos.y,
        folder_id: folderId,
      })
      .select("id, title, template_shell_id, compile_status, folder_id, position_x, position_y, updated_at, created_at")
      .single(),
  );
  if (resumeError) throw new Error(resumeError.message);

  // A single multi-row INSERT ... RETURNING preserves input order (no join
  // or reorder happens for RETURNING on a base table), so insertedEntries
  // lines up positionally with entryRows / the flattened section.entries.
  let entryIdx = 0;
  const compositionSections = extracted.sections.map((section) => ({
    title: section.title,
    entries: section.entries.map(() => insertedEntries![entryIdx++].id),
  }));
  await setResumeComposition(newResume!.id, compositionSections);

  return NextResponse.json({
    compatible: true,
    templateShellId,
    sourceResumeId,
    resumeId: newResume!.id,
    resume: newResume,
    entryCount: entryRows.length,
    sections: extracted.sections.map((s) => ({ title: s.title, entryCount: s.entries.length })),
  });
}
