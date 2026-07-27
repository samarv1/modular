export type JsonObject = Record<string, unknown>;

/** Parses a JSON request body and rejects null, arrays, and primitive values. */
export async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as JsonObject;
  } catch {
    return null;
  }
}

export function mutationErrorStatus(error: { code?: string }): number {
  if (error.code === "PGRST116") return 404;
  if (error.code === "23503") return 422;
  if (error.code === "22P02") return 400;
  return 500;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
