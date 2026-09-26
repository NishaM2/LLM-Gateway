// How long to wait for the provider to START answering. A long answer is fine;
// this clock only covers getting the first response, and stops once it arrives.
const START_TIMEOUT_MS = 30_000;

// One error type for everything that can go wrong with a provider.
export class ProviderError extends Error {
  // status: what the caller should be told. code: the short reason stored in the log.
  // detail: what the log line should say. retryable: whether trying again could help.
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// Talks to any service that speaks OpenAI's chat format. Groq is one of them.
// Hands back the provider's reply as it is, so the caller can either read it all at once
// or pass it on piece by piece while it is still arriving.
export async function createChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  body: unknown;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), START_TIMEOUT_MS);

  try {
    return await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The gateway's own key. Whatever key the caller sent is never passed on.
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderError(504, "provider_timeout", "The provider took too long to answer.", `Provider did not start answering within ${START_TIMEOUT_MS}ms`, true);
    }
    throw new ProviderError(502, "provider_unreachable", "The provider could not be reached.", `Could not reach the provider: ${describeCause(error)}`, true);
  } finally {
    // Stop the clock as soon as the answer starts. Streaming may then take as long as it likes.
    clearTimeout(timer);
  }
}

// Decides what a failed provider answer should mean for the caller.
export function describeProviderFailure(status: number, body: string): ProviderError {
  const message = extractMessage(body);

  // The provider rejected OUR key. The caller can do nothing about it, so never blame them.
  if (status === 401 || status === 403) {
    return new ProviderError(500, "gateway_misconfigured", "The gateway is not set up correctly.", `Provider rejected the gateway's API key (${status}): ${message}`, false);
  }
  if (status === 429) {
    return new ProviderError(429, "provider_rate_limited", "The provider is rate limiting this gateway. Please try again shortly.", `Provider rate limit (429): ${message}`, true);
  }
  if (status >= 500) {
    return new ProviderError(502, "provider_error", `The provider failed: ${message}`, `Provider server error (${status}): ${message}`, true);
  }
  // Anything else in the 400s is about the request itself, so pass the provider's own words on.
  return new ProviderError(status, "request_rejected", message, `Provider rejected the request (${status}): ${message}`, false);
}

// Providers report errors as {"error":{"message":"..."}}. Fall back to the raw text.
function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error?.message === "string") return parsed.error.message;
  } catch {
    // Not JSON. The raw text is the best we have.
  }
  return body.slice(0, 200) || "no details given";
}

// A failed fetch says only "fetch failed"; the real reason is hidden inside it.
export function describeCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof AggregateError) {
    return cause.errors.map((inner) => (inner instanceof Error ? inner.message : String(inner))).join("; ");
  }
  if (cause instanceof Error) return cause.message;
  return error.message;
}