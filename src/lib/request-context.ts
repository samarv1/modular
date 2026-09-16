import { ownerScopedTable, type ServiceClient } from "@/lib/db";
import { getOwnerId, getOwnerIdOrNull } from "@/lib/owner";
import { createServiceClient } from "@/lib/supabase/server";

export interface OwnerContext {
  ownerId: string;
  client: ServiceClient;
  table: (name: string) => ReturnType<typeof ownerScopedTable>;
}

export async function getOwnerContext(): Promise<OwnerContext> {
  const ownerId = await getOwnerId();
  return createOwnerContext(ownerId);
}

export async function getOwnerContextOrNull(): Promise<OwnerContext | null> {
  const ownerId = await getOwnerIdOrNull();
  return ownerId ? createOwnerContext(ownerId) : null;
}

function createOwnerContext(ownerId: string): OwnerContext {
  const client = createServiceClient();
  return {
    ownerId,
    client,
    table: (name) => ownerScopedTable(name, ownerId, client),
  };
}
