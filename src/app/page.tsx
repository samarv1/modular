import { ownerScopedTable } from "@/lib/db";
import { BankPane } from "@/components/bank/bank-pane";
import type { BankEntryRow } from "@/app/api/entries/route";

export default async function Home() {
  const { data, error } = await ownerScopedTable("bank_entry")
    .select(
      "id, kind, source_section, display_name, raw_latex, tags, required_packages, source_resume_id, created_at",
    )
    // created_at only — see the matching note in api/entries/route.ts
    .order("created_at", { ascending: true });
  if (error) throw new Error((error as { message: string }).message);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-lg font-semibold uppercase tracking-tight">
          Modular
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
          phase 4 — bank pane
        </span>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-md flex-1">
        <BankPane initialEntries={(data ?? []) as unknown as BankEntryRow[]} />
      </div>
    </main>
  );
}
