export type ProviderName = "groq" | "gemini"

export type ModelTarget = {
  provider: ProviderName
  model: string
}

const DEFAULT_PROVIDER: ProviderName = "groq"

const logicalModels: Record<string, ModelTarget> = {
  fast: { provider: "groq", model: "openai/gpt-oss-20b" },
  smart: { provider: "groq", model: "openai/gpt-oss-120b" },
  balanced: { provider: "gemini", model: "gemini-3.6-flash" },
}

const realModels: Record<string, ProviderName> = {
  "openai/gpt-oss-20b": "groq",
  "openai/gpt-oss-120b": "groq",
  "gemini-3.6-flash": "gemini",
}

export function resolveModel(requested: string): ModelTarget {
  const logical = logicalModels[requested]
  if (logical) return logical

  return { provider: providerFor(requested), model: requested }
}

function providerFor(model: string): ProviderName {
  const known = realModels[model]
  if (known) return known
  if (model.startsWith("gemini-")) return "gemini"
  return DEFAULT_PROVIDER
}

export function isLogicalName(requested: string): boolean {
  return requested in logicalModels
}

export function logicalModelNames(): string[] {
  return Object.keys(logicalModels)
}
