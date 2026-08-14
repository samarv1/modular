// Applies each supabase/migrations/*.sql file once against SUPABASE_DB_URL.
// For a database created before migration tracking existed, run once with
// --baseline after confirming every checked-in migration is already present.
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const baseline = process.argv.includes("--baseline");

await client.connect();
try {
  await client.query(`
    create table if not exists modular_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows: appliedRows } = await client.query(
    "select filename from modular_schema_migrations order by filename",
  );
  const applied = new Set(appliedRows.map((row) => row.filename));

  if (baseline) {
    await client.query("begin");
    try {
      for (const file of files) {
        await client.query(
          "insert into modular_schema_migrations (filename) values ($1) on conflict do nothing",
          [file],
        );
      }
      await client.query("commit");
      console.log(`baselined ${files.length} migration(s)`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } else {
    if (applied.size === 0) {
      const { rows } = await client.query(
        "select to_regclass('public.template_shell') is not null as schema_exists",
      );
      if (rows[0]?.schema_exists) {
        throw new Error(
          "existing Modular schema has no migration history; verify it is current, then rerun with --baseline",
        );
      }
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skipping ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`applying ${file}...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into modular_schema_migrations (filename) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log("  ok");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  }
} finally {
  await client.end();
}
