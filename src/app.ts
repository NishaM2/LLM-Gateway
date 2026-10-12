import { join } from "node:path"
import { fileURLToPath } from "node:url"
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

  const webDir = fileURLToPath(new URL("../client/dist", import.meta.url))
  app.use(express.static(webDir, { index: false, maxAge: "1h" }))
  app.get(["/", "/dashboard"], (_req, res) => {
    res.sendFile(join(webDir, "index.html"), (error) => {
      if (error && !res.headersSent) {
        res.status(404).type("text/plain").send("The web app has not been built yet. Run npm run web:build, or use npm run web while developing.")
      }
    })
  })

  app.use("/stats", statsRouter(db, modelRouter, Object.keys(providers) as ProviderName[], config.adminToken, config.statsPublic))

  app.use(requestLogging(db))

  app.use(requireApiKey(db))

  app.use(enforceBudget(db))

  app.use(chatRouter(modelRouter, cache, db))

  app.use(errorHandler)

  return app
}