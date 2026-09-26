import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"

export type RequestLog = {
  modelRequested: string | null
  provider: string | null
  status: "ok" | "error" | "fallback"
  errorCode: string | null
  inputTokens: number | null
  outputTokens: number | null
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
    }
    res.locals.log = entry

    res.on("close", () => {
      void writeRow(db, entry)
    })

    next()
  }
}

export function note(res: Response, changes: Partial<RequestLog>): void {
  const entry = res.locals.log as RequestLog | undefined
  if (entry) Object.assign(entry, changes)
}

async function writeRow(db: Db, entry: RequestLog): Promise<void> {
  try {
    await db.insert(requests).values(entry)
  } catch (error) {
    console.error(`Could not write the request log: ${error instanceof Error ? error.message : String(error)}`)
  }
}