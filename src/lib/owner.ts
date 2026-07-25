// Single source for the current owner_id. Personal MVP has no login, so this
// resolves to a hardcoded constant from the environment. When Google SSO
// ships, replace the body of this function with a real session lookup —
// every call site and RLS-setting call stays the same.
export function getOwnerId(): string {
  const ownerId = process.env.MODULAR_OWNER_ID;
  if (!ownerId) {
    throw new Error("MODULAR_OWNER_ID is not set");
  }
  return ownerId;
}
