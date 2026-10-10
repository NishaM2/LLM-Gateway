import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeCursor, encodeCursor, ratesFor } from "./analytics.ts"

test("hit rate counts exact and semantic hits against every lookup", () => {
  const rates = ratesFor({ exact: 2, semantic: 1, miss: 7, skip: 5 })
  assert.equal(rates.lookups, 10)
  assert.equal(rates.exactRate, 0.2)
  assert.equal(rates.semanticRate, 0.1)
  assert.ok(Math.abs((rates.hitRate ?? 0) - 0.3) < 1e-9)
})

test("skipped requests never count towards the hit rate", () => {
  assert.equal(ratesFor({ exact: 1, semantic: 0, miss: 1, skip: 1000 }).hitRate, 0.5)
})

test("no lookups means no hit rate rather than zero", () => {
  assert.equal(ratesFor({ exact: 0, semantic: 0, miss: 0, skip: 3 }).hitRate, null)
})

test("a cursor survives the round trip with full timestamp precision", () => {
  const createdAt = "2026-10-13 09:15:42.123456+00"
  const id = "0f8c7a52-3c5e-4f7b-9d1a-2b6e8c4d5f60"
  assert.deepEqual(decodeCursor(encodeCursor(createdAt, id)), { createdAt, id })
})

test("a damaged cursor is refused", () => {
  assert.equal(decodeCursor("not-a-cursor"), null)
  assert.equal(decodeCursor(Buffer.from(JSON.stringify(["yesterday", "x"])).toString("base64url")), null)
})
