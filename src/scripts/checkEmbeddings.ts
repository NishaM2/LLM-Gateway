import { cosineSimilarity, embed, EMBEDDING_MODEL } from "../services/embeddings.ts"

const sentences = {
  A: "How do I reset my password?",
  B: "What are the steps to change my password?",
  C: "What is the capital of France?",
}

console.log(`Loading ${EMBEDDING_MODEL} (the first run downloads it, about 23 MB)`)
const started = Date.now()
await embed("warm up")
console.log(`Ready in ${Date.now() - started}ms\n`)

for (const [label, text] of Object.entries(sentences)) {
  console.log(`  ${label}  ${text}`)
}

const vectors = {
  A: await embed(sentences.A),
  B: await embed(sentences.B),
  C: await embed(sentences.C),
}

console.log(`\nEach sentence became ${vectors.A.length} numbers. The first five of A: ${vectors.A.slice(0, 5).map((n) => n.toFixed(3)).join(", ")}\n`)

console.log("Similarity (1 = same meaning, 0 = unrelated)")
console.log(`  A vs B  ${cosineSimilarity(vectors.A, vectors.B).toFixed(3)}  same meaning, different words`)
console.log(`  A vs C  ${cosineSimilarity(vectors.A, vectors.C).toFixed(3)}  unrelated`)
console.log(`  B vs C  ${cosineSimilarity(vectors.B, vectors.C).toFixed(3)}  unrelated`)

const timed = Date.now()
for (let i = 0; i < 20; i++) await embed(sentences.A)
console.log(`\nOne embedding takes about ${Math.round((Date.now() - timed) / 20)}ms once the model is loaded`)
