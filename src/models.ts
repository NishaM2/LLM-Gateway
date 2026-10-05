export type ProviderName = "groq" | "gemini" | "mock"

export type ModelTarget = {
  provider: ProviderName
  model: string
}

export type ModelRoute = [ModelTarget, ...ModelTarget[]]

const DEFAULT_PROVIDER: ProviderName = "groq"

const GROQ_SMALL: ModelTarget = { provider: "groq", model: "openai/gpt-oss-20b" }
const GROQ_LARGE: ModelTarget = { provider: "groq", model: "openai/gpt-oss-120b" }
const GEMINI_FLASH: ModelTarget = { provider: "gemini", model: "gemini-3.6-flash" }

const logicalModels: Record<string, ModelRoute> = {
  fast: [GROQ_SMALL, GEMINI_FLASH],
  smart: [GROQ_LARGE, GEMINI_FLASH],
  balanced: [GEMINI_FLASH, GROQ_LARGE],
}

const realModels: Record<string, ProviderName> = {
  "openai/gpt-oss-20b": "groq",
  "openai/gpt-oss-120b": "groq",
  "gemini-3.6-flash": "gemini",
}

export function resolveModel(requested: string): ModelRoute {
  const logical = logicalModels[requested]
  if (logical) return logical

  return [{ provider: providerFor(requested), model: requested }]
}

export function isLogicalName(requested: string): boolean {
  return requested in logicalModels
}

export function logicalModelNames(): string[] {
  return Object.keys(logicalModels)
}

function providerFor(model: string): ProviderName {
  const known = realModels[model]
  if (known) return known
  if (model.startsWith("gemini-")) return "gemini"
  if (model === "mock" || model.startsWith("mock-")) return "mock"
  return DEFAULT_PROVIDER
}
