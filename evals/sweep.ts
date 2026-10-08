/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs"
import { cosineSimilarity, embed, EMBEDDING_MODEL } from "../src/services/embeddings.ts"
import { SIMILARITY_THRESHOLD } from "../src/services/semanticCache.ts"

type Pair = { id: number; a: string; b: string; label: "same" | "different"; category: string; hard: boolean }
type Scored = Pair & { similarity: number }
type Row = { threshold: number; caught: number; wrong: number; wrongKinds: string }

const { pairs } = JSON.parse(readFileSync(new URL("./pairs.json", import.meta.url), "utf8")) as { pairs: Pair[] }

console.log(`Embedding ${pairs.length} pairs with ${EMBEDDING_MODEL}...`)

const vectors = new Map<string, number[]>()
async function vectorFor(text: string): Promise<number[]> {
  const known = vectors.get(text)
  if (known) return known
  const fresh = await embed(text)
  vectors.set(text, fresh)
  return fresh
}

const scored: Scored[] = []
for (const pair of pairs) {
  const similarity = cosineSimilarity(await vectorFor(pair.a), await vectorFor(pair.b))
  scored.push({ ...pair, similarity })
}

const same = scored.filter((pair) => pair.label === "same")
const different = scored.filter((pair) => pair.label === "different")

const rows: Row[] = []
for (let step = 80; step <= 99; step++) {
  const threshold = step / 100
  const wrongPairs = different.filter((pair) => pair.similarity >= threshold)
  rows.push({
    threshold,
    caught: same.filter((pair) => pair.similarity >= threshold).length,
    wrong: wrongPairs.length,
    wrongKinds: countKinds(wrongPairs),
  })
}

function countKinds(list: Scored[]): string {
  const counts = new Map<string, number>()
  for (const pair of list) counts.set(pair.category, (counts.get(pair.category) ?? 0) + 1)
  return [...counts].sort((x, y) => y[1] - x[1]).map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"
}

function percent(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`
}

console.log(`\n${same.length} same-meaning pairs, ${different.length} different-meaning pairs. Current threshold: ${SIMILARITY_THRESHOLD}\n`)
console.log("| Threshold | Same caught | Different wrongly matched | Hits that were right | Wrong matches by kind |")
console.log("| --- | --- | --- | --- | --- |")
for (const row of rows) {
  const hits = row.caught + row.wrong
  const right = hits === 0 ? "no hits" : percent(row.caught, hits)
  const marker = row.threshold === SIMILARITY_THRESHOLD ? " **(current)**" : ""
  console.log(
    `| ${row.threshold.toFixed(2)}${marker} | ${row.caught} (${percent(row.caught, same.length)}) | ${row.wrong} (${percent(row.wrong, different.length)}) | ${right} | ${row.wrongKinds} |`,
  )
}

function show(title: string, list: Scored[]): void {
  console.log(`\n${title}`)
  for (const pair of list) {
    console.log(`  ${pair.similarity.toFixed(3)}  #${pair.id} ${pair.category}: "${pair.a}" / "${pair.b}"`)
  }
}

show("Most dangerous: different-meaning pairs that scored highest", [...different].sort((x, y) => y.similarity - x.similarity).slice(0, 12))
show("Hardest to catch: same-meaning pairs that scored lowest", [...same].sort((x, y) => x.similarity - y.similarity).slice(0, 8))

console.log("\nHighest score per category of different-meaning pair")
const categories = [...new Set(different.map((pair) => pair.category))]
for (const category of categories) {
  const scores = different.filter((pair) => pair.category === category).map((pair) => pair.similarity)
  console.log(`  ${category.padEnd(10)} ${Math.max(...scores).toFixed(3)}`)
}

writeFileSync(new URL("./sweep.svg", import.meta.url), chart(rows, same.length, different.length))
console.log("\nChart saved to evals/sweep.svg")

function chart(data: Row[], sameTotal: number, differentTotal: number): string {
  const width = 760
  const height = 440
  const left = 64
  const right = 32
  const top = 118
  const bottom = 64
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const first = data[0]!.threshold
  const last = data[data.length - 1]!.threshold

  const x = (threshold: number) => left + ((threshold - first) / (last - first)) * plotWidth
  const y = (share: number) => top + (1 - share) * plotHeight

  const caughtPoints = data.map((row) => [x(row.threshold), y(row.caught / sameTotal)] as const)
  const wrongPoints = data.map((row) => [x(row.threshold), y(row.wrong / differentTotal)] as const)

  const line = (points: readonly (readonly [number, number])[], color: string) =>
    `<polyline points="${points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
    points.map(([px, py]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${color}" stroke="#fcfcfb" stroke-width="2"/>`).join("")

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((share) => `<line x1="${left}" x2="${left + plotWidth}" y1="${y(share)}" y2="${y(share)}" stroke="#e4e3df"/><text x="${left - 10}" y="${y(share) + 4}" text-anchor="end">${share * 100}%</text>`)
    .join("")

  const ticks = data
    .filter((row) => Math.round(row.threshold * 100) % 2 === 0)
    .map((row) => `<text x="${x(row.threshold)}" y="${top + plotHeight + 22}" text-anchor="middle">${row.threshold.toFixed(2)}</text>`)
    .join("")

  const current = SIMILARITY_THRESHOLD >= first && SIMILARITY_THRESHOLD <= last
    ? `<line x1="${x(SIMILARITY_THRESHOLD)}" x2="${x(SIMILARITY_THRESHOLD)}" y1="${top - 6}" y2="${top + plotHeight}" stroke="#52514e" stroke-dasharray="4 4"/><text x="${x(SIMILARITY_THRESHOLD)}" y="${top - 12}" text-anchor="middle" fill="#52514e">chosen ${SIMILARITY_THRESHOLD.toFixed(2)}</text>`
    : ""

  const [firstCaughtX, firstCaughtY] = caughtPoints[0]!
  const [firstWrongX, firstWrongY] = wrongPoints[0]!

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="max-width:100%;height:auto" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" fill="#52514e">
<rect width="${width}" height="${height}" fill="#fcfcfb"/>
<text x="${left}" y="30" font-size="17" font-weight="600" fill="#0b0b0b">Semantic cache threshold sweep</text>
<text x="${left}" y="52">${EMBEDDING_MODEL}, ${sameTotal} same-meaning and ${differentTotal} different-meaning pairs</text>
<circle cx="${left + 5}" cy="76" r="5" fill="#2a78d6"/>
<text x="${left + 16}" y="80" fill="#0b0b0b">Same meaning, correctly matched (good)</text>
<circle cx="${left + 305}" cy="76" r="5" fill="#eb6834"/>
<text x="${left + 316}" y="80" fill="#0b0b0b">Different meaning, wrongly matched (bad)</text>
${grid}
<line x1="${left}" x2="${left + plotWidth}" y1="${top + plotHeight}" y2="${top + plotHeight}" stroke="#a9a8a2"/>
${ticks}
<text x="${left + plotWidth / 2}" y="${height - 14}" text-anchor="middle">Similarity threshold (a match needs at least this score)</text>
${current}
${line(caughtPoints, "#2a78d6")}
${line(wrongPoints, "#eb6834")}
<text x="${firstCaughtX + 8}" y="${firstCaughtY - 10}" fill="#0b0b0b">${Math.round((data[0]!.caught / sameTotal) * 100)}%</text>
<text x="${firstWrongX + 8}" y="${firstWrongY - 10}" fill="#0b0b0b">${Math.round((data[0]!.wrong / differentTotal) * 100)}%</text>
</svg>
`
}
