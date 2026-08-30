import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const migrationsDirectory = path.resolve(process.cwd(), "supabase", "migrations");
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("[product:migrate] DATABASE_URL is required.");
  process.exit(1);
}

const files = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{14}_.+\.sql$/u.test(name))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error(`[product:migrate] No migrations found in ${migrationsDirectory}.`);
  process.exit(1);
}

const versions = files.map((name) => name.slice(0, 14));
if (new Set(versions).size !== versions.length) {
  console.error("[product:migrate] Duplicate migration versions detected.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });
let locked = false;

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('product.migration.bootstrap'))");
  locked = true;

  await client.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
  await client.query(`
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    )
  `);

  const { rows } = await client.query("SELECT version FROM supabase_migrations.schema_migrations");
  const applied = new Set(rows.map((row) => String(row.version)));
  const pending = files.filter((name) => !applied.has(name.slice(0, 14)));

  if (pending.length === 0) {
    console.log(`[product:migrate] Database is current (${files.length} migrations).`);
  }

  for (const file of pending) {
    const version = file.slice(0, 14);
    const name = file.slice(15, -4);
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    console.log(`[product:migrate] Applying ${file}`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ($1, $2, $3)",
        [version, [sql], name],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  if (pending.length > 0) {
    console.log(`[product:migrate] Applied ${pending.length}; database is current (${files.length} migrations).`);
  }
} catch (error) {
  console.error(`[product:migrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (locked) {
    await client.query("SELECT pg_advisory_unlock(hashtext('product.migration.bootstrap'))").catch(() => undefined);
  }
  await client.end().catch(() => undefined);
}
