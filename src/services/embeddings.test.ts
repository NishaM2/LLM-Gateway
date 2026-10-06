import assert from "node:assert/strict"
import { test } from "node:test"
import { cosineSimilarity, normalizeText } from "./embeddings.ts"

test("text is trimmed, spaces collapsed and lowercased", () => {
  assert.equal(normalizeText("  How do I   Reset\n my PASSWORD?  "), "how do i reset my password?")
})

test("identical vectors score 1", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1)
})

test("vectors at right angles score 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
})

test("length does not matter, only direction", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 1], [5, 5]) - 1) < 1e-9)
})

test("vectors of different lengths are refused", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]))
})
