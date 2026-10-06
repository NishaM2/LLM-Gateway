import { createHash } from "node:crypto"
import { canonicalJson } from "./cacheKey.ts"

const NAMESPACE_VERSION = "ns1"

const SYSTEM_ROLES = new Set(["system", "developer"])
const SHAPED_SEPARATELY = new Set(["model", "messages", "temperature", "tools", "functions"])

export type NamespaceParts = {
  version: string
  tenant: string
  model: string
  system: string
  tools: string
  temperature: string
  history: string
  settings: string
}

export function namespaceFor(tenantId: string, body: Record<string, unknown>): string {
  return sha256(canonicalJson(namespaceParts(tenantId, body)))
}

export function namespaceParts(tenantId: string, body: Record<string, unknown>): NamespaceParts {
  const messages: unknown[] = Array.isArray(body.messages) ? body.messages : []
  const system = messages.filter((message) => SYSTEM_ROLES.has(roleOf(message)))
  const conversation = messages.filter((message) => !SYSTEM_ROLES.has(roleOf(message)))

  const settings: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(body)) {
    if (!SHAPED_SEPARATELY.has(field)) settings[field] = value
  }

  return {
    version: NAMESPACE_VERSION,
    tenant: tenantId,
    model: typeof body.model === "string" ? body.model : "",
    system: hashOf({ messages: system }),
    tools: hashOf({ tools: nonEmpty(body.tools), functions: nonEmpty(body.functions) }),
    temperature: temperatureBucket(body.temperature),
    history: hashOf({ messages: conversation.slice(0, -1) }),
    settings: hashOf(settings),
  }
}

export function temperatureBucket(temperature: unknown): string {
  if (typeof temperature !== "number") return "default"
  if (temperature === 0) return "zero"
  if (temperature <= 0.2) return "low"
  return "high"
}

function roleOf(message: unknown): string {
  const role = (message as { role?: unknown } | null)?.role
  return typeof role === "string" ? role : ""
}

function nonEmpty(value: unknown): unknown {
  return Array.isArray(value) && value.length === 0 ? undefined : value
}

function hashOf(part: Record<string, unknown>): string {
  return sha256(canonicalJson(part)).slice(0, 16)
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
