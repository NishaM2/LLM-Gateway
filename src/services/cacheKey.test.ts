import assert from "node:assert/strict"
import { test } from "node:test"
import { cacheKey } from "./cacheKey.ts"

const base = {
  model: "fast",
  messages: [
    { role: "system", content: "You are brief." },
    { role: "user", content: "Say hello in five words." },
  ],
  temperature: 0.2,
  max_tokens: 200,
}

test("key order does not change the hash", () => {
  const shuffled = {
    max_tokens: 200,
    temperature: 0.2,
    messages: [
      { content: "You are brief.", role: "system" },
      { content: "Say hello in five words.", role: "user" },
    ],
    model: "fast",
  }

  assert.equal(cacheKey(shuffled), cacheKey(base))
})

test("one changed character in the prompt changes the hash", () => {
  const edited = {
    ...base,
    messages: [base.messages[0], { role: "user", content: "Say hello in five wordz." }],
  }

  assert.notEqual(cacheKey(edited), cacheKey(base))
})

test("a different temperature changes the hash", () => {
  assert.notEqual(cacheKey({ ...base, temperature: 0.9 }), cacheKey(base))
})

test("a missing temperature is not the same as any temperature", () => {
  const { temperature, ...withoutTemperature } = base
  assert.notEqual(cacheKey(withoutTemperature), cacheKey(base))
})

test("a different system prompt changes the hash", () => {
  const edited = {
    ...base,
    messages: [{ role: "system", content: "You are long winded." }, base.messages[1]],
  }

  assert.notEqual(cacheKey(edited), cacheKey(base))
})

test("whitespace around message content is ignored", () => {
  const padded = {
    ...base,
    messages: [
      { role: "system", content: "  You are brief.  " },
      { role: "user", content: "\nSay hello in five words.\t" },
    ],
  }

  assert.equal(cacheKey(padded), cacheKey(base))
})

test("streaming shares a cache entry with non streaming", () => {
  assert.equal(cacheKey({ ...base, stream: true, stream_options: { include_usage: true } }), cacheKey(base))
})

test("the end user id does not change the hash", () => {
  assert.equal(cacheKey({ ...base, user: "someone-else" }), cacheKey(base))
})

test("message order changes the hash", () => {
  const swapped = { ...base, messages: [base.messages[1], base.messages[0]] }
  assert.notEqual(cacheKey(swapped), cacheKey(base))
})

test("a field the cache was never told about still changes the hash", () => {
  assert.notEqual(cacheKey({ ...base, max_tokens: 201 }), cacheKey(base))
  assert.notEqual(cacheKey({ ...base, seed: 7 }), cacheKey(base))
  assert.notEqual(cacheKey({ ...base, top_p: 0.5 }), cacheKey(base))
  assert.notEqual(cacheKey({ ...base, response_format: { type: "json_object" } }), cacheKey(base))
})

test("nested key order inside a message does not change the hash", () => {
  const nested = {
    ...base,
    messages: [
      base.messages[0],
      {
        role: "user",
        content: [
          { text: "Say hello in five words.", type: "text" },
          { type: "text", text: "Twice." },
        ],
      },
    ],
  }
  const reordered = {
    ...base,
    messages: [
      base.messages[0],
      {
        content: [
          { type: "text", text: "Say hello in five words." },
          { text: "Twice.", type: "text" },
        ],
        role: "user",
      },
    ],
  }

  assert.equal(cacheKey(nested), cacheKey(reordered))
})

test("a stop sequence made of spaces survives", () => {
  assert.notEqual(cacheKey({ ...base, stop: [" "] }), cacheKey({ ...base, stop: [""] }))
})
