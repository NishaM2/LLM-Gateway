import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"
import { priceRequest } from "./pricing.ts"

export type RequestLog = {
  tenantId: string | null
  modelRequested: string | null
  modelServed: string | null
  provider: string | null
  status: "ok" | "error" | "fallback"
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
      errorCode: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      ttftMs: null,
    }

    // store the log entry
    res.locals.log = entry
    res.locals.logStartedAt = performance.now()

    res.on("close", () => {
      entry.latencyMs = elapsedMs(res)
      void writeRow(db, entry)
    })

    next()
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
    const costMicros = await priceRequest(db, {
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
