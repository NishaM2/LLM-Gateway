export const MIN_WORD_OVERLAP = 0.4

export type GuardVerdict = { ok: true } | { ok: false; reason: string }

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "am", "do", "does", "did", "how", "what", "whats",
  "which", "who", "where", "when", "why", "can", "could", "would", "should", "will", "shall", "might", "must",
  "i", "im", "me", "my", "you", "your", "u", "we", "our", "it", "its", "this", "that", "these", "those", "to",
  "of", "in", "on", "at", "for", "from", "by", "with", "about", "as", "into", "and", "or", "but", "if", "so",
  "there", "here", "please", "pls", "hi", "hey", "hello", "thanks", "thank", "just", "some", "any", "way",
  "tell", "show", "give", "explain", "kindly", "quick", "question", "s", "not", "no", "without",
])

const NEGATIONS = new Set([
  "not", "no", "never", "none", "nor", "without", "cannot", "non", "unable", "avoid",
  "cant", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "hasnt", "havent", "hadnt",
  "wont", "wouldnt", "shouldnt", "couldnt",
])

const NEGATING_PREFIXES = ["un", "non", "in", "im", "il", "ir", "dis"]

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000", million: "1000000",
}

const DATE_WORDS = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "today", "tomorrow", "yesterday", "tonight", "weekend",
])

const RELATIVE_DATE = /\b(next|last|this|previous|coming)\s+(week|month|year|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g

const ARTICLES = new Set(["a", "an", "the"])
const NOT_NAMES = new Set(["i", "ok"])

export function checkGuards(question: string, cachedQuestion: string, minOverlap = MIN_WORD_OVERLAP): GuardVerdict {
  const a = words(question)
  const b = words(cachedQuestion)

  const numbersA = numbersIn(a)
  const numbersB = numbersIn(b)
  if (numbersA.join(",") !== numbersB.join(",")) {
    return reject(`numbers differ (${show(numbersA)} vs ${show(numbersB)})`)
  }

  const datesA = datesIn(question, a)
  const datesB = datesIn(cachedQuestion, b)
  if (datesA.join(",") !== datesB.join(",")) {
    return reject(`dates differ (${show(datesA)} vs ${show(datesB)})`)
  }

  const namesA = namesIn(question)
  const namesB = namesIn(cachedQuestion)
  const missing = [...namesA.filter((name) => !b.includes(name)), ...namesB.filter((name) => !a.includes(name))]
  if (missing.length > 0) {
    return reject(`names differ (${show([...new Set(missing)])} only in one question)`)
  }

  const shared = [...new Set([...namesA, ...namesB])]
  if (orderOf(shared, a).join(",") !== orderOf(shared, b).join(",")) {
    return reject(`names in a different order (${show(orderOf(shared, a))} vs ${show(orderOf(shared, b))})`)
  }

  const swapped = swappedDirection(a, b)
  if (swapped) return reject(`direction swapped (${swapped})`)

  const negationsA = a.filter((word) => NEGATIONS.has(word)).length
  const negationsB = b.filter((word) => NEGATIONS.has(word)).length
  if (negationsA !== negationsB) return reject("one question is negated and the other is not")

  const flipped = negatedWord(a, b) ?? negatedWord(b, a)
  if (flipped) return reject(`opposite meaning (${flipped})`)

  const overlap = wordOverlap(a, b)
  if (overlap < minOverlap) {
    return reject(`too few words in common (${overlap.toFixed(2)}, need ${minOverlap})`)
  }

  return { ok: true }
}

export function words(text: string): string[] {
  const expanded = text.toLowerCase().replace(/n['’]t\b/g, " not").replace(/['’]s\b/g, "").replace(/['’]/g, "").replace(/%/g, " percent ")
  const tokens = expanded.match(/\d+(?:[.,]\d+)*|[a-z]+/g) ?? []
  return tokens.map((token) => NUMBER_WORDS[token] ?? token)
}

export function wordOverlap(a: string[], b: string[]): number {
  const contentA = new Set(a.filter((word) => !STOPWORDS.has(word)).map(stem))
  const contentB = new Set(b.filter((word) => !STOPWORDS.has(word)).map(stem))
  if (contentA.size === 0 && contentB.size === 0) return 1

  const common = [...contentA].filter((word) => contentB.has(word)).length
  return common / new Set([...contentA, ...contentB]).size
}

function numbersIn(tokens: string[]): string[] {
  const found: string[] = []
  for (const token of tokens) {
    if (/^\d/.test(token)) found.push(token.replace(/,/g, ""))
  }
  return found
}

function datesIn(text: string, tokens: string[]): string[] {
  const relative = [...text.toLowerCase().matchAll(RELATIVE_DATE)].map((match) => `${match[1]} ${match[2]}`)
  return [...relative, ...tokens.filter((token) => DATE_WORDS.has(token))]
}

function namesIn(text: string): string[] {
  const found: string[] = []
  let sentenceStart = true

  for (const [token] of text.matchAll(/[\p{L}\p{N}]+(?:['’]\p{L}+)?|[.!?:]/gu)) {
    if (/^[.!?:]$/.test(token)) {
      sentenceStart = true
      continue
    }

    const plain = token.toLowerCase().replace(/['’]s$/, "").replace(/['’]/g, "")
    const capitalised = /\p{Lu}/u.test(token)
    if (capitalised && !sentenceStart && !NOT_NAMES.has(plain) && !token.startsWith("I'")) {
      found.push(plain)
    }
    sentenceStart = false
  }

  return found
}

function orderOf(names: string[], tokens: string[]): string[] {
  return names
    .map((name) => ({ name, at: tokens.indexOf(name) }))
    .filter((entry) => entry.at >= 0)
    .sort((x, y) => x.at - y.at)
    .map((entry) => entry.name)
}

function directions(tokens: string[]): [string, string][] {
  const found: [string, string][] = []
  for (const [i, token] of tokens.entries()) {
    if (token !== "to") continue
    const before = tokens.slice(0, i).reverse().find((word) => !ARTICLES.has(word))
    const after = tokens.slice(i + 1).find((word) => !ARTICLES.has(word))
    if (before && after && before !== after) found.push([before, after])
  }
  return found
}

function swappedDirection(a: string[], b: string[]): string | null {
  const fromB = directions(b)
  for (const [from, to] of directions(a)) {
    if (fromB.some(([otherFrom, otherTo]) => otherFrom === to && otherTo === from)) {
      return `${from} to ${to} vs ${to} to ${from}`
    }
  }
  return null
}

function negatedWord(a: string[], b: string[]): string | null {
  for (const word of a) {
    if (word.length < 4) continue
    const prefix = NEGATING_PREFIXES.find((candidate) => b.includes(candidate + word))
    if (prefix) return `${word} vs ${prefix}${word}`
  }
  return null
}

function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
}

function show(list: string[]): string {
  return list.length === 0 ? "none" : list.join(", ")
}

function reject(reason: string): GuardVerdict {
  return { ok: false, reason }
}
