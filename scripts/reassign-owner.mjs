// One-time data migration for the Google SSO cutover: reassigns every row
// currently owned by the old MODULAR_OWNER_ID stand-in (env var) to a real
// Supabase Auth user id, across all 7 owner_id tables.
//
// Run this AFTER signing in with Google once in the app (so the target
// auth.users row exists) and BEFORE applying 0007_auth_owner_fk.sql /
// 0008_rls.sql (that FK add fails otherwise, since MODULAR_OWNER_ID was
// never a real auth.users id).
//
// Usage:
//   node scripts/reassign-owner.mjs <new-owner-uuid> --dry-run   # prints row counts only
//   node scripts/reassign-owner.mjs <new-owner-uuid>             # actually reassigns
import pg from "pg";

const TABLES = [
  "template_shell",
  "source_resume",
  "bank_entry",
  "resume",
  "resume_section",
  "resume_section_entry",
  "resume_folder",
];

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

const oldOwnerId = process.env.MODULAR_OWNER_ID;
if (!oldOwnerId) {
  console.error("MODULAR_OWNER_ID is not set");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const newOwnerId = args[0];
if (!newOwnerId) {
  console.error(
    "usage: node scripts/reassign-owner.mjs <new-owner-uuid> [--dry-run]",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows: userRows } = await client.query(
    "select id from auth.users where id = $1",
    [newOwnerId],
  );
  if (userRows.length === 0) {
    throw new Error(
      `no auth.users row for ${newOwnerId} — sign in with Google once first, then rerun`,
    );
  }

  for (const table of TABLES) {
    const { rows } = await client.query(
      `select count(*)::int as count from ${table} where owner_id = $1`,
      [oldOwnerId],
    );
    const count = rows[0].count;
    if (dryRun) {
      console.log(`${table}: ${count} row(s) would be reassigned`);
      continue;
    }
    if (count === 0) {
      console.log(`${table}: nothing to reassign`);
      continue;
    }
    const result = await client.query(
      `update ${table} set owner_id = $1 where owner_id = $2`,
      [newOwnerId, oldOwnerId],
    );
    console.log(`${table}: reassigned ${result.rowCount} row(s)`);
  }

  if (dryRun) {
    console.log(
      "\ndry run only — rerun without --dry-run to actually reassign",
    );
  }
} finally {
  await client.end();
}
