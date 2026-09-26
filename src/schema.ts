import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

export const requestStatus = pgEnum("request_status", ["ok", "error", "fallback"])

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  modelRequested: text("model_requested"),
  provider: text("provider"),
  status: requestStatus("status").notNull(),
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
