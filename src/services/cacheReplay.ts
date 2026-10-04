import type { Response } from "express"
import { randomUUID } from "node:crypto"
import type { CachedAnswer } from "./exactCache.ts"

// A real token stream arrives in pieces of roughly four or five characters, so small
// pieces with a short gap are what reads as natural.
export const REPLAY_PIECE_SIZE = 8
export const REPLAY_DELAY_MS = 12

// However long the answer, the replay should not take longer than this. Otherwise a
// cached essay would be slower than fetching it again, which defeats the point.
export const MAX_REPLAY_MS = 1_500

// Splits by code point rather than by string index, so an emoji is never cut in half.
export function replayPieces(text: string, size: number = REPLAY_PIECE_SIZE): string[] {
  const characters = Array.from(text)
  const pieces: string[] = []

  for (let at = 0; at < characters.length; at += size) {
    pieces.push(characters.slice(at, at + size).join(""))
  }

  return pieces
}

export function completionFrom(answer: CachedAnswer): string {
  return JSON.stringify({
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: answer.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: answer.text },
        logprobs: null,
        finish_reason: answer.finishReason,
      },
    ],
    usage: usageOf(answer),
  })
}

export async function replayAsStream(res: Response, answer: CachedAnswer, signal: AbortSignal): Promise<void> {
  const id = `chatcmpl-${randomUUID()}`
  const created = Math.floor(Date.now() / 1000)

  const pieces = replayPieces(answer.text)
  const delayMs = replayDelayFor(pieces.length)

  let sentRole = false

  for (const piece of pieces) {
    if (signal.aborted) return

    const delta = sentRole ? { content: piece } : { role: "assistant", content: piece }
    sentRole = true

    res.write(chunk({ id, created, model: answer.model, choices: [{ index: 0, delta, finish_reason: null }] }))
    await pause(delayMs, signal)
  }

  if (signal.aborted) return

  res.write(chunk({ id, created, model: answer.model, choices: [{ index: 0, delta: {}, finish_reason: answer.finishReason }] }))
  res.write(chunk({ id, created, model: answer.model, choices: [], usage: usageOf(answer) }))
  res.write("data: [DONE]\n\n")
  res.end()
}

export function replayDelayFor(pieces: number): number {
  if (pieces === 0) return 0
  return Math.min(REPLAY_DELAY_MS, Math.floor(MAX_REPLAY_MS / pieces))
}

function usageOf(answer: CachedAnswer) {
  const inputTokens = answer.inputTokens ?? 0
  const outputTokens = answer.outputTokens ?? 0

  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  }
}

function chunk(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ object: "chat.completion.chunk", ...payload })}\n\n`
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)

    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }

    signal.addEventListener("abort", done, { once: true })
  })
}
