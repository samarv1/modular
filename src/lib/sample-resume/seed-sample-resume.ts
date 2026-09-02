import JSZip from "jszip";
import { asRow, asRows, ownerScopedTable } from "@/lib/db";
import { parseLatexArchive } from "@/lib/latex-archive";
import { detectAdapter } from "@/lib/adapters/registry";
import { commitImport, flattenEntries } from "@/lib/import-commit";
import { dedupedName } from "@/lib/unique-db-name";
import { nextFreePlacement, nextPlacement } from "@/lib/desktop-placement";
import { STATIC_PAGES } from "@/lib/static-pages";
import {
  SAMPLE_RESUME_LICENSE,
  SAMPLE_RESUME_TEX,
} from "./sample-resume-source";

// A new account can't do anything until it has imported something: "New resume"
// is gated on having a template shell, and POST /api/resumes 422s without a
// successful source_resume. This seeds one account's worth of that starting
// material so the first thing a user sees is a working product.
//
// It runs the Jake's Resume fixture through the same
// parse -> detect -> extract -> commitImport path a real .zip upload takes
// (POST /api/imports), so seeded rows are indistinguishable from imported ones
// and no seeding-specific insert logic exists to drift.
//
// The resume it creates is deliberately left EMPTY. The bank pane hides any
// entry already placed in the open resume (src/components/bank/bank-pane.tsx),
// so pre-composing the sample would hand a new user a finished document beside
// an empty bank -- the exact opposite of showing them how the product works.
// Empty means all nine entries sit in the bank, waiting to be dragged in.

const SAMPLE_TITLE = "Jake's Resume";
const ROOT_FILE = "resume.tex";

async function alreadySeeded(ownerId: string): Promise<boolean> {
  const { data, error } = asRow<{ owner_id: string }>(
    await ownerScopedTable("sample_resume_seed", ownerId)
      .select("owner_id")
      .maybeSingle(),
  );
  if (error) throw new Error(error.message);
  return data !== null;
}

// Server-side mirror of Desktop's occupiedRootPositions
// (src/components/home/desktop.tsx): the top-level grid holds the static pages
// (About, Bank), folders, and folder-less resumes. Miss any of them and the new
// icon lands on top of an existing one.
//
// A static page's real position lives in the viewer's localStorage, which the
// server can't read, so its default grid slot is the best available answer. A
// page the user has since dragged away just leaves its old slot reserved, which
// costs an empty cell and never causes an overlap.
async function occupiedRootPositions(ownerId: string) {
  const positions = STATIC_PAGES.map((_, i) => nextPlacement(i));

  const [resumes, folders] = await Promise.all([
    asRows<{ position_x: number; position_y: number }>(
      await ownerScopedTable("resume", ownerId)
        .select("position_x, position_y")
        .is("folder_id", null),
    ),
    asRows<{ position_x: number; position_y: number }>(
      await ownerScopedTable("resume_folder", ownerId).select(
        "position_x, position_y",
      ),
    ),
  ]);
  if (resumes.error) throw new Error(resumes.error.message);
  if (folders.error) throw new Error(folders.error.message);

  for (const row of [...(resumes.data ?? []), ...(folders.data ?? [])]) {
    positions.push({ x: row.position_x, y: row.position_y });
  }
  return positions;
}

export async function seedSampleResume(
  ownerId: string,
): Promise<{ seeded: boolean }> {
  if (await alreadySeeded(ownerId)) return { seeded: false };

  const zip = new JSZip();
  zip.file(ROOT_FILE, SAMPLE_RESUME_TEX);
  zip.file("LICENSE", SAMPLE_RESUME_LICENSE);
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  const archive = await parseLatexArchive(zipBytes);
  const { adapter, result } = detectAdapter({
    rootFile: archive.rootFile,
    source: archive.source,
  });
  // The fixture is the adapter's own reference document. A mismatch here means
  // the adapter or the fixture changed out from under the other, not bad input.
  if (!adapter || !result.compatible || !result.fingerprint) {
    throw new Error("sample resume was not recognized by any adapter");
  }

  const extracted = adapter.extract({
    rootFile: archive.rootFile,
    source: archive.source,
  });
  const finalEntries = flattenEntries(extracted);

  const commit = await commitImport({
    ownerId,
    adapterId: adapter.id,
    fingerprint: result.fingerprint,
    rootFile: archive.rootFile,
    preamble: extracted.preamble,
    archiveBytes: zipBytes,
    extracted,
    finalEntries,
    // Force-include every entry. commitImport otherwise drops any whose
    // raw_latex already exists in the owner's bank, which for someone who has
    // already imported this same fixture would leave the sample bank missing
    // most of its entries. A duplicate bank entry is the lesser problem.
    forceIncludeIndices: new Set(finalEntries.map((entry) => entry.index)),
    desiredDisplayName: SAMPLE_TITLE,
  });

  const title = await dedupedName("resume", "title", SAMPLE_TITLE, { ownerId });
  const placement = nextFreePlacement(await occupiedRootPositions(ownerId));
  // No composition write follows: the resume starts empty on purpose (see the
  // note at the top of this file), so there's no row id to keep hold of.
  const { error: resumeError } = await ownerScopedTable(
    "resume",
    ownerId,
  ).insert({
    title,
    template_shell_id: commit.templateShellId,
    source_resume_id: commit.sourceResumeId,
    position_x: placement.x,
    position_y: placement.y,
  });
  if (resumeError)
    throw new Error((resumeError as { message: string }).message);

  await ownerScopedTable("sample_resume_seed", ownerId).insert({});

  return { seeded: true };
}
