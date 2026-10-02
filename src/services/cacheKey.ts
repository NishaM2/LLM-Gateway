import { createHash } from "node:crypto"

// Fields that cannot change the answer, so two requests differing only in these
// are the same request as far as the cache is concerned.
const IGNORED_FIELDS = new Set(["stream", "stream_options", "user"])

export function cacheKey(body: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex")
}

export function canonicalJson(body: Record<string, unknown>): string {
  return JSON.stringify(canonicalise(withoutIgnoredFields(body)))
}

function withoutIgnoredFields(body: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}

  for (const [field, value] of Object.entries(body)) {
    if (IGNORED_FIELDS.has(field)) continue
    kept[field] = field === "messages" ? trimMessages(value) : value
  }

  return kept
}

function trimMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages

  return messages.map((message) => {
    if (message === null || typeof message !== "object") return message

    const copy = { ...(message as Record<string, unknown>) }
    if ("content" in copy) copy.content = trimContent(copy.content)
    return copy
  })
}

function trimContent(content: unknown): unknown {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return content

  return content.map((part) => {
    if (part === null || typeof part !== "object") return part

    const copy = { ...(part as Record<string, unknown>) }
    if (typeof copy.text === "string") copy.text = copy.text.trim()
    return copy
  })
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise)
  if (value === null || typeof value !== "object") return value

  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}

  for (const field of Object.keys(source).sort()) {
    if (source[field] === undefined) continue
    sorted[field] = canonicalise(source[field])
  }

  return sorted
}
