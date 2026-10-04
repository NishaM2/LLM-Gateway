// Above this, the caller has asked for variety, and handing back a stored answer
// would be the opposite of what they requested.
export const MAX_CACHEABLE_TEMPERATURE = 0.2

export type CacheDecision = { cacheable: true } | { cacheable: false; reason: string }

export function cachePolicy(input: {
  body: Record<string, unknown>
  cacheControl: string | undefined
}): CacheDecision {
  const { body } = input

  if (asksForFreshness(input.cacheControl)) {
    return { cacheable: false, reason: "the caller sent Cache-Control: no-cache" }
  }

  const temperature = body.temperature
  if (typeof temperature === "number" && temperature > MAX_CACHEABLE_TEMPERATURE) {
    return { cacheable: false, reason: `temperature ${temperature} asks for variety` }
  }

  if (canCallTools(body)) {
    return { cacheable: false, reason: "the request can call tools" }
  }

  return { cacheable: true }
}

function asksForFreshness(cacheControl: string | undefined): boolean {
  if (!cacheControl) return false

  const directives = cacheControl.toLowerCase()
  return directives.includes("no-cache") || directives.includes("no-store")
}

// Only the tool definitions matter. tool_choice on its own cannot produce a tool call,
// and an empty list cannot either, so neither blocks caching.
function canCallTools(body: Record<string, unknown>): boolean {
  return ["tools", "functions"].some((field) => {
    const value = body[field]
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0
    return true
  })
}
