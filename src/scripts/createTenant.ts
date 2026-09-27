import { existsSync } from "node:fs"
import { loadConfig } from "../config.ts"
import { createDb, createPool } from "../db.ts"
import { apiKeys, tenants } from "../schema.ts"
import { hashApiKey, newApiKey } from "../services/apiKeys.ts"
import { formatMicros } from "../services/usage.ts"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

const name = process.argv[2]?.trim()
const rawBudget = process.argv[3]?.trim() ?? "1"
const label = process.argv[4]?.trim() ?? "default"

if (!name) {
  console.error('Usage: npm run tenant:create -- "Tenant name" <monthly budget in dollars> [key label]')
  process.exit(1)
}

const budgetDollars = Number(rawBudget)
if (!Number.isFinite(budgetDollars) || budgetDollars <= 0) {
  console.error(`The monthly budget must be a positive number of dollars (got "${rawBudget}")`)
  process.exit(1)
}

const budgetMicros = Math.round(budgetDollars * 1_000_000)

const config = loadConfig(process.env)
const pool = createPool(config.databaseUrl)
const db = createDb(pool)

try {
  const [tenant] = await db
    .insert(tenants)
    .values({ name, monthlyBudgetMicros: budgetMicros })
    .returning()

  if (!tenant) {
    throw new Error("The tenant row was not created")
  }

  const key = newApiKey()
  await db.insert(apiKeys).values({ tenantId: tenant.id, keyHash: hashApiKey(key), label })

  console.log(`Tenant created`)
  console.log(`  id      ${tenant.id}`)
  console.log(`  name    ${tenant.name}`)
  console.log(`  budget  ${formatMicros(budgetMicros)} per month`)
  console.log(`  label   ${label}`)
  console.log(``)
  console.log(`API key, shown once only, save it now:`)
  console.log(`  ${key}`)
} catch (error) {
  console.error(`Could not create the tenant: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
