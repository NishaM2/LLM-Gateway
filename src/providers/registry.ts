import type { Config } from "../config.ts"
import type { ProviderName } from "../models.ts"
import { createGeminiProvider } from "./gemini.ts"
import { createOpenAiProvider } from "./openai.ts"
import type { ProviderAdapter } from "./types.ts"

const GROQ_BASE_URL = "https://api.groq.com/openai/v1"

export type Providers = Record<ProviderName, ProviderAdapter>

export function createProviders(config: Config): Providers {
  return {
    groq: createOpenAiProvider({ name: "groq", baseUrl: GROQ_BASE_URL, apiKey: config.groqApiKey }),
    gemini: createGeminiProvider({ apiKey: config.geminiApiKey }),
  }
}
