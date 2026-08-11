// Without generated Database types, supabase-js's select() return type
// collapses to an unusable GenericStringError rather than a clean `any`.
// These just assert the row shape each call site already knows it needs.
export function asRow<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T | null; error: { message: string } | null };
}

export function asRows<T>(result: { data: unknown; error: unknown }) {
  return result as { data: T[] | null; error: { message: string } | null };
}
