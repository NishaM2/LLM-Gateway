import express from "express"
import type { Config } from "./config.ts"
import { chatRouter } from "./routes/chat.ts"
import { errorHandler } from "./middleware/errorHandler.ts"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"

export function createApp(config: Config, db: NodePgDatabase<Record<string, never>> & { $client: Pool }) {
  const app = express()

  app.use(express.json({ limit: "2mb"}))

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  });

  app.use(chatRouter(config))
  app.use(errorHandler)

  return app
}
