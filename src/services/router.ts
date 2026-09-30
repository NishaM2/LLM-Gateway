import { BASE_DELAY_MS, MAX_ATTEMPTS, retry } from "../lib/retry.ts"
import type { ModelRoute, ModelTarget } from "../models.ts"
import type { Providers } from "../providers/registry.ts"
import { ProviderError, type ProviderReply } from "../providers/types.ts"

export type RouteOutcome = {
  reply: ProviderReply
  target: ModelTarget
  attempts: number
  usedFallback: boolean
}

export type RouteEvents = {
  onAttempt?: (target: ModelTarget, attemptsSoFar: number) => void
  onWait?: (target: ModelTarget, waitMs: number, error: unknown) => void
  onFallback?: (from: ModelTarget, to: ModelTarget, error: unknown) => void
}

export async function routeRequest(
  providers: Providers,
  route: ModelRoute,
  call: { body: Record<string, unknown>; stream: boolean; signal?: AbortSignal },
  events: RouteEvents = {},
): Promise<RouteOutcome> {
  let attempts = 0
  let lastError: unknown

  for (const [position, target] of route.entries()) {
    try {
      const reply = await retry(() => providers[target.provider].send({ model: target.model, ...call }), {
        attempts: MAX_ATTEMPTS,
        baseDelayMs: BASE_DELAY_MS,
        signal: call.signal,
        onAttempt: () => {
          attempts += 1
          events.onAttempt?.(target, attempts)
        },
        onWait: (_attempt, waitMs, error) => events.onWait?.(target, waitMs, error),
      })

      return { reply, target, attempts, usedFallback: position > 0 }
    } catch (error) {
      lastError = error

      const next = route[position + 1]
      const worthTryingAnother = error instanceof ProviderError && error.fallbackable
      if (!next || !worthTryingAnother) throw error

      events.onFallback?.(target, next, error)
    }
  }

  throw lastError
}
