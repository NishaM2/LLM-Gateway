import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"
import { priceRequest } from "./pricing.ts"

export type RequestLog = {
  modelRequested: string | null
  provider: string | null
  status: "ok" | "error" | "fallback"
  errorCode: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
  ttftMs: number | null
}

export function requestLogging(db: Db) {
  return function (_req: Request, res: Response, next: NextFunction): void {
    const entry: RequestLog = {
      modelRequested: null,
      provider: null,
      status: "ok",
      errorCode: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      ttftMs: null,
    }
    res.locals.log = entry
    res.locals.logStartedAt = performance.now()

    res.on("close", () => {
      entry.latencyMs = elapsedMs(res)
      void writeRow(db, entry)
    })

    next()
  }
}

export function note(res: Response, changes: Partial<RequestLog>): void {
  const entry = res.locals.log as RequestLog | undefined
  if (entry) Object.assign(entry, changes)
}

export function elapsedMs(res: Response): number {
  const startedAt = res.locals.logStartedAt as number | undefined
  if (startedAt === undefined) return 0
  return Math.round(performance.now() - startedAt)
}

async function writeRow(db: Db, entry: RequestLog): Promise<void> {
  try {
    const costMicros = await priceRequest(db, {
      provider: entry.provider,
      model: entry.modelRequested,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      at: new Date(),
    })

    await db.insert(requests).values({ ...entry, costMicros })
  } catch (error) {
    console.error(`Could not write the request log: ${error instanceof Error ? error.message : String(error)}`)
  }
}
