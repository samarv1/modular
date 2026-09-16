import {
  extractResumeStructure,
  type ByokConfig,
} from "@/lib/resume-extraction";
import { reserveSharedKeyUsage, releaseSharedKeyUsage } from "@/lib/ai-usage";
import { getByokKey } from "@/lib/byok-store";
import type { ServiceClient } from "@/lib/db";

export async function extractResumeForOwner(
  source: string,
  ownerId: string,
  client?: ServiceClient,
) {
  const apiKey = await getByokKey(ownerId, client);
  const byok: ByokConfig | undefined = apiKey ? { apiKey } : undefined;
  if (!byok) await reserveSharedKeyUsage(ownerId, client);

  try {
    return await extractResumeStructure(source, byok);
  } catch (error) {
    if (!byok) await releaseSharedKeyUsage(ownerId, client);
    throw error;
  }
}
