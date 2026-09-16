import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerId } from "@/lib/owner";
import { isUuid } from "@/lib/api-request";
import type { ServiceClient } from "@/lib/db";

// All composition writes use the RPC so replacement stays transactional.

export interface CompositionSectionInput {
  title: string;
  entries: string[]; // bank_entry ids, in display order
}

export type CompositionErrorCode =
  "not_found" | "duplicate_entry" | "duplicate_title" | "malformed" | "invalid";

export class CompositionError extends Error {
  code: CompositionErrorCode;
  constructor(message: string, code: CompositionErrorCode) {
    super(message);
    this.code = code;
  }
}

export function validateCompositionSections(
  input: unknown,
): CompositionSectionInput[] {
  if (!Array.isArray(input)) {
    throw new CompositionError("sections must be an array", "malformed");
  }

  const sections: CompositionSectionInput[] = [];
  const seenTitles = new Set<string>();
  const seenEntryIds = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      throw new CompositionError("each section needs a title", "malformed");
    }
    const section = raw as Record<string, unknown>;
    if (typeof section.title !== "string" || !section.title.trim()) {
      throw new CompositionError("each section needs a title", "malformed");
    }
    if (
      !Array.isArray(section.entries) ||
      !section.entries.every((entry) => typeof entry === "string")
    ) {
      throw new CompositionError(
        "section entries must be an array of ids",
        "malformed",
      );
    }

    const title = section.title.trim();
    if (seenTitles.has(title)) {
      throw new CompositionError(
        "section titles must be unique within a resume",
        "duplicate_title",
      );
    }
    seenTitles.add(title);

    const entries = section.entries as string[];
    for (const entryId of entries) {
      if (!isUuid(entryId)) {
        throw new CompositionError("entry ids must be UUIDs", "malformed");
      }
      if (seenEntryIds.has(entryId)) {
        throw new CompositionError(
          "an entry can only appear once in a resume",
          "duplicate_entry",
        );
      }
      seenEntryIds.add(entryId);
    }
    sections.push({ title, entries });
  }
  return sections;
}

// Seed jobs may target an owner other than the current session.
export async function setResumeComposition(
  resumeId: string,
  sections: CompositionSectionInput[],
  explicitOwnerId?: string,
  explicitClient?: ServiceClient,
): Promise<void> {
  const validatedSections = validateCompositionSections(sections);
  const client = explicitClient ?? createServiceClient();
  const ownerId = explicitOwnerId ?? (await getOwnerId());

  const { error } = await client.rpc("set_resume_composition", {
    p_resume_id: resumeId,
    p_owner_id: ownerId,
    p_sections: validatedSections,
  });

  if (!error) return;

  if (error.code === "23505") {
    throw new CompositionError(
      "an entry can only appear once in a resume",
      "duplicate_entry",
    );
  }
  if (error.code === "P0002") {
    throw new CompositionError(error.message, "not_found");
  }
  if (error.code === "P0001") {
    throw new CompositionError(error.message, "invalid");
  }
  throw new Error(error.message);
}

export function compositionErrorStatus(code: CompositionErrorCode): number {
  if (code === "not_found") return 404;
  if (code === "duplicate_entry" || code === "duplicate_title") return 409;
  if (code === "malformed") return 400;
  return 422;
}
