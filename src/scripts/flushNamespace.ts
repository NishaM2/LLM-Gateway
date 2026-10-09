import { existsSync, readFileSync } from "node:fs"
import { eq } from "drizzle-orm"
import { loadConfig } from "../config.ts"
import { createDb, createPool } from "../db.ts"
import { tenants } from "../schema.ts"
import { namespaceFor } from "../services/namespace.ts"
import { flushNamespace } from "../services/semanticCache.ts"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

const tenantName = process.argv[2]?.trim()
const requestFile = process.argv[3]?.trim()

if (!tenantName || !requestFile) {
  console.error('Usage: npm run cache:flush -- "Tenant name" <request.json>')
  console.error("The request file sets the model, system prompt, tools and settings whose cached answers should go.")
  process.exit(1)
}

const body = JSON.parse(readFileSync(requestFile, "utf8")) as Record<string, unknown>

const config = loadConfig(process.env)
const pool = createPool(config.databaseUrl)
const db = createDb(pool)

try {
  const matches = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.name, tenantName))
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one tenant called "${tenantName}", found ${matches.length}`)
  }

  const namespace = namespaceFor(matches[0]!.id, body)
  const removed = await flushNamespace(db, namespace)
  console.log(`Removed ${removed} semantic cache ${removed === 1 ? "entry" : "entries"} from namespace ${namespace.slice(0, 12)}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
