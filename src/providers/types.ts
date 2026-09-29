import type { ProviderName } from "../models.ts"

export type Usage = {
  inputTokens: number | null
  outputTokens: number | null
}

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

export type ProviderCall = {
  model: string
  body: Record<string, unknown>
  stream: boolean
  signal?: AbortSignal
}

export type ProviderReply = {
  bodyText: string | null
  stream: ReadableStream<Uint8Array> | null
}

export type ProviderAdapter = {
  name: ProviderName
  send(call: ProviderCall): Promise<ProviderReply>
}
