import { getAdapter } from "@/lib/adapters/registry";
import type { TemplateAdapter } from "@/lib/adapters/types";

/**
 * Looks up an adapter by id, throwing if it's missing. Both compile and
 * export load a resume's composition (which carries its adapterId from the
 * DB) and then need the matching adapter to assemble LaTeX — a missing
 * adapter here means a bad adapter_id got into the DB, not a user error, so
 * this throws (500) rather than returning a normal error response.
 */
export function getAdapterOrThrow(adapterId: string): TemplateAdapter {
  const adapter = getAdapter(adapterId);
  if (!adapter) {
    throw new Error(`unknown adapter id ${adapterId}`);
  }
  return adapter;
}
