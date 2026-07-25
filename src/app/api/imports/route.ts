import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ownerScopedTable } from "@/lib/db";
import { getOwnerId } from "@/lib/owner";
import { detectAdapter } from "@/lib/adapters/registry";
import { ArchiveRejectedError, parseLatexArchive } from "@/lib/latex-archive";
import { uploadArchive } from "@/lib/storage";

// Without generated Database types, supabase-js's select() return type
// collapses to an unusable GenericStringError rather than a clean `any`.
// This just asserts the row shape each call site already knows it needs.
type Row = Record<string, unknown>;
function asRow<T extends Row>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

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

  const { error: entriesError } = await ownerScopedTable("bank_entry").insert(entryRows);
  if (entriesError) throw new Error((entriesError as { message: string }).message);

  return NextResponse.json({
    compatible: true,
    templateShellId,
    sourceResumeId,
    entryCount: entryRows.length,
    sections: extracted.sections.map((s) => ({ title: s.title, entryCount: s.entries.length })),
  });
}
