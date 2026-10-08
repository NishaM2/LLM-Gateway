import { and, cosineDistance, eq, gt, sql } from "drizzle-orm"
import type { Db } from "../db.ts"
import { cacheEntries } from "../schema.ts"
import { embed } from "./embeddings.ts"
import type { CachedAnswer } from "./exactCache.ts"
import { namespaceFor } from "./namespace.ts"

export const SIMILARITY_THRESHOLD = 0.9
export const SEMANTIC_TTL_SECONDS = 3_600

export type SemanticMatch = {
  id: string
  prompt: string
  similarity: number
  answer: CachedAnswer
}

export type SemanticSearch = {
  namespace: string
  question: string
  embedding: number[]
  closest: SemanticMatch | null
}

export async function searchSemantic(db: Db, tenantId: string, body: Record<string, unknown>): Promise<SemanticSearch | null> {
  const question = finalQuestion(body)
  if (question === null) return null

  try {
    const namespace = namespaceFor(tenantId, body)
    const embedding = await embed(question)
    const closest = await findClosest(db, namespace, embedding)
    return { namespace, question, embedding, closest }
  } catch (error) {
    console.warn(`Semantic cache lookup failed, carrying on without it: ${describe(error)}`)
    return null
  }
}

export function isSemanticHit(search: SemanticSearch | null): search is SemanticSearch & { closest: SemanticMatch } {
  return search?.closest != null && search.closest.similarity >= SIMILARITY_THRESHOLD
}

export async function findClosest(db: Db, namespace: string, embedding: number[]): Promise<SemanticMatch | null> {
  const distance = cosineDistance(cacheEntries.embedding, embedding)

  const [row] = await db
    .select({ id: cacheEntries.id, prompt: cacheEntries.prompt, response: cacheEntries.response, distance })
    .from(cacheEntries)
    .where(and(eq(cacheEntries.namespace, namespace), gt(cacheEntries.expiresAt, sql`now()`)))
    .orderBy(distance)
    .limit(1)

  if (!row) return null
  return {
    id: row.id,
    prompt: row.prompt,
    similarity: 1 - Number(row.distance),
    answer: row.response as CachedAnswer,
  }
}

export async function rememberAnswer(db: Db, search: SemanticSearch, answer: CachedAnswer): Promise<void> {
  try {
    await db.insert(cacheEntries).values({
      namespace: search.namespace,
      prompt: search.question,
      embedding: search.embedding,
      response: answer,
      model: answer.model,
      expiresAt: new Date(Date.now() + SEMANTIC_TTL_SECONDS * 1000),
    })
  } catch (error) {
    console.warn(`Could not save to the semantic cache: ${describe(error)}`)
  }
}

export function finalQuestion(body: Record<string, unknown>): string | null {
  const messages: any[] = Array.isArray(body.messages) ? body.messages : []
  const last = messages.at(-1)
  if (last?.role !== "user") return null

  const content = last.content
  if (typeof content === "string") return content.trim() || null
  if (!Array.isArray(content)) return null

  const parts = content.filter((part: any) => part?.type === "text" && typeof part.text === "string")
  if (parts.length !== content.length) return null
  return parts.map((part: any) => part.text).join("\n").trim() || null
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
