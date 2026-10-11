import { setTimeout as wait } from "node:timers/promises"

const gateway = process.env.GATEWAY_URL ?? "http://localhost:3000"
const apiKey = process.argv[2]?.trim() || process.env.GATEWAY_API_KEY?.trim()
const model = process.argv[3]?.trim() || "fast"
const PROVIDER_PAUSE_MS = 2_500

if (!apiKey) {
  console.error("Usage: npm run traffic -- <tenant api key> [model]")
  console.error('The model defaults to "fast" (Groq). Use "mock" to generate traffic without calling a real provider.')
  process.exit(1)
}

const questions: [string, string][] = [
  ["How do I reverse a list in Python?", "How can I reverse a list in Python?"],
  ["How do I reset my password?", "How can I reset my password?"],
  ["What is the capital of Australia?", "Which city is the capital of Australia?"],
  ["How do I center a div in CSS?", "How can I center a div in CSS?"],
  ["Why is the sky blue?", "So why is the sky blue?"],
  ["How do I undo the last git commit?", "How can I undo the last git commit?"],
  ["What does HTTP stand for?", "What does the abbreviation HTTP stand for?"],
  ["How do I merge two dictionaries in Python?", "How can I merge two dictionaries in Python?"],
  ["How do I clear my browser cache?", "How can I clear my browser cache?"],
  ["What causes rainbows?", "What causes a rainbow?"],
  ["Who wrote Pride and Prejudice?", "Who wrote the novel Pride and Prejudice?"],
  ["What is the speed of light?", "What's the speed of light?"],
  ["How many continents are there?", "How many continents are there on Earth?"],
  ["What is photosynthesis?", "What is photosynthesis exactly?"],
  ["How do I make a cup of green tea?", "How can I make a cup of green tea?"],
  ["What is the largest ocean?", "What's the largest ocean?"],
  ["How do I write a for loop in Python?", "How can I write a for loop in Python?"],
  ["What is machine learning?", "What exactly is machine learning?"],
  ["What is inflation?", "What is inflation in economics?"],
  ["How do I enable dark mode?", "How can I enable dark mode?"],
]

type Plan = { kind: string; question: string; temperature?: number }

const plan: Plan[] = [
  ...questions.map(([question]) => ({ kind: "new question", question })),
  ...questions.slice(0, 15).map(([question]) => ({ kind: "exact repeat", question })),
  ...questions.slice(0, 10).map(([, reworded]) => ({ kind: "rewording", question: reworded })),
  ...questions.slice(15, 20).map(([question]) => ({ kind: "high temperature", question, temperature: 0.9 })),
]

const counts = new Map<string, number>()
let failures = 0

console.log(`Sending ${plan.length} requests to ${gateway} using model "${model}"\n`)

for (const [index, step] of plan.entries()) {
  const stream = index % 2 === 0
  const started = performance.now()
  const response = await fetch(`${gateway}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream,
      max_tokens: 400,
      temperature: step.temperature ?? 0,
      messages: [
        { role: "system", content: "Answer in one short sentence." },
        { role: "user", content: step.question },
      ],
    }),
  })
  await response.text()
  const ms = Math.round(performance.now() - started)

  if (!response.ok) failures += 1
  counts.set(step.kind, (counts.get(step.kind) ?? 0) + 1)
  console.log(`${String(index + 1).padStart(2)}  ${response.status}  ${String(ms).padStart(5)} ms  ${step.kind.padEnd(16)} ${stream ? "stream " : "       "} ${step.question}`)

  const calledProvider = step.kind === "new question" || step.kind === "high temperature"
  if (calledProvider && model !== "mock") await wait(PROVIDER_PAUSE_MS)
}

console.log(`\nDone: ${[...counts].map(([kind, count]) => `${count} ${kind}`).join(", ")}. ${failures} failed.`)
