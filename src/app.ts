import express from "express"
import type { Config } from "./config.ts"
import type { Db } from "./db.ts"
import { errorHandler } from "./middleware/errorHandler.ts"
import { chatRouter } from "./routes/chat.ts"
import { requestLogging } from "./services/requestLogger.ts"

export function createApp(config: Config, db: Db) {
  const app = express()

  app.use(express.json({ limit: "2mb" }))

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.use(requestLogging(db))

  app.use(chatRouter(config))

  app.use(errorHandler)

  return app
}