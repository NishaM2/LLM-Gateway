import type { ProviderName } from "../models.ts"

export type Usage = {
  inputTokens: number | null
  outputTokens: number | null
}

export type ProviderFault = {
  status: number
  code: string
  message: string
  detail: string
  retryable: boolean
  fallbackable: boolean
}

export class ProviderError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly retryable: boolean
  readonly fallbackable: boolean

  constructor(fault: ProviderFault) {
    super(fault.message)
    this.name = "ProviderError"
    this.status = fault.status
    this.code = fault.code
    this.detail = fault.detail
    this.retryable = fault.retryable
    this.fallbackable = fault.fallbackable
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
