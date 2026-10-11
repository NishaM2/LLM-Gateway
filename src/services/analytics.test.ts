import assert from "node:assert/strict"
import { test } from "node:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { decodeCursor, encodeCursor, ratesFor, requestConditions } from "./analytics.ts"

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

test("no filters and no cursor means no WHERE clause", () => {
  assert.equal(toQuery(requestConditions({}, null)).sql.trim(), "")
})

test("filters become parameters joined with AND, never pasted into the SQL", () => {
  const tenantId = "0f8c7a52-3c5e-4f7b-9d1a-2b6e8c4d5f60"
  const query = toQuery(requestConditions({ tenantId, cacheStatus: "semantic_hit", status: "error" }, null))
  assert.match(query.sql, /^where r\.tenant_id = \$1::uuid and r\.cache_status = \$2::cache_status and r\.status = \$3::request_status$/i)
  assert.deepEqual(query.params, [tenantId, "semantic_hit", "error"])
})

test("the cursor comes first so paging and filters combine", () => {
  const query = toQuery(requestConditions({ status: "error" }, { createdAt: "2026-10-13 09:15:42.123456+00", id: "0f8c7a52-3c5e-4f7b-9d1a-2b6e8c4d5f60" }))
  assert.match(query.sql, /^where \(r\.created_at, r\.id\) < \(\$1::timestamptz, \$2::uuid\) and r\.status = \$3::request_status$/i)
})

function toQuery(fragment: SQL) {
  return new PgDialect().sqlToQuery(fragment)
}
