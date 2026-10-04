import assert from "node:assert/strict"
import { test } from "node:test"
import { cachePolicy } from "./cachePolicy.ts"

const body = { model: "fast", messages: [{ role: "user", content: "Hello" }] }

function decide(extra: Record<string, unknown> = {}, cacheControl?: string) {
  return cachePolicy({ body: { ...body, ...extra }, cacheControl })
}

test("a plain request is cacheable", () => {
  assert.equal(decide().cacheable, true)
})

test("a low temperature is cacheable", () => {
  assert.equal(decide({ temperature: 0 }).cacheable, true)
  assert.equal(decide({ temperature: 0.2 }).cacheable, true)
})

test("a high temperature is not cacheable", () => {
  assert.equal(decide({ temperature: 0.21 }).cacheable, false)
  assert.equal(decide({ temperature: 1 }).cacheable, false)
})

test("a missing temperature is cacheable", () => {
  assert.equal(decide().cacheable, true)
})

test("tool definitions make a request uncacheable", () => {
  assert.equal(decide({ tools: [{ type: "function" }] }).cacheable, false)
  assert.equal(decide({ functions: [{ name: "x" }] }).cacheable, false)
})

test("an empty tools list is still cacheable", () => {
  assert.equal(decide({ tools: [] }).cacheable, true)
  assert.equal(decide({ functions: [] }).cacheable, true)
})

test("tool_choice without tool definitions is cacheable", () => {
  assert.equal(decide({ tool_choice: "auto" }).cacheable, true)
})

test("no-cache and no-store are both honoured", () => {
  assert.equal(decide({}, "no-cache").cacheable, false)
  assert.equal(decide({}, "no-store").cacheable, false)
  assert.equal(decide({}, "No-Cache").cacheable, false)
  assert.equal(decide({}, "max-age=0, no-cache").cacheable, false)
})

test("an unrelated cache-control value does not block caching", () => {
  assert.equal(decide({}, "max-age=60").cacheable, true)
})

test("a refusal explains itself", () => {
  const decision = decide({ temperature: 0.9 })
  assert.equal(decision.cacheable, false)
  if (!decision.cacheable) assert.match(decision.reason, /temperature/)
})
