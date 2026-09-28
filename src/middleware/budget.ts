import type { NextFunction, Request, Response } from "express"
import type { Db } from "../db.ts"
import { note } from "../services/requestLogger.ts"
import { formatMicros, monthlySpendMicros } from "../services/usage.ts"
import { tenantOf } from "./auth.ts"

// Middleware that checks whether a tenant has exceeded its monthly spending budget
export function enforceBudget(db: Db) {
  return async function (_req: Request, res: Response, next: NextFunction): Promise<void> {

    // Get the authenticated tenant saved by the auth
    const tenant = tenantOf(res)
    if (!tenant) {
      next()
      return
    }

    // Calculate how much the tenant has spent this month in micro units
    const spentMicros = await monthlySpendMicros(db, tenant.id, new Date())

    // Convert the spending and budget into readable amounts for messages
    const spent = formatMicros(spentMicros)
    const budget = formatMicros(tenant.monthlyBudgetMicros)

    if (spentMicros < tenant.monthlyBudgetMicros) {
      next()
      return
    }

    note(res, { status: "error", errorCode: "budget_exceeded" })
    console.log(`Blocked ${tenant.name}: spent ${spent} of ${budget} this month`)
    res.status(402).json({
      error: {
        message: `Monthly budget reached. Spent ${spent} of ${budget} this month.`,
        type: "insufficient_quota",
        param: null,
        code: "budget_exceeded",
      },
    })
  }
}
