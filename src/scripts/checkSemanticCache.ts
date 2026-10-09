import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { setTimeout as wait } from "node:timers/promises"
import { eq } from "drizzle-orm"
import { loadConfig } from "../config.ts"
import { createDb, createPool } from "../db.ts"
import { deleteExpired } from "../jobs/cleanup.ts"
import { cacheEntries } from "../schema.ts"
import { embed } from "../services/embeddings.ts"
import type { CachedAnswer } from "../services/exactCache.ts"
import { countHit, findClosest, flushNamespace, rememberAnswer } from "../services/semanticCache.ts"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

const SHORT_TTL_SECONDS = 3

const config = loadConfig(process.env)
const pool = createPool(config.databaseUrl)
const db = createDb(pool)

const run = randomUUID().slice(0, 8)
const short = `check-short-${run}`
const flushed = `check-flushed-${run}`
const kept = `check-kept-${run}`

let failures = 0
function check(label: string, passed: boolean, detail: string): void {
  if (!passed) failures += 1
  console.log(`${passed ? "PASS" : "FAIL"}  ${label} (${detail})`)
}

function answerTo(question: string): CachedAnswer {
  return { text: `Stored answer to: ${question}`, finishReason: "stop", bodyText: null, provider: "mock", model: "mock", inputTokens: 1, outputTokens: 1 }
}

async function store(namespace: string, question: string, ttlSeconds?: number): Promise<void> {
  await rememberAnswer(db, { namespace, question, embedding: await embed(question), closest: null }, answerTo(question), ttlSeconds)
}

async function countIn(namespace: string): Promise<number> {
  return (await db.select({ id: cacheEntries.id }).from(cacheEntries).where(eq(cacheEntries.namespace, namespace))).length
}

try {
  console.log(`Storing an entry that lives for ${SHORT_TTL_SECONDS} seconds\n`)
  await store(short, "How do I reset my password?", SHORT_TTL_SECONDS)
  const reworded = await embed("How can I reset my password?")

  for (let i = 1; i <= 3; i++) {
    const match = await findClosest(db, short, reworded)
    if (match) await countHit(db, match.id)
  }

  const [entry] = await db.select({ hitCount: cacheEntries.hitCount }).from(cacheEntries).where(eq(cacheEntries.namespace, short))
  check("hit count goes up once per hit", entry?.hitCount === 3, `hit_count is ${entry?.hitCount}, expected 3`)

  console.log(`\nWaiting ${SHORT_TTL_SECONDS + 1} seconds for it to expire...\n`)
  await wait((SHORT_TTL_SECONDS + 1) * 1000)

  const afterExpiry = await findClosest(db, short, reworded)
  check("an expired entry is no longer served", afterExpiry === null, afterExpiry ? `still found "${afterExpiry.prompt}"` : "lookup found nothing")
  check("but it is still in the table until cleanup runs", (await countIn(short)) === 1, `${await countIn(short)} row left`)

  const removed = await deleteExpired(db)
  check("cleanup deletes the expired row", (await countIn(short)) === 0, `cleanup removed ${removed} expired row(s) in total`)

  console.log("\nFilling two namespaces, then flushing one\n")
  await store(flushed, "What are your opening hours?")
  await store(flushed, "Do you ship internationally?")
  await store(kept, "What are your opening hours?")

  const flushedCount = await flushNamespace(db, flushed)
  check("flush removes every entry in its namespace", flushedCount === 2 && (await countIn(flushed)) === 0, `removed ${flushedCount}, ${await countIn(flushed)} left`)
  check("flush leaves other namespaces alone", (await countIn(kept)) === 1, `${await countIn(kept)} entry still in the other namespace`)

  await flushNamespace(db, kept)
} finally {
  await pool.end()
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
