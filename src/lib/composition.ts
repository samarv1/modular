import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerId } from "@/lib/owner";

// Shared by PATCH /api/resumes/:id/composition and POST /api/resumes
// (duplicate). Every path that writes a resume's section/entry tree goes
// through the set_resume_composition RPC (supabase/migrations/
// 0002_composition_rpc.sql) so the write is one transaction, not a
// delete-then-insert pair the API layer could interrupt.

export interface CompositionSectionInput {
  title: string;
  entries: string[]; // bank_entry ids, in display order
}

export type CompositionErrorCode = "not_found" | "duplicate_entry" | "invalid";

export class CompositionError extends Error {
  code: CompositionErrorCode;
  constructor(message: string, code: CompositionErrorCode) {
    super(message);
    this.code = code;
  }
}

// ownerId is optional so the sample-resume seed can compose a resume for a user
// who isn't the caller (the backfill route seeds every account). Request-scoped
// callers omit it and get the signed-in user, as before.
export async function setResumeComposition(
  resumeId: string,
  sections: CompositionSectionInput[],
  explicitOwnerId?: string,
): Promise<void> {
  const client = createServiceClient();
  const ownerId = explicitOwnerId ?? (await getOwnerId());

  const { error } = await client.rpc("set_resume_composition", {
    p_resume_id: resumeId,
    p_owner_id: ownerId,
    p_sections: sections,
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
  if (code === "duplicate_entry") return 409;
  return 422;
}
