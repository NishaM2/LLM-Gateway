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
      throw new ProviderError({
        status: 499,
        code: "caller_hung_up",
        message: "The caller went away.",
        detail: "The caller disconnected before the provider answered",
        retryable: false,
        fallbackable: false,
      })
    }
    if (timeout.signal.aborted) {
      throw new ProviderError({
        status: 504,
        code: "provider_timeout",
        message: "The provider took too long to answer.",
        detail: `Provider did not start answering within ${START_TIMEOUT_MS}ms`,
        retryable: true,
        fallbackable: true,
      })
    }
    throw new ProviderError({
      status: 502,
      code: "provider_unreachable",
      message: "The provider could not be reached.",
      detail: `Could not reach the provider: ${describeCause(error)}`,
      retryable: true,
      fallbackable: true,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function describeProviderFailure(status: number, body: string): ProviderError {
  const message = extractMessage(body)

  if (status === 401 || status === 403) {
    return new ProviderError({
      status: 500,
      code: "gateway_misconfigured",
      message: "The gateway is not set up correctly.",
      detail: `Provider rejected the gateway API key (${status}): ${message}`,
      retryable: false,
      fallbackable: true,
    })
  }
  if (status === 429) {
    return new ProviderError({
      status: 429,
      code: "provider_rate_limited",
      message: "The provider is rate limiting this gateway. Please try again shortly.",
      detail: `Provider rate limit (429): ${message}`,
      retryable: true,
      fallbackable: true,
    })
  }
  if (status >= 500) {
    return new ProviderError({
      status: 502,
      code: "provider_error",
      message: `The provider failed: ${message}`,
      detail: `Provider server error (${status}): ${message}`,
      retryable: true,
      fallbackable: true,
    })
  }
  return new ProviderError({
    status,
    code: "request_rejected",
    message,
    detail: `Provider rejected the request (${status}): ${message}`,
    retryable: false,
    fallbackable: false,
  })
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

function extractMessage(body: string): string {
  const parsed = parseJson(body)
  if (typeof parsed?.error?.message === "string") return parsed.error.message
  return body.slice(0, 200) || "no details given"
}
