const START_TIMEOUT_MS = 30_000

export class ProviderError extends Error {
  
    constructor(
        readonly status: number,
        message: string,
        readonly detail: string,
        readonly retryable: boolean,
    ) {
        super(message)
        this.name = "ProviderError"
    }
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
                throw new ProviderError(504, "The provider took too long to answer.", `Provider did not start answering within ${START_TIMEOUT_MS}ms`, true)
        }
            throw new ProviderError(502, "The provider could not be reached.", `Could not reach the provider: ${describeCause(error)}`, true)
    } finally {
        clearTimeout(timer)
    }
}


export function describeProviderFailure(status: number, body: string): ProviderError {
    const message = extractMessage(body)

    if (status === 401 || status === 403) {
        return new ProviderError(500, "The gateway is not set up correctly.", `Provider rejected the gateway's API key (${status}): ${message}`, false)
    }
    if (status === 429) {
        return new ProviderError(429, "The provider is rate limiting this gateway. Please try again shortly.", `Provider rate limit (429): ${message}`, true)
    }
    if (status >= 500) {
        return new ProviderError(502, `The provider failed: ${message}`, `Provider server error (${status}): ${message}`, true)
    }
    return new ProviderError(status, message, `Provider rejected the request (${status}): ${message}`, false)
}

function extractMessage(body: string): string {
    try {
        const parsed = JSON.parse(body)
        if (typeof parsed?.error?.message === "string") return parsed.error.message
    } catch {
    }
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