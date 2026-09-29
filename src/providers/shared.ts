import { ProviderError } from "./types.ts"

export const START_TIMEOUT_MS = 30_000

export async function fetchWithTimeout(url: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), START_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([timeout.signal, callerSignal]) : timeout.signal

  try {
    return await fetch(url, { ...init, signal })
  } catch (error) {
    if (callerSignal?.aborted) {
      throw new ProviderError(499, "caller_hung_up", "The caller went away.", "The caller disconnected before the provider answered", false)
    }
    if (timeout.signal.aborted) {
      throw new ProviderError(504, "provider_timeout", "The provider took too long to answer.", `Provider did not start answering within ${START_TIMEOUT_MS}ms`, true)
    }
    throw new ProviderError(502, "provider_unreachable", "The provider could not be reached.", `Could not reach the provider: ${describeCause(error)}`, true)
  } finally {
    clearTimeout(timer)
  }
}

export function describeProviderFailure(status: number, body: string): ProviderError {
  const message = extractMessage(body)

  if (status === 401 || status === 403) {
    return new ProviderError(500, "gateway_misconfigured", "The gateway is not set up correctly.", `Provider rejected the gateway API key (${status}): ${message}`, false)
  }
  if (status === 429) {
    return new ProviderError(429, "provider_rate_limited", "The provider is rate limiting this gateway. Please try again shortly.", `Provider rate limit (429): ${message}`, true)
  }
  if (status >= 500) {
    return new ProviderError(502, "provider_error", `The provider failed: ${message}`, `Provider server error (${status}): ${message}`, true)
  }
  return new ProviderError(status, "request_rejected", message, `Provider rejected the request (${status}): ${message}`, false)
}

export function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function describeCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof AggregateError) {
    return cause.errors.map((inner) => (inner instanceof Error ? inner.message : String(inner))).join("; ")
  }
  if (cause instanceof Error) return cause.message

  return error.message
}

export function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function extractMessage(body: string): string {
  const parsed = parseJson(body)
  if (typeof parsed?.error?.message === "string") return parsed.error.message
  return body.slice(0, 200) || "no details given"
}

export function streamFrom(
  source: AsyncGenerator<Uint8Array, void, void>,
  stopSource: () => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await source.next()
      if (done) {
        controller.close()
        return
      }
      controller.enqueue(value)
    },

    async cancel() {
      await stopSource()
    },
  })
}
