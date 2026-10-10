import express from "express"
import type { Config } from "./config.ts"
import type { Db } from "./db.ts"
import type { ProviderName } from "./models.ts"
import type { Cache } from "./redis.ts"
import { requireApiKey } from "./middleware/auth.ts"
import { enforceBudget } from "./middleware/budget.ts"
import { errorHandler } from "./middleware/errorHandler.ts"
import { createProviders } from "./providers/registry.ts"
import { chatRouter } from "./routes/chat.ts"
import { statsRouter } from "./routes/stats.ts"
import { createRouter } from "./services/router.ts"
import { requestLogging } from "./services/requestLogger.ts"

export function createApp(config: Config, db: Db, cache: Cache) {
  const app = express()

  app.use(express.json({ limit: "2mb" }))

  const providers = createProviders(config)
  const modelRouter = createRouter(providers)

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.use("/stats", statsRouter(db, modelRouter, Object.keys(providers) as ProviderName[], config.adminToken))

  app.use(requestLogging(db))

  app.use(requireApiKey(db))

  app.use(enforceBudget(db))

  app.use(chatRouter(modelRouter, cache, db))

  app.use(errorHandler)

  return app
}