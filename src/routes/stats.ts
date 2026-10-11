import express from "express"
import type { Request, Response } from "express"
import { z } from "zod"
import type { Db } from "../db.ts"
import { requireAdminToken } from "../middleware/adminAuth.ts"
import type { ProviderName } from "../models.ts"
import {
  CACHE_STATUSES,
  decodeCursor,
  REQUEST_STATUSES,
  hitRate,
  latencyByCacheStatus,
  requestPage,
  savings,
  spendByDay,
  summary,
  tenantOptions,
} from "../services/analytics.ts"
import type { Router } from "../services/router.ts"
import { startOfMonthUtc } from "../services/usage.ts"

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
  tenant: z.uuid().optional(),
  cacheStatus: z.enum(CACHE_STATUSES).optional(),
  status: z.enum(REQUEST_STATUSES).optional(),
})

export function statsRouter(db: Db, modelRouter: Router, providerNames: ProviderName[], adminToken: string | null): express.Router {
  const router = express.Router()

  router.use(requireAdminToken(adminToken))

  router.get("/summary", async (_req, res) => {
    res.json(await summary(db, startOfMonthUtc(new Date())))
  })

  router.get("/spend", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, spend: await spendByDay(db, query.days) })
  })

  router.get("/hit-rate", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, ...(await hitRate(db, daysAgo(query.days))) })
  })

  router.get("/savings", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, ...(await savings(db, daysAgo(query.days))) })
  })

  router.get("/latency", async (req, res) => {
    const query = parse(windowQuery, req, res)
    if (!query) return
    res.json({ days: query.days, groups: await latencyByCacheStatus(db, daysAgo(query.days)) })
  })

  router.get("/tenants", async (_req, res) => {
    res.json({ tenants: await tenantOptions(db) })
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

    const filters = { tenantId: query.tenant, cacheStatus: query.cacheStatus, status: query.status }
    res.json(await requestPage(db, { limit: query.limit, cursor, filters }))
  })

  return router
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function parse<T>(schema: z.ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query)
  if (result.success) return result.data

  const issue = result.error.issues[0]
  const field = issue?.path.join(".") ?? "query"
  res.status(400).json({ error: { message: `${field}: ${issue?.message ?? "is not valid"}`, type: "invalid_request_error" } })
  return null
}
