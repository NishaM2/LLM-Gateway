import assert from "node:assert/strict"
import { test } from "node:test"
import { completionFrom, MAX_REPLAY_MS, replayDelayFor, replayPieces, REPLAY_DELAY_MS, REPLAY_PIECE_SIZE } from "./cacheReplay.ts"

test("the pieces join back into the original text", () => {
  const text = "The sea is wide and the sky is wider still, and both are quiet tonight."
  assert.equal(replayPieces(text).join(""), text)
})

test("more than one piece is produced for a normal answer", () => {
  const text = "x".repeat(REPLAY_PIECE_SIZE * 3)
  assert.equal(replayPieces(text).length, 3)
})

test("empty text produces no pieces", () => {
  assert.deepEqual(replayPieces(""), [])
})

test("an emoji is never cut in half", () => {
  const text = "ok ".repeat(10) + "\u{1F600}".repeat(10)
  const pieces = replayPieces(text, 4)
  assert.equal(pieces.join(""), text)
  for (const piece of pieces) {
    assert.equal(piece, Array.from(piece).join(""))
  }
})

test("a cached answer rebuilds into a valid completion", () => {
  const body = completionFrom({
    text: "Red, green, blue.",
    finishReason: "stop",
    bodyText: null,
    provider: "groq",
    model: "openai/gpt-oss-20b",
    inputTokens: 10,
    outputTokens: 5,
  })

  const parsed = JSON.parse(body)
  assert.equal(parsed.object, "chat.completion")
  assert.equal(parsed.model, "openai/gpt-oss-20b")
  assert.equal(parsed.choices[0].message.role, "assistant")
  assert.equal(parsed.choices[0].message.content, "Red, green, blue.")
  assert.equal(parsed.choices[0].finish_reason, "stop")
  assert.deepEqual(parsed.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
})

test("a short answer is paced at the normal delay", () => {
  assert.equal(replayDelayFor(20), REPLAY_DELAY_MS)
})

test("a long answer is paced faster so the whole replay stays bounded", () => {
  const pieces = 1_000
  const delay = replayDelayFor(pieces)
  assert.ok(delay < REPLAY_DELAY_MS)
  assert.ok(delay * pieces <= MAX_REPLAY_MS)
})

test("no pieces means no waiting", () => {
  assert.equal(replayDelayFor(0), 0)
})
