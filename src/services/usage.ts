import { and, eq, gte, sum } from "drizzle-orm"
import type { Db } from "../db.ts"
import { requests } from "../schema.ts"

export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function monthlySpendMicros(db: Db, tenantId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sum(requests.costMicros) })
    .from(requests)
    .where(and(eq(requests.tenantId, tenantId), gte(requests.createdAt, startOfMonthUtc(now))))

  return Number(row?.total ?? 0)
}

export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000
  if (dollars === 0) return "$0.00"
  if (dollars < 0.01) return `$${dollars.toFixed(6)}`
  return `$${dollars.toFixed(4)}`
}
