import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const requestStatus = pgEnum("request_status", ["ok", "error", "fallback"])

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  modelRequested: text("model_requested").notNull(),
  status: requestStatus("status").notNull(),
})