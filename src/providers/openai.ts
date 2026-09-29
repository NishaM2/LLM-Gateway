import type { ProviderName } from "../models.ts"
import { describeProviderFailure, fetchWithTimeout, toNumber } from "./shared.ts"
import type { ProviderAdapter, ProviderCall, ProviderReply, Usage } from "./types.ts"

export function createOpenAiProvider(options: {
  name: ProviderName
  baseUrl: string
  apiKey: string
}): ProviderAdapter {
  return {
    name: options.name,

    async send(call: ProviderCall): Promise<ProviderReply> {
      const body = {
        ...call.body,
        model: call.model,
        stream: call.stream,
        ...(call.stream ? { stream_options: { include_usage: true } } : {}),
      }

      const response = await fetchWithTimeout(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
      }, call.signal)

      if (!response.ok) {
        throw describeProviderFailure(response.status, await response.text())
      }

      if (call.stream && response.body) {
        return { bodyText: null, stream: response.body }
      }

      return { bodyText: await response.text(), stream: null }
    },
  }
}

export function readUsage(payload: any): Usage | null {
  const usage = payload?.usage
  if (!usage) return null

  const inputTokens = toNumber(usage.prompt_tokens)
  const outputTokens = toNumber(usage.completion_tokens)
  if (inputTokens === null && outputTokens === null) return null

  return { inputTokens, outputTokens }
}
