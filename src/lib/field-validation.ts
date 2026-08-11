import { NextResponse } from "next/server";

/**
 * Validates a set of optional integer body fields (e.g. positionX/positionY
 * on the desktop-placement routes). Returns an error response for the first
 * present-but-non-integer field, or null if every present field is valid.
 * Fields that are `undefined` (not sent) are left alone here.
 */
export function integerFieldError(body: Record<string, unknown>, fields: string[]): NextResponse | null {
  for (const field of fields) {
    if (body[field] !== undefined && !Number.isInteger(body[field])) {
      return NextResponse.json({ error: `${field} must be an integer` }, { status: 400 });
    }
  }
  return null;
}

/** Validates an optional nullable-string body field (e.g. folderId). */
export function nullableStringFieldError(body: Record<string, unknown>, field: string): NextResponse | null {
  if (body[field] !== undefined && body[field] !== null && typeof body[field] !== "string") {
    return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
  }
  return null;
}
