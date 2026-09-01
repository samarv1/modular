// One-time cleanup for bank_entry rows orphaned by the old
// source-resumes DELETE behavior (pre-fix, it nulled source_resume_id
// instead of deleting the entry — see git history on
// src/app/api/source-resumes/[id]/route.ts). Those rows show as
// "source unavailable" in the bank and can't self-heal since nothing
// points them back at a source anymore.
//
// Only deletes bank_entry rows with source_resume_id IS NULL that are
// NOT referenced by resume_section_entry (entries currently placed in a
// resume outline are left alone, same as the live DELETE route).
//
// Usage:
//   node scripts/delete-orphaned-entries.mjs <owner-uuid> --dry-run   # prints what would be deleted
//   node scripts/delete-orphaned-entries.mjs <owner-uuid>             # actually deletes
import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const ownerId = args[0];
if (!ownerId) {
  console.error(
    "usage: node scripts/delete-orphaned-entries.mjs <owner-uuid> [--dry-run]",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows: candidates } = await client.query(
    `select id, kind, source_section, display_name
     from bank_entry
     where owner_id = $1
       and source_resume_id is null
       and id not in (select bank_entry_id from resume_section_entry)`,
    [ownerId],
  );

  if (candidates.length === 0) {
    console.log("nothing to delete");
  } else {
    console.log(
      `${candidates.length} orphaned entr${candidates.length === 1 ? "y" : "ies"} found:`,
    );
    for (const row of candidates) {
      console.log(
        `  ${row.kind} / ${row.source_section} — ${row.display_name}`,
      );
    }
  }

  if (dryRun) {
    console.log("\ndry run only — rerun without --dry-run to actually delete");
  } else if (candidates.length > 0) {
    const result = await client.query(
      `delete from bank_entry
       where owner_id = $1
         and source_resume_id is null
         and id not in (select bank_entry_id from resume_section_entry)`,
      [ownerId],
    );
    console.log(`\ndeleted ${result.rowCount} row(s)`);
  }
} finally {
  await client.end();
}
