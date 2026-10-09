import assert from "node:assert/strict"
import { test } from "node:test"
import { checkGuards, words, wordOverlap } from "./semanticGuards.ts"

function rejected(a: string, b: string): string {
  const verdict = checkGuards(a, b)
  assert.equal(verdict.ok, false, `expected "${a}" / "${b}" to be rejected`)
  return verdict.ok ? "" : verdict.reason
}

function accepted(a: string, b: string): void {
  const verdict = checkGuards(a, b)
  assert.ok(verdict.ok, `expected "${a}" / "${b}" to pass, got: ${verdict.ok ? "" : verdict.reason}`)
}

test("different numbers are rejected", () => {
  assert.match(rejected("What is 2+2?", "What is 2+3?"), /numbers differ/)
  assert.match(rejected("Summarize chapter 4 of the book.", "Summarize chapter 5 of the book."), /numbers differ/)
})

test("a number written as a word matches the same number in digits", () => {
  assert.equal(checkGuards("What is 15% of 200?", "What is fifteen percent of 200?").ok, true)
})

test("different days and relative dates are rejected", () => {
  assert.match(rejected("Is the store open on Sunday?", "Is the store open on Saturday?"), /dates differ/)
  assert.match(rejected("Schedule the meeting for next week.", "Schedule the meeting for this week."), /dates differ/)
})

test("different names are rejected", () => {
  assert.match(rejected("What is the capital of Austria?", "What is the capital of Australia?"), /names differ/)
})

test("the same names in a different order are rejected", () => {
  assert.match(rejected("Find flights from London to Paris.", "Find flights from Paris to London."), /different order/)
})

test("a swapped direction is rejected even without names", () => {
  assert.match(rejected("How do I convert a string to a number?", "How do I convert a number to a string?"), /direction swapped/)
})

test("a negated question is rejected", () => {
  assert.match(rejected("Why is my code working?", "Why is my code not working?"), /negated/)
  assert.match(rejected("Which apps work offline?", "Which apps don't work offline?"), /negated/)
  assert.match(rejected("Show me recipes with eggs.", "Show me recipes without eggs."), /negated/)
})

test("a word with a negating prefix is rejected", () => {
  assert.match(rejected("Is this contract enforceable?", "Is this contract unenforceable?"), /opposite meaning/)
  assert.match(rejected("Is it legal to record a call?", "Is it illegal to record a call?"), /opposite meaning/)
})

test("questions with too little in common are rejected", () => {
  assert.match(rejected("Explain recursion in simple terms.", "Explain recursion in technical detail."), /too few words/)
})

test("genuine rewordings pass", () => {
  accepted("How do I reset my password?", "How can I reset my password?")
  accepted("whats the capital of france", "Tell me which city serves as the capital of France.")
  accepted("What's the typical winter weather in London?", "What is London's weather usually like in winter?")
  accepted("Hey, what is the difference between TCP and UDP?", "TCP vs UDP: what's the difference?")
})

test("capitalised words at the start of a sentence are not treated as names", () => {
  accepted("Hi! Quick question: do you guys ship to Canada? Thanks!", "Do you ship to Canada?")
})

test("contractions become not, and possessives are dropped", () => {
  assert.deepEqual(words("London's shop isn't open"), ["london", "shop", "is", "not", "open"])
})

test("word overlap ignores filler words", () => {
  assert.equal(wordOverlap(words("How do I reset my password?"), words("How can I reset my password?")), 1)
})
