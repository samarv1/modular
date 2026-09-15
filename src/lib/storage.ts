import { createServiceClient } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/db";

const BUCKET = "resume-archives";

export async function uploadArchive(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  client: ServiceClient = createServiceClient(),
) {
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  options?: { download?: boolean | string },
  client: ServiceClient = createServiceClient(),
) {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(
      path,
      expiresInSeconds,
      options?.download ? { download: options.download } : undefined,
    );
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadArchive(
  path: string,
  client: ServiceClient = createServiceClient(),
): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteArchive(
  path: string,
  client: ServiceClient = createServiceClient(),
) {
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
