export type ProviderName = "groq"

export type ModelTarget = {
  provider: ProviderName
  model: string
}

const DEFAULT_PROVIDER: ProviderName = "groq"

const logicalModels: Record<string, ModelTarget> = {
  fast: { provider: "groq", model: "openai/gpt-oss-20b" },
  smart: { provider: "groq", model: "openai/gpt-oss-120b" },
}

export function resolveModel(requested: string): ModelTarget {
  return logicalModels[requested] ?? { provider: DEFAULT_PROVIDER, model: requested }
}

export function isLogicalName(requested: string): boolean {
  return requested in logicalModels
}

export function logicalModelNames(): string[] {
  return Object.keys(logicalModels)
}
