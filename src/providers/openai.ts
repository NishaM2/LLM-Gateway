const START_TIMEOUT_MS = 30_000

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

export type Usage = {
  inputTokens: number | null
  outputTokens: number | null
}

export async function createChatCompletion(options: {
  baseUrl: string
  apiKey: string
  body: unknown
}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), START_TIMEOUT_MS)

  try {
    return await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
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

export function readUsage(payload: any): Usage | null {
  const usage = payload?.usage
  if (!usage) return null

  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null
  const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null
  if (inputTokens === null && outputTokens === null) return null

  return { inputTokens, outputTokens }
}

export function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractMessage(body: string): string {
  const parsed = parseJson(body)
  if (typeof parsed?.error?.message === "string") return parsed.error.message
  return body.slice(0, 200) || "no details given"
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