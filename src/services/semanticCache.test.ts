import assert from "node:assert/strict"
import { test } from "node:test"
import { finalQuestion, isSemanticHit, SIMILARITY_THRESHOLD, type SemanticSearch } from "./semanticCache.ts"

test("the last user message is the question", () => {
  const body = {
    messages: [
      { role: "system", content: "You are brief." },
      { role: "user", content: "  How do I reset my password?  " },
    ],
  }
  assert.equal(finalQuestion(body), "How do I reset my password?")
})

test("text parts are joined into one question", () => {
  const body = { messages: [{ role: "user", content: [{ type: "text", text: "Hello" }, { type: "text", text: "there" }] }] }
  assert.equal(finalQuestion(body), "Hello\nthere")
})

test("there is no question when the last message is not from the user", () => {
  const body = { messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }] }
  assert.equal(finalQuestion(body), null)
})

test("a message with an image is never matched by meaning", () => {
  const body = {
    messages: [{ role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "x" } }] }],
  }
  assert.equal(finalQuestion(body), null)
})

test("an empty question is no question", () => {
  assert.equal(finalQuestion({ messages: [{ role: "user", content: "   " }] }), null)
})

test("a hit needs a similarity at or above the threshold", () => {
  const search = (similarity: number): SemanticSearch => ({
    namespace: "n",
    question: "q",
    embedding: [],
    closest: { id: "1", prompt: "p", similarity, answer: {} as never },
  })
  assert.equal(isSemanticHit(search(SIMILARITY_THRESHOLD)), true)
  assert.equal(isSemanticHit(search(SIMILARITY_THRESHOLD - 0.01)), false)
  assert.equal(isSemanticHit({ namespace: "n", question: "q", embedding: [], closest: null }), false)
  assert.equal(isSemanticHit(null), false)
})
