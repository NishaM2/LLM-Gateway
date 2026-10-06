import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"
import { EMBEDDING_DIMENSIONS } from "../schema.ts"

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2"

let loading: Promise<FeatureExtractionPipeline> | null = null

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await loadModel()
  const output = await extractor(normalizeText(text), { pooling: "mean", normalize: true })
  const vector = Array.from(output.data as Float32Array)

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`${EMBEDDING_MODEL} produced ${vector.length} numbers, but the database expects ${EMBEDDING_DIMENSIONS}`)
  }
  return vector
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Cannot compare vectors of length ${a.length} and ${b.length}`)

  let dot = 0
  let lengthA = 0
  let lengthB = 0
  for (const [i, value] of a.entries()) {
    const other = b[i] ?? 0
    dot += value * other
    lengthA += value * value
    lengthB += other * other
  }

  if (lengthA === 0 || lengthB === 0) return 0
  return dot / Math.sqrt(lengthA * lengthB)
}

function loadModel(): Promise<FeatureExtractionPipeline> {
  loading ??= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" }).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}
