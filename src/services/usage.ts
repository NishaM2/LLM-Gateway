import { and, eq, gte, sum } from "drizzle-orm"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"

// Returns the starting date and time of the current month in UTC
export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// Calculate the total cost of a tenants request since the beginning of this month
export async function monthlySpendMicros(db: Db, tenantId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sum(requests.costMicros) })
    .from(requests)
    .where(and(eq(requests.tenantId, tenantId), gte(requests.createdAt, startOfMonthUtc(now))))

  return Number(row?.total ?? 0)
}

// Converts cost from micro dollars into a readable dollar amount
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000
  if (dollars === 0) return "$0.00"
  if (dollars < 0.01) return `$${dollars.toFixed(6)}`
  return `$${dollars.toFixed(4)}`
}
