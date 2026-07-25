import { createServiceClient } from "@/lib/supabase/server";

// Thin interface over Supabase Storage (see PLAN.md "Key decisions" — archive
// storage). Every call site should go through this, not a bare
// supabase.storage.from(...) call, so swapping to raw S3 later — if volume
// ever justifies the cost difference — is a change to this file alone.
const BUCKET = "resume-archives";

export async function uploadArchive(path: string, bytes: Uint8Array, contentType: string) {
  const client = createServiceClient();
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600) {
  const client = createServiceClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteArchive(path: string) {
  const client = createServiceClient();
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
