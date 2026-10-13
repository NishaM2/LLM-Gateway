import { existsSync } from "node:fs"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error("DATABASE_URL is missing. Set it in .env or in the terminal first.")
  process.exit(1)
}

const host = new URL(url).hostname
const pool = new pg.Pool({ connectionString: url })

try {
  console.log(`Applying migrations to ${host}`)
  await migrate(drizzle(pool), { migrationsFolder: "migrations" })
  const { rows } = await pool.query("SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations")
  console.log(`Done. ${rows[0].applied} migrations are applied.`)
} catch (error) {
  const cause = (error as { cause?: Error }).cause
  console.error(`Migration failed: ${cause?.message ?? (error instanceof Error ? error.message : String(error))}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
