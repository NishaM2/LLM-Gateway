import type { Config } from "../config.ts"
import type { ProviderName } from "../models.ts"
import { createGeminiProvider } from "./gemini.ts"
import { createMockProvider } from "./mock.ts"
import { createOpenAiProvider } from "./openai.ts"
import type { ProviderAdapter } from "./types.ts"

export type Providers = Record<ProviderName, ProviderAdapter>

export function createProviders(config: Config): Providers {
  return {
    groq: createOpenAiProvider({ name: "groq", baseUrl: config.groqBaseUrl, apiKey: config.groqApiKey }),
    gemini: createGeminiProvider({ apiKey: config.geminiApiKey }),
    mock: createMockProvider(),
  }
}
