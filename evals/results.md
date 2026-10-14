# Semantic cache threshold: results

**Decision: 0.90, always together with the guards.** It is the lowest threshold at which every wrong match is a near-identical question that differs by a single word, number, name or date, which is exactly what the guards are built to catch. At the same time it catches three times as many genuine rewordings as the 0.95 starting guess.

**With the guards switched on, wrong matches at 0.90 fall from 30 to 3, while correct matches fall only from 33 to 27.** Of the hits served, 90% are right, up from 52%.

| At 0.90 | Same caught | Different wrongly matched | Hits that were right |
| --- | --- | --- | --- |
| Embeddings only | 33 (39%) | 30 (26%) | 52% |
| Embeddings + guards | 27 (32%) | 3 (3%) | 90% |

![Threshold sweep with guards](../docs/threshold-sweep-guarded.svg)

## The guards

`src/services/semanticGuards.ts` runs after the similarity check and can only say no. Every check is a cheap, deterministic text comparison, and they are applied in this order:

| Check | Rejects | Example it stops |
| --- | --- | --- |
| Numbers must match, in order | a different number | "3 ideas" / "10 ideas" |
| Dates must match | a different day, month or "next/this week" | "Friday" / "Saturday" |
| Names must match | a capitalised word missing from the other question | "Austria" / "Australia" |
| Names in the same order | swapped names | "London to Paris" / "Paris to London" |
| Direction | "x to y" against "y to x" | "string to a number" / "number to a string" |
| Negation count | one side has not, no, without, n't and the other does not | "working" / "not working" |
| Negating prefix | a word against un-, in-, il-, ir-, im-, dis-, non- plus that word | "legal" / "illegal" |
| Word overlap of at least 0.4 | questions sharing too few meaningful words | "simple terms" / "technical detail" |

Number words are turned into digits and "%" into "percent" first, so "15%" and "fifteen percent" count as the same thing.

The overlap minimum of 0.4 was measured, not guessed. At 0.90 a minimum anywhere from 0 to 0.2 changes nothing, while 0.4 removes 2 more wrong matches at the cost of 3 correct ones. A wrong answer is worse than a miss, so 0.4 it is. At 0.5 it starts throwing away ordinary synonyms ("largest ocean" / "biggest ocean").

Reproduce with `npm run eval:sweep:guards`.

### What still gets through at 0.90

| Score | Pair | Why the guards miss it |
| --- | --- | --- |
| 0.979 | Is a **whale** bigger than an **elephant**? / Is an **elephant** bigger than a **whale**? | the swapped words are ordinary nouns, not names, and the comparison uses "than" rather than "to" |
| 0.976 | Write a **formal** / **casual** apology email | two different adjectives, which looks exactly like a synonym swap |
| 0.961 | How do I zoom **in** / **out** on a PDF? | "in" and "out" are filler words to every check here |

All three differ by words that are opposite in meaning, but nothing in the text says so. Catching them deterministically would need a list of opposites, which never ends. The production answer is a second model that reads both questions together (a cross-encoder or a small LLM judge), which costs a call per candidate hit.

### What the guards wrongly block at 0.90

| Score | Pair | Why |
| --- | --- | --- |
| 0.964 | What is the meaning of the word "ubiquitous"? / What does "ubiquitous" mean? | too few words in common |
| 0.951 | What is the largest ocean? / Which ocean is the biggest? | too few words in common |
| 0.947 | ...in **JavaScript**? / ...in **JS**? | an abbreviation looks like a different name |
| 0.933 | ...in **JavaScript**? / ...in **JS**? | same |
| 0.912 | Explain like I'm **five** / explained very simply | "five" is read as a number |
| 0.908 | Is coffee bad for you? / Does drinking coffee harm your health? | too few words in common |

These cost money, not correctness: the request goes to the provider and gets a fresh answer.

## Embeddings only (Step 33)

![Threshold sweep](../docs/threshold-sweep.svg)

## Setup

- Model: `Xenova/all-MiniLM-L6-v2`, run locally, 384 dimensions
- Data: [pairs.json](pairs.json), 200 labelled pairs. 85 have the same meaning (25 of them hard: typos, slang, very different wording) and 115 have different meanings (69 of them hard: one number, negation, name, date, direction, opposite word or format changed)
- A pair counts as matched when its cosine similarity is at or above the threshold
- Reproduce with `npm run eval:sweep`. The model is deterministic, so the numbers come out the same every time

## Results

