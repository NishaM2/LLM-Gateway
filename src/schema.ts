import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core"

export const EMBEDDING_DIMENSIONS = 384

export const requestStatus = pgEnum("request_status", ["ok", "error", "fallback"])

export const cacheStatus = pgEnum("cache_status", ["hit", "miss", "skip"])

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  modelRequested: text("model_requested"),
  modelServed: text("model_served"),
  provider: text("provider"),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  status: requestStatus("status").notNull(),
  attempts: integer("attempts"),
  cacheStatus: cacheStatus("cache_status"),
  errorCode: text("error_code"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costMicros: integer("cost_micros"),
  latencyMs: integer("latency_ms"),
  ttftMs: integer("ttft_ms"),
})

export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputMicrosPerMillion: integer("input_micros_per_million").notNull(),
    outputMicrosPerMillion: integer("output_micros_per_million").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("model_prices_unique").on(table.provider, table.model, table.effectiveFrom)],
)

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  name: text("name").notNull(),
  monthlyBudgetMicros: integer("monthly_budget_micros").notNull(),
})

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

export const cacheEntries = pgTable("cache_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  prompt: text("prompt").notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  response: jsonb("response").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  hitCount: integer("hit_count").notNull().default(0),
})
