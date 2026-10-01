import { existsSync } from "node:fs"
import { loadConfig } from "../config.ts"
import { closeCache, connectCache, createCache } from "../redis.ts"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

const KEY = "gateway:ttl-check"
const TTL_SECONDS = 10

const config = loadConfig(process.env)
const cache = createCache(config.redisUrl)

try {
  await connectCache(cache)
  console.log(`Connected to ${config.redisUrl}`)

  await cache.set(KEY, "hello from the gateway", { expiration: { type: "EX", value: TTL_SECONDS } })
  console.log(`Wrote ${KEY} with a ${TTL_SECONDS} second life`)

  console.log(`  read now          ${describe(await cache.get(KEY))}`)
  console.log(`  expires in        ${await cache.ttl(KEY)} seconds`)

  for (let left = TTL_SECONDS + 1; left > 0; left--) {
    process.stdout.write(`\r  waiting           ${left} seconds  `)
    await sleep(1000)
  }
  process.stdout.write("\r                                      \r")

  console.log(`  read after ${TTL_SECONDS + 1}s   ${describe(await cache.get(KEY))}`)
  console.log("")
  console.log("Redis is working if the first read shows the value and the second shows nothing.")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error("Is Redis running? Start it with: docker compose up -d --wait")
  process.exitCode = 1
} finally {
  await closeCache(cache)
}

function describe(value: string | null): string {
  return value === null ? "(nothing, it expired)" : `"${value}"`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
