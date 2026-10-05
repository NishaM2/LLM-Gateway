import { randomUUID } from "node:crypto"
import { setTimeout as wait } from "node:timers/promises"
import { describeProviderFailure, streamFrom } from "./shared.ts"
import { ProviderError, type ProviderAdapter, type ProviderCall, type ProviderReply } from "./types.ts"

export const SLOW_START_MS = 3_000
export const WORD_GAP_MS = 30

export function createMockProvider(): ProviderAdapter {
  return {
    name: "mock",

    async send(call: ProviderCall): Promise<ProviderReply> {
      if (call.model === "mock-429") throw describeProviderFailure(429, "Mock rate limit")
      if (call.model === "mock-500") throw describeProviderFailure(500, "Mock server error")
      if (call.model === "mock-slow") await pause(SLOW_START_MS, call.signal)

      const question = lastUserMessage(call.body)
      const answer = `Mock answer to: ${question}`
      const usage = {
        prompt_tokens: estimateTokens(question),
        completion_tokens: estimateTokens(answer),
        total_tokens: estimateTokens(question) + estimateTokens(answer),
      }
      const id = `mock-${randomUUID()}`
      const created = Math.floor(Date.now() / 1000)

      if (!call.stream) {
        const body = {
          id,
          object: "chat.completion",
          created,
          model: call.model,
          choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
          usage,
        }
        return { bodyText: JSON.stringify(body), stream: null }
      }

      const dies = call.model === "mock-dies"
      const source = streamAnswer({ id, created, model: call.model, answer, usage, dies })
      return { bodyText: null, stream: streamFrom(source, async () => void (await source.return())) }
    },
  }
}

async function* streamAnswer(input: {
  id: string
  created: number
  model: string
  answer: string
  usage: Record<string, number>
  dies: boolean
}): AsyncGenerator<Uint8Array, void, void> {
  const encoder = new TextEncoder()
  const words = input.answer.split(/(?<= )/)

  function event(fields: Record<string, unknown>): Uint8Array {
    const chunk = { id: input.id, object: "chat.completion.chunk", created: input.created, model: input.model, ...fields }
    return encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
  }

  for (const [position, word] of words.entries()) {
    if (input.dies && position === Math.floor(words.length / 2)) {
      throw new Error("Mock stream died halfway")
    }
    yield event({ choices: [{ index: 0, delta: { content: word }, finish_reason: null }] })
    await wait(WORD_GAP_MS)
  }

  yield event({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })
  yield event({ choices: [], usage: input.usage })
  yield encoder.encode("data: [DONE]\n\n")
}

async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  try {
    await wait(ms, undefined, { signal })
  } catch {
    throw new ProviderError({
      status: 499,
      code: "caller_hung_up",
      message: "The caller went away.",
      detail: "The caller disconnected while the mock provider was pausing",
      retryable: false,
      fallbackable: false,
    })
  }
}

function lastUserMessage(body: Record<string, unknown>): string {
  const messages: any[] = Array.isArray(body.messages) ? body.messages : []
  const last = messages.findLast((message) => message?.role === "user")
  return typeof last?.content === "string" ? last.content : "your message"
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
