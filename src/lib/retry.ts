import { ProviderError } from "../providers/types.ts"

export const MAX_ATTEMPTS = 3
export const BASE_DELAY_MS = 250

export type RetryOptions = {
  attempts: number
  baseDelayMs: number
  signal?: AbortSignal
  onAttempt?: (attempt: number) => void
  onWait?: (attempt: number, waitMs: number, error: unknown) => void
}

export async function retry<T>(work: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    options.onAttempt?.(attempt)

    try {
      return await work()
    } catch (error) {
      lastError = error

      const worthRetrying = error instanceof ProviderError && error.retryable
      if (!worthRetrying || attempt === options.attempts || options.signal?.aborted) throw error

      const waitMs = waitFor(attempt, options.baseDelayMs)
      options.onWait?.(attempt, waitMs, error)
      await sleep(waitMs, options.signal)
    }
  }

  throw lastError
}

export function waitFor(attempt: number, baseDelayMs: number): number {
  const doubling = baseDelayMs * 2 ** (attempt - 1)
  const jitter = Math.floor(Math.random() * baseDelayMs)
  return doubling + jitter
}

export function describeAttemptFailure(error: unknown): string {
  if (error instanceof ProviderError) return error.detail
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    function onAbort(): void {
      clearTimeout(timer)
      reject(
        new ProviderError({
          status: 499,
          code: "caller_hung_up",
          message: "The caller went away.",
          detail: "The caller disconnected while the gateway was waiting to retry",
          retryable: false,
          fallbackable: false,
        }),
      )
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
