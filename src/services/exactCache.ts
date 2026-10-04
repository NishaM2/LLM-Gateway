import type { Cache } from "../redis.ts"
import { cacheKey } from "./cacheKey.ts"

export const CACHE_TTL_SECONDS = 600

// Bump this when the canonical form in cacheKey.ts changes, so answers stored under
// the old rules are never read back.
const KEY_VERSION = "v1"

export type CachedAnswer = {
  // The answer on its own, used to replay a cached answer as a stream.
  text: string
  finishReason: string
  // The provider's exact non streaming body, kept when we have it so a non streaming
  // hit is byte for byte what the provider sent. A streaming request has no such body.
  bodyText: string | null
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
}

export function cacheKeyFor(tenantId: string, body: Record<string, unknown>): string {
  return `cache:${KEY_VERSION}:${tenantId}:${cacheKey(body)}`
}

export async function readAnswer(cache: Cache, key: string): Promise<CachedAnswer | null> {
  if (!cache.isReady) return null

  try {
    const stored = await cache.get(key)
    if (stored === null) return null

    const parsed = JSON.parse(stored) as CachedAnswer
    return typeof parsed?.text === "string" ? parsed : null
  } catch {
    return null
  }
}

export async function writeAnswer(cache: Cache, key: string, answer: CachedAnswer): Promise<void> {
  if (!cache.isReady) return

  try {
    await cache.set(key, JSON.stringify(answer), { expiration: { type: "EX", value: CACHE_TTL_SECONDS } })
  } catch {
    // A cache that cannot be written to is a slower gateway, not a broken one.
  }
}
