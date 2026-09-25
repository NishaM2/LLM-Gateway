import express from "express"
import type { Config } from "./config.ts"
import { chatRouter } from "./routes/chat.ts"
import { errorHandler } from "./middleware/errorHandler.ts"

export function createApp(config: Config) {
  const app = express()

  app.use(express.json({ limit: "2mb"}))

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  });

  app.use(chatRouter(config))
  app.use(errorHandler)

  return app
}
