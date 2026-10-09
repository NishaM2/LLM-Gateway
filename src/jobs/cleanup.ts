import { lte, sql } from "drizzle-orm"
import type { Db } from "../db.ts"
import { cacheEntries } from "../schema.ts"

export const CLEANUP_INTERVAL_MS = 10 * 60_000

export async function deleteExpired(db: Db): Promise<number> {
  const removed = await db
    .delete(cacheEntries)
    .where(lte(cacheEntries.expiresAt, sql`now()`))
    .returning({ id: cacheEntries.id })
  return removed.length
}

export function startCleanup(db: Db, intervalMs: number = CLEANUP_INTERVAL_MS): () => void {
  async function run(): Promise<void> {
    try {
      const removed = await deleteExpired(db)
      if (removed > 0) console.log(`Cleanup removed ${removed} expired semantic cache ${removed === 1 ? "entry" : "entries"}`)
    } catch (error) {
      console.warn(`Semantic cache cleanup failed, will try again later: ${error instanceof Error ? error.message : error}`)
    }
  }

  void run()
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
