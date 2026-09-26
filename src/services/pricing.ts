import { and, desc, eq, lte } from "drizzle-orm"
import type { Db } from "../db.ts"
import { modelPrices } from "../schema.ts"

export async function priceRequest(
  db: Db,
  input: {
    provider: string | null
    model: string | null
    inputTokens: number | null
    outputTokens: number | null
    at: Date
  },
): Promise<number | null> {
  if (!input.provider || !input.model) return null
  if (input.inputTokens === null && input.outputTokens === null) return null

  const [price] = await db
    .select()
    .from(modelPrices)
    .where(
      and(
        eq(modelPrices.provider, input.provider),
        eq(modelPrices.model, input.model),
        lte(modelPrices.effectiveFrom, input.at),
      ),
    )
    .orderBy(desc(modelPrices.effectiveFrom))
    .limit(1)

  if (!price) {
    console.warn(`No price on file for ${input.provider} ${input.model}, so cost was not recorded`)
    return null
  }

  const inputMicros = Math.round(((input.inputTokens ?? 0) * price.inputMicrosPerMillion) / 1_000_000)
  const outputMicros = Math.round(((input.outputTokens ?? 0) * price.outputMicrosPerMillion) / 1_000_000)

  return inputMicros + outputMicros
}
