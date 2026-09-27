import { eq } from "drizzle-orm"
import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { apiKeys, tenants } from "../schema.ts"
import { hashApiKey } from "../services/apiKeys.ts"
import { note } from "../services/requestLogger.ts"

export type Tenant = {
  id: string
  name: string
  monthlyBudgetMicros: number
}

export function requireApiKey(db: Db) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = readBearerToken(req.header("authorization"))
    if (!key) {
      refuse(res, "missing_key")
      return
    }

    const [row] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        monthlyBudgetMicros: tenants.monthlyBudgetMicros,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
      .where(eq(apiKeys.keyHash, hashApiKey(key)))
      .limit(1)

    if (!row) {
      refuse(res, "unknown_key")
      return
    }
    if (row.revokedAt !== null) {
      refuse(res, "revoked_key")
      return
    }

    res.locals.tenant = { id: row.id, name: row.name, monthlyBudgetMicros: row.monthlyBudgetMicros }
    note(res, { tenantId: row.id })
    next()
  }
}

export function tenantOf(res: Response): Tenant | undefined {
  return res.locals.tenant as Tenant | undefined
}

function readBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

function refuse(res: Response, errorCode: string): void {
  note(res, { status: "error", errorCode })
  console.log(`Rejected request: ${errorCode}`)
  res.status(401).json({
    error: {
      message: "Invalid API key. Send a valid key as: Authorization: Bearer <key>",
      type: "invalid_request_error",
      param: null,
      code: "invalid_api_key",
    },
  })
}
