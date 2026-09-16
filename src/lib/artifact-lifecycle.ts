import { deleteArchive } from "@/lib/storage";
import type { ServiceClient } from "@/lib/db";

export async function deleteArtifactSafely(
  path: string | null | undefined,
  client?: ServiceClient,
) {
  if (!path) return;
  try {
    await deleteArchive(path, client);
  } catch (error) {
    console.error("artifact cleanup failed:", path, error);
  }
}
