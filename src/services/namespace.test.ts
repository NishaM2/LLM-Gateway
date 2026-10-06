import assert from "node:assert/strict"
import { test } from "node:test"
import { namespaceFor, temperatureBucket } from "./namespace.ts"

const TENANT_A = "11111111-1111-1111-1111-111111111111"
const TENANT_B = "22222222-2222-2222-2222-222222222222"

function request(changes: Record<string, unknown> = {}, system = "You are a helpful assistant.", question = "How do I reset my password?") {
  return {
    model: "fast",
    messages: [
      { role: "system", content: system },
      { role: "user", content: question },
    ],
    temperature: 0,
    ...changes,
  }
}

const base = namespaceFor(TENANT_A, request())

test("an identical setup produces the same namespace", () => {
  assert.equal(namespaceFor(TENANT_A, request()), base)
})

test("the question itself is not part of the namespace", () => {
  assert.equal(namespaceFor(TENANT_A, request({}, undefined, "What are the steps to change my password?")), base)
})

test("a different system prompt changes the namespace", () => {
  assert.notEqual(namespaceFor(TENANT_A, request({}, "You are a pirate. Answer like one.")), base)
})

test("a different model changes the namespace", () => {
  assert.notEqual(namespaceFor(TENANT_A, request({ model: "smart" })), base)
})

test("a different tenant changes the namespace", () => {
  assert.notEqual(namespaceFor(TENANT_B, request()), base)
})

test("different tool definitions change the namespace", () => {
  const weather = [{ type: "function", function: { name: "get_weather", parameters: {} } }]
  const stocks = [{ type: "function", function: { name: "get_stock_price", parameters: {} } }]
  assert.notEqual(namespaceFor(TENANT_A, request({ tools: weather })), base)
  assert.notEqual(namespaceFor(TENANT_A, request({ tools: weather })), namespaceFor(TENANT_A, request({ tools: stocks })))
})

test("an empty tools list is the same as no tools", () => {
  assert.equal(namespaceFor(TENANT_A, request({ tools: [] })), base)
})

test("temperatures in the same bucket share a namespace, other buckets do not", () => {
  assert.equal(namespaceFor(TENANT_A, request({ temperature: 0.1 })), namespaceFor(TENANT_A, request({ temperature: 0.2 })))
  assert.notEqual(namespaceFor(TENANT_A, request({ temperature: 0.1 })), base)
  assert.notEqual(namespaceFor(TENANT_A, request({ temperature: undefined })), base)
})

test("earlier turns of the conversation change the namespace", () => {
  const followUp = (topic: string) => ({
    model: "fast",
    temperature: 0,
    messages: [
      { role: "user", content: `Tell me about ${topic}.` },
      { role: "assistant", content: `Here is something about ${topic}.` },
      { role: "user", content: "Tell me more." },
    ],
  })
  assert.notEqual(namespaceFor(TENANT_A, followUp("cats")), namespaceFor(TENANT_A, followUp("taxes")))
})

test("other settings such as max_tokens change the namespace", () => {
  assert.notEqual(namespaceFor(TENANT_A, request({ max_tokens: 20 })), base)
})

test("streaming or not does not change the namespace", () => {
  assert.equal(namespaceFor(TENANT_A, request({ stream: true })), base)
})

test("spacing around the system prompt does not change the namespace", () => {
  assert.equal(namespaceFor(TENANT_A, request({}, "  You are a helpful assistant.\n")), base)
})

test("temperature buckets", () => {
  assert.equal(temperatureBucket(undefined), "default")
  assert.equal(temperatureBucket(0), "zero")
  assert.equal(temperatureBucket(0.15), "low")
  assert.equal(temperatureBucket(0.9), "high")
})