| Threshold | Same caught | Different wrongly matched | Hits that were right | Wrong matches by kind |
| --- | --- | --- | --- | --- |
| 0.80 | 67 (79%) | 51 (44%) | 57% | number 13, negation 11, order 7, opposite 7, date 6, related 3, format 3, name 1 |
| 0.81 | 64 (75%) | 48 (42%) | 57% | number 12, negation 11, order 7, opposite 7, date 6, format 3, related 2 |
| 0.82 | 61 (72%) | 47 (41%) | 56% | number 12, negation 11, order 7, opposite 7, date 6, related 2, format 2 |
| 0.83 | 58 (68%) | 46 (40%) | 56% | number 12, negation 11, order 7, opposite 7, date 5, related 2, format 2 |
| 0.84 | 55 (65%) | 44 (38%) | 56% | number 11, negation 11, order 7, opposite 7, date 4, related 2, format 2 |
| 0.85 | 49 (58%) | 40 (35%) | 55% | negation 11, number 10, order 7, opposite 5, date 4, format 2, related 1 |
| 0.86 | 48 (56%) | 39 (34%) | 55% | negation 11, number 9, order 7, opposite 5, date 4, format 2, related 1 |
| 0.87 | 45 (53%) | 36 (31%) | 56% | negation 11, number 8, order 7, date 4, opposite 3, format 2, related 1 |
| 0.88 | 41 (48%) | 33 (29%) | 55% | negation 10, number 7, order 7, date 4, opposite 2, format 2, related 1 |
| 0.89 | 37 (44%) | 31 (27%) | 54% | negation 9, number 7, order 7, date 4, opposite 2, format 2 |
| **0.90 (chosen)** | **33 (39%)** | **30 (26%)** | **52%** | negation 9, order 7, number 6, date 4, opposite 2, format 2 |
| 0.91 | 29 (34%) | 26 (23%) | 53% | negation 8, order 7, date 4, number 3, opposite 2, format 2 |
| 0.92 | 25 (29%) | 24 (21%) | 51% | negation 8, order 7, date 4, number 3, opposite 1, format 1 |
| 0.93 | 19 (22%) | 22 (19%) | 46% | negation 8, order 7, date 3, number 2, opposite 1, format 1 |
| 0.94 | 16 (19%) | 19 (17%) | 46% | negation 8, order 7, date 2, opposite 1, format 1 |
| 0.95 | 11 (13%) | 18 (16%) | 38% | negation 7, order 7, date 2, opposite 1, format 1 |
| 0.96 | 8 (9%) | 16 (14%) | 33% | order 7, negation 5, date 2, opposite 1, format 1 |
| 0.97 | 2 (2%) | 12 (10%) | 14% | order 7, negation 4, format 1 |
| 0.98 | 1 (1%) | 6 (5%) | 14% | order 5, negation 1 |
| 0.99 | 0 (0%) | 1 (1%) | 0% | order 1 |

## What the numbers say

**No threshold is safe on its own.** At every setting, roughly half or more of the hits are wrong answers. Raising the threshold does not fix this, it makes it *worse*: above 0.94 the wrong matches outnumber the right ones, because the most dangerous pairs score higher than real rewordings do.

**The embedding barely notices one changed word.** The highest-scoring wrong matches:

| Score | Pair | Kind |
| --- | --- | --- |
| 0.992 | convert a **string to a number** / a **number to a string** in JavaScript | order |
| 0.989 | flights from **London to Paris** / from **Paris to London** | order |
| 0.984 | is it **legal** / **illegal** to record a call without consent | negation |
| 0.976 | write a **formal** / **casual** apology email | format |
| 0.975 | return an item that **has** / **hasn't** been opened | negation |

To this model, a sentence is mostly the bag of things it is about. Word order and a single "not" hardly move the vector.

**Real rewordings often score low.** "my package hasnt arrived yet whats going on" and "My order is late. Where is it?" mean the same thing but score only 0.471. Casual, typo-ridden questions are the ones a cache would most like to catch, and they are the hardest to catch.

**Questions on the same topic but asking something else** ("How long does shipping take?" / "How much does shipping cost?") top out at 0.884. That is why 0.90 is the floor: at 0.89 and above, none of them match.

## Why 0.90

The choice is made knowing that a wrong answer is far worse than a miss. A miss costs one provider call. A wrong answer is served confidently and the user has no way of telling.

- **Below 0.89**, the wrong matches include whole different questions on the same topic. No cheap check can catch those, because the two questions share most of their words.
- **At 0.90**, every wrong match is a one-word or one-number trap. Numbers, dates and names can be compared exactly, and negations and word order can be checked cheaply. That is the job of the guards.
- **Above 0.90**, real hits fall away fast (13% at 0.95, 2% at 0.97) while the worst traps remain, so a higher threshold buys almost no safety.

**This threshold is only acceptable together with the guards.** On its own, 0.90 serves 30 wrong answers in this set; with them, 3.

## Caveats

- The set is deliberately adversarial. 60% of the different-meaning pairs are traps, far more than real traffic would contain, so the "hits that were right" column is a worst case rather than a forecast.
- 200 pairs is enough to see the shape of the trade-off, but not to pin the threshold to two decimal places. One pair moving changes a row by about 1%.
- The labels are judgement calls, made by one person. Different labels on borderline pairs would shift the numbers slightly.
- All of this is specific to `all-MiniLM-L6-v2`. A different embedding model needs a fresh sweep, because its scores sit on a different scale (an early check of `bge-small-en-v1.5` scored even unrelated questions around 0.35).
