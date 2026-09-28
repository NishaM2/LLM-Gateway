import { randomUUID } from "node:crypto"
import { describeProviderFailure, fetchWithTimeout, parseJson, streamFrom, toNumber } from "./shared.ts"
import type { ProviderAdapter, ProviderCall, ProviderReply, Usage } from "./types.ts"

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

export function createGeminiProvider(options: { apiKey: string }): ProviderAdapter {
  return {
    name: "gemini",

    async send(call: ProviderCall): Promise<ProviderReply> {
      const method = call.stream ? "streamGenerateContent?alt=sse" : "generateContent"

      const response = await fetchWithTimeout(`${BASE_URL}/${call.model}:${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify(toGeminiBody(call.body)),
      })

      if (!response.ok) {
        throw describeProviderFailure(response.status, await response.text())
      }

      if (call.stream && response.body) {
        return { bodyText: null, stream: streamFrom(translateStream(call.model, response.body)) }
      }

      return { bodyText: toOpenAiCompletion(call.model, parseJson(await response.text())), stream: null }
    },
  }
}

export function toGeminiBody(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : []

  const systemParts: Array<{ text: string }> = []
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  for (const message of messages) {
    const text = readContent(message.content)
    if (text === "") continue

    if (message.role === "system" || message.role === "developer") {
      systemParts.push({ text })
      continue
    }

    const role = message.role === "assistant" ? "model" : "user"
    const previous = contents.at(-1)
    if (previous && previous.role === role) previous.parts.push({ text })
    else contents.push({ role, parts: [{ text }] })
  }

  const generationConfig: Record<string, unknown> = {}
  const maxTokens = toNumber(body.max_completion_tokens) ?? toNumber(body.max_tokens)
  if (maxTokens !== null) generationConfig.maxOutputTokens = maxTokens
  const temperature = toNumber(body.temperature)
  if (temperature !== null) generationConfig.temperature = temperature
  const topP = toNumber(body.top_p)
  if (topP !== null) generationConfig.topP = topP
  if (typeof body.stop === "string") generationConfig.stopSequences = [body.stop]
  if (Array.isArray(body.stop)) generationConfig.stopSequences = body.stop

  const result: Record<string, unknown> = { contents }
  if (systemParts.length > 0) result.systemInstruction = { parts: systemParts }
  if (Object.keys(generationConfig).length > 0) result.generationConfig = generationConfig

  return result
}

export function readGeminiUsage(payload: any): Usage | null {
  const meta = payload?.usageMetadata
  if (!meta) return null

  const inputTokens = toNumber(meta.promptTokenCount)
  const answerTokens = toNumber(meta.candidatesTokenCount)
  const thinkingTokens = toNumber(meta.thoughtsTokenCount)

  if (inputTokens === null && answerTokens === null && thinkingTokens === null) return null

  const outputTokens = answerTokens === null && thinkingTokens === null ? null : (answerTokens ?? 0) + (thinkingTokens ?? 0)

  return { inputTokens, outputTokens }
}

export function toFinishReason(reason: unknown): string | null {
  if (reason === "STOP") return "stop"
  if (reason === "MAX_TOKENS") return "length"
  if (reason === "SAFETY" || reason === "RECITATION" || reason === "PROHIBITED_CONTENT" || reason === "BLOCKLIST" || reason === "SPII") {
    return "content_filter"
  }
  return null
}

function toOpenAiCompletion(model: string, payload: any): string {
  const candidate = payload?.candidates?.[0]
  const usage = readGeminiUsage(payload)

  return JSON.stringify({
    id: `chatcmpl-${payload?.responseId ?? randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: payload?.modelVersion ?? model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: readParts(candidate?.content?.parts) },
        logprobs: null,
        finish_reason: toFinishReason(candidate?.finishReason) ?? "stop",
      },
    ],
    usage: toOpenAiUsage(usage),
  })
}

async function* translateStream(model: string, body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array, void, void> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = body.getReader()

  const id = `chatcmpl-${randomUUID()}`
  const created = Math.floor(Date.now() / 1000)

  let servedModel = model
  let buffer = ""
  let sentRole = false
  let usage: Usage | null = null
  let finishReason: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ""

      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue

          const payload = parseJson(line.slice(5).trim())
          if (!payload) continue

          if (typeof payload.modelVersion === "string") servedModel = payload.modelVersion

          const chunkUsage = readGeminiUsage(payload)
          if (chunkUsage) usage = chunkUsage

          const candidate = payload.candidates?.[0]
          const reason = toFinishReason(candidate?.finishReason)
          if (reason) finishReason = reason

          const text = readParts(candidate?.content?.parts)
          if (text === "") continue

          const delta = sentRole ? { content: text } : { role: "assistant", content: text }
          sentRole = true

          yield encoder.encode(
            sseLine({
              id,
              object: "chat.completion.chunk",
              created,
              model: servedModel,
              choices: [{ index: 0, delta, finish_reason: null }],
            }),
          )
        }
      }
    }

    yield encoder.encode(
      sseLine({
        id,
        object: "chat.completion.chunk",
        created,
        model: servedModel,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason ?? "stop" }],
      }),
    )

    if (usage) {
      yield encoder.encode(
        sseLine({
          id,
          object: "chat.completion.chunk",
          created,
          model: servedModel,
          choices: [],
          usage: toOpenAiUsage(usage),
        }),
      )
    }

    yield encoder.encode("data: [DONE]\n\n")
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function toOpenAiUsage(usage: Usage | null) {
  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0

  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  }
}

function readParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  return parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
}

function readContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}
