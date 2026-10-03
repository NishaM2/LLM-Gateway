import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"
import { priceRequest } from "./pricing.ts"

// How long to wait for a handler to finish before writing its log row regardless
const WRITE_DEADLINE_MS = 10_000

export type RequestLog = {
  tenantId: string | null
  modelRequested: string | null
  modelServed: string | null
  provider: string | null
  status: "ok" | "error" | "fallback"
  attempts: number | null
  cacheStatus: "hit" | "miss" | "skip" | null
  errorCode: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  ttftMs: number | null
}

// It tracks each incoming request and saves its details to the database
export function requestLogging(db: Db) {
  return function (_req: Request, res: Response, next: NextFunction): void {

    // Create an initial log entry with default values Values become available as the request moves through the gateway
    const entry: RequestLog = {
      tenantId: null,
      modelRequested: null,
      modelServed: null,
      provider: null,
      status: "ok",
      attempts: null,
      cacheStatus: null,
      errorCode: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      ttftMs: null,
    }

    let closed = false
    let held = false
    let written = false
    let deadline: NodeJS.Timeout | null = null

    function write(): void {
      if (written || !closed || held) return
      written = true
      if (deadline) clearTimeout(deadline)
      void writeRow(db, entry)
    }

    // store the log entry
    res.locals.log = entry
    res.locals.logStartedAt = performance.now()

    res.locals.logHold = () => {
      held = true
    }

    res.locals.logRelease = () => {
      held = false
      write()
    }

    res.on("close", () => {
      entry.latencyMs = elapsedMs(res)
      closed = true

      if (held) {
        deadline = setTimeout(() => {
          held = false
          console.warn("A request handler did not finish in time, writing its log row anyway")
          write()
        }, WRITE_DEADLINE_MS)
        deadline.unref()
      }

      write()
    })

    next()
  }
}

export function holdLog(res: Response): void {
  const hold = res.locals.logHold as (() => void) | undefined
  hold?.()
}

export function releaseLog(res: Response): void {
  const release = res.locals.logRelease as (() => void) | undefined
  release?.()
}

// Wraps a route handler so its log row is written only after the handler has finished.
// On failure the hold is passed to the error handler, which records the error code first.
export function withLog(handler: (req: Request, res: Response) => Promise<void>) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    holdLog(res)
    try {
      await handler(req, res)
    } catch (error) {
      next(error)
      return
    }
    releaseLog(res)
  }
}

// Update selected fields in the current request log entry
export function note(res: Response, changes: Partial<RequestLog>): void {
  const entry = res.locals.log as RequestLog | undefined
  if (entry) Object.assign(entry, changes)
}

// Calculate how many milliseconds have passed since request processing started
export function elapsedMs(res: Response): number {
  const startedAt = res.locals.logStartedAt as number | undefined
  if (startedAt === undefined) return 0
  return Math.round(performance.now() - startedAt)
}

// Calculates the request's cost and saves the completed log entry in postgreSQL
async function writeRow(db: Db, entry: RequestLog): Promise<void> {
  try {
    // An answer served from the cache cost nothing, whatever its token counts say.
    const costMicros =
      entry.cacheStatus === "hit"
        ? 0
        : await priceRequest(db, {
            provider: entry.provider,
            model: entry.modelServed,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            at: new Date(),
          })

    await db.insert(requests).values({ ...entry, costMicros })
  } catch (error) {
    console.error(`Could not write the request log: ${error instanceof Error ? error.message : String(error)}`)
  }
}
