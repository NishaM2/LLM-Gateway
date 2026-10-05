import assert from "node:assert/strict"
import { test } from "node:test"
import { createMockProvider } from "./mock.ts"
import { ProviderError } from "./types.ts"

const mock = createMockProvider()
const body = { messages: [{ role: "user", content: "Why is the sky blue?" }] }

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  let text = ""
  for await (const chunk of stream) text += new TextDecoder().decode(chunk)
  return text
}

test("mock answers by repeating the question", async () => {
  const reply = await mock.send({ model: "mock", body, stream: false })
  const parsed = JSON.parse(reply.bodyText ?? "")
  assert.equal(parsed.choices[0].message.content, "Mock answer to: Why is the sky blue?")
  assert.ok(parsed.usage.prompt_tokens > 0)
})

test("mock streams the answer and ends with usage and DONE", async () => {
  const reply = await mock.send({ model: "mock", body, stream: true })
  const text = await readAll(reply.stream!)
  assert.match(text, /"usage":/)
  assert.ok(text.endsWith("data: [DONE]\n\n"))
})

test("mock-429 and mock-500 fail like a real provider would", async () => {
  await assert.rejects(mock.send({ model: "mock-429", body, stream: false }), (error: ProviderError) => {
    return error.code === "provider_rate_limited" && error.retryable
  })
  await assert.rejects(mock.send({ model: "mock-500", body, stream: false }), (error: ProviderError) => {
    return error.code === "provider_error" && error.fallbackable
  })
})

test("mock-dies breaks the stream halfway", async () => {
  const reply = await mock.send({ model: "mock-dies", body, stream: true })
  await assert.rejects(readAll(reply.stream!), /died halfway/)
})
