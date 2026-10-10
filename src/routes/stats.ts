import express from "express"
import type { Request, Response } from "express"
import { z } from "zod"
import type { Db } from "../db.ts"
import { requireAdminToken } from "../middleware/adminAuth.ts"
import type { ProviderName } from "../models.ts"
import {
  decodeCursor,
  hitRate,
  latencyByCacheStatus,
  requestPage,
  savings,
  spendByDay,
} from "../services/analytics.ts"
import type { Router } from "../services/router.ts"

export const DEFAULT_DAYS = 30
export const MAX_DAYS = 365
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

const windowQuery = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
})

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
})

export function statsRouter(db: Db, modelRouter: Router, providerNames: ProviderName[], adminToken: string | null): express.Router {
  const router = express.Router()

  router.use(requireAdminToken(adminToken))

  router.get("/spend", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, spend: await spendByDay(db, query.days) })
  })

  router.get("/hit-rate", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, ...(await hitRate(db, query.days)) })
  })

  router.get("/savings", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, ...(await savings(db, query.days)) })
  })

  router.get("/latency", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, groups: await latencyByCacheStatus(db, query.days) })
  })

  router.get("/providers", (_req, res) => {
    res.json({ providers: providerNames.map((provider) => ({ provider, circuit: modelRouter.breakerState(provider) })) })
  })

  router.get("/requests", async (req, res) => {
    const query = parse(pageQuery, req, res)
    if (!query) return

    const cursor = query.cursor ? decodeCursor(query.cursor) : null
    if (query.cursor && !cursor) {
      res.status(400).json({ error: { message: "cursor is not valid. Use the nextCursor value from the previous page.", type: "invalid_request_error" } })
      return
    }

    res.json(await requestPage(db, { limit: query.limit, cursor }))
  })

  return router
}

function parse<T>(schema: z.ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query)
  if (result.success) return result.data

  const issue = result.error.issues[0]
  const field = issue?.path.join(".") ?? "query"
  res.status(400).json({ error: { message: `${field}: ${issue?.message ?? "is not valid"}`, type: "invalid_request_error" } })
  return null
}
