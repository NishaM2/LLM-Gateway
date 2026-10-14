# Design reference

How every part of the gateway behaves, and why. The [README](../README.md) is the overview; this is the detail behind it.

## Running it locally

```
docker compose up -d --wait
npm run db:migrate
npm run dev
```

The gateway listens on port 3000. Docker runs Postgres on port 5433 and Redis on port 6379.

Postgres is required and the gateway refuses to start without it, because it holds the tenants, the keys and the request log. Redis is only a cache, so it is optional: if it is missing the gateway says so once at startup, keeps serving requests, and reconnects by itself when Redis comes back. A gateway that will not start because its cache is down would be worse than one with no cache at all.

Run the checks with `npm test`. Check Redis separately with `npm run redis:check`, which writes a key with a ten second life, reads it, waits, and reads it again.

`GROQ_BASE_URL` can point the Groq adapter at any other OpenAI compatible endpoint, which is how retry and fallback behaviour is tested against a server that fails on purpose.

## Endpoints

- `GET /health` - open, no key needed
- `POST /v1/chat/completions` - needs `Authorization: Bearer <key>`, streaming supported
- `GET /stats/...` - read-only numbers for the dashboard, needs `Authorization: Bearer <ADMIN_TOKEN>` (see [Stats](#stats))

## Model names

Clients may ask for a logical name instead of a provider's model name:

| Logical name | First choice | Falls back to |
| --- | --- | --- |
| `fast` | groq `openai/gpt-oss-20b` | gemini `gemini-3.6-flash` |
| `smart` | groq `openai/gpt-oss-120b` | gemini `gemini-3.6-flash` |
| `balanced` | gemini `gemini-3.6-flash` | groq `openai/gpt-oss-120b` |

Anything that is not a logical name is passed straight through to the provider, so real model names keep working. Names beginning with `gemini-` go to Gemini, `mock` and names beginning with `mock-` go to the mock provider, and everything else defaults to Groq. **A real model name never falls back**: asking for `openai/gpt-oss-20b` means that model specifically, and quietly answering with a different one would be dishonest. Fallback belongs to logical names, because those describe a capability rather than a product. Both names are recorded: `model_requested` is what the client asked for, `model_served` is what actually answered, and cost is priced on the served model.

## Providers

The gateway speaks OpenAI format to its clients, and OpenAI format is also its internal format, so no third shape has to be invented. Every provider adapter has the same job: accept an OpenAI-shaped request and hand back either an OpenAI-shaped JSON body or a stream of OpenAI-shaped SSE chunks.

- **Groq** (`src/providers/openai.ts`) is OpenAI-compatible already, so its bytes are forwarded untouched. Vendor extras such as `x_groq` survive.
- **Gemini** (`src/providers/gemini.ts`) is not, so it is translated on the way in and on the way out. System messages become `systemInstruction`, `assistant` becomes `model`, `max_tokens` becomes `generationConfig.maxOutputTokens`, and each Gemini stream event is rebuilt as a `chat.completion.chunk`.

- **Mock** (`src/providers/mock.ts`) runs inside the gateway and never calls the internet. It answers `Mock answer to: <your last message>`, costs nothing, and has no daily limit, so use it for repeated testing instead of burning real quotas. The model name chooses its behaviour:

| Model | What it does |
| --- | --- |
| `mock` | Answers straight away |
| `mock-slow` | Waits 3 seconds, then answers |
| `mock-429` | Fails with a rate limit, so retries kick in |
| `mock-500` | Fails with a server error, so retries kick in |
| `mock-dies` | Streams half the answer, then breaks. Non-streaming requests answer normally |

Its failures go through the same error mapping as real providers, so retries, fallback and the circuit breaker treat them exactly the same. All mock models share one circuit breaker, so a few `mock-500` calls in a row will make plain `mock` get skipped for 30 seconds too, just as a real outage would. Token counts are estimated at one token per four characters.

Two things to know about Gemini specifically:

- It spends output tokens on hidden reasoning. Google bills those, so `output_tokens` here is `candidatesTokenCount + thoughtsTokenCount`. A small `max_tokens` can be eaten entirely by thinking, and the reply then comes back with `finish_reason: length`.
- At list price it is far more expensive per answer than the Groq models, because reasoning tokens are charged at the output rate. Identical prompts in testing cost 25 micro-dollars on `fast` and 906 on `balanced`.

## Retries

A failed call to a provider is tried up to three times. Between attempts the gateway waits a doubling amount of time plus a small random extra: roughly 250ms, then 500ms, each plus up to 250ms of jitter.

Only failures that might pass on a second try are retried: timeouts, unreachable hosts, 429 rate limits and 5xx server errors. A 400 rejection or a 401 bad key is retried never, because the answer will not change. Each attempt count is stored on the log row as `attempts`, so a provider having a bad day is visible in the data.

The doubling matters because a struggling provider should be given more room each time, not hammered at a fixed rate. The jitter matters because without it every client that failed at the same moment would retry at the same moment, and the recovering provider would be knocked over again.

Retries happen around the whole provider call, which means they are safe for streaming too: nothing has been sent to the client until the provider has accepted the request.

## Fallback

When a logical name lists more than one provider and the first one fails after all its retries, the next one is tried. A request answered by anything other than the first choice is recorded with status `fallback`, and `provider` plus `model_served` name who actually answered.

Retrying and falling back answer two different questions, so they are tracked separately on every provider error:

| Failure | Retry the same provider | Try the next provider |
| --- | --- | --- |
| Timeout, host unreachable, 429, 5xx | yes | yes |
| Bad API key (401 or 403) | no, the key will not fix itself | yes, the other provider has its own key |
| Request rejected (400) | no | no, every provider will reject it |
| Caller disconnected | no | no, nobody is waiting |

The bad-key row is the interesting one and the reason one flag was not enough.

**The streaming rule: fallback only happens before the first byte reaches the client.** This is not a check, it is where the code sits. A provider call only returns once the provider has accepted the request, so every fallback decision is made while the response body is still empty. Once chunks are flowing, a break mid-answer is recorded as `stream_broken` and the client gets a truncated answer, because switching providers halfway would mean sending two different answers glued together.

## Circuit breaker

Retries and fallback both still *call* a provider that is already known to be down, which wastes seconds on every request. Each provider therefore has a breaker in memory with three states:

| State | Meaning | What happens to a request |
| --- | --- | --- |
| `closed` | normal | the provider is called |
| `open` | the provider has been failing | the provider is skipped entirely, straight to the fallback |
| `half-open` | the cooldown has passed | exactly one request is allowed through as a test |

Five failures within sixty seconds opens the breaker for thirty seconds. After that it goes half-open and lets one request through: if that succeeds the breaker closes and the failure count resets, if it fails the thirty seconds start again. While a test request is in flight everything else is still skipped, so a struggling provider gets one caller at a time rather than a crowd.

A failure here means one failed *request*, not one failed attempt. A request that exhausted all three retries counts once, because retries are an internal detail of a single request. Any success resets the count.

The window has to be sized against that. A request that burns three retries and then falls back takes a few seconds, so five of them span fifteen seconds or more. The first version of this used a ten second window and the breaker could never open, because the oldest failures aged out before the fifth one arrived.

Not every error counts against a provider. A 400 rejection means the provider answered correctly and is healthy, so it closes the breaker. A caller disconnect teaches nothing about the provider, so it is discarded without being counted either way. Letting those count would open the breaker on a perfectly healthy provider, and the disconnect case matters most precisely when a provider is slow, which is when clients give up.

## Cache

Before calling a provider the gateway looks for an identical request it has already answered. A hit is returned straight from Redis: no provider call, no tokens bought, no money spent. In testing a miss took 1043ms and the same request a moment later took 10ms.

Answers are stored for ten minutes under a key shaped `cache:v1:<tenant id>:<request hash>`. Two parts of that are deliberate:

- **The tenant id** keeps caches separate. Without it one tenant could be handed an answer another tenant paid for, and could tell from the response time that somebody else had asked the same question.
- **The version prefix** is the escape hatch. If the canonical form below ever changes, bumping `v1` abandons every old entry at once rather than serving answers that were computed under different rules.

A hit logs `cost_micros` of zero, because nothing was bought, but it keeps the token counts from the original answer. That way the request log can still be asked how much money the cache has saved.

Redis has no persistence and a 256MB limit with least-recently-used eviction, so restarting it simply empties the cache and the next request is a miss. If Redis is unreachable every lookup quietly reports a miss and the gateway behaves as though there were no cache at all.

### Streaming

A streaming request stores its answer too, and a streaming hit is replayed rather than dumped. The stored text goes back in eight character pieces about twelve milliseconds apart, with the same `chat.completion.chunk` shape a provider would send, so a UI that types the answer out keeps typing. An instant wall of text would look like a bug.

Long answers are paced faster so the whole replay never exceeds about a second and a half. A cached essay delivered at a fixed drip rate would end up slower than fetching it again, which would defeat the point.

A non streaming hit returns the provider's original body byte for byte, because that body is stored alongside the text. A streaming answer has no such body, so if one of those is later asked for without streaming the gateway rebuilds a normal completion from the stored text.

### When the cache is not used

Three kinds of request skip the cache entirely, neither read nor written, and are logged as `skip`:

| Rule | Why |
| --- | --- |
| `temperature` above 0.2 | the caller explicitly asked for variety, and handing back a stored answer is the opposite of that |
| `tools` or `functions` is a non-empty list | the answer depends on tool results the gateway never sees |
| `Cache-Control: no-cache` or `no-store` | the caller asked for a fresh answer |

A request with **no** `temperature` at all is treated as cacheable. Strictly it is not obvious: leaving it out means the provider picks, and OpenAI compatible defaults are usually 1.0, which is high. Almost every real client omits it and still expects caching to work, so that is the behaviour chosen here. Raising `MAX_CACHEABLE_TEMPERATURE` in `src/services/cachePolicy.ts` to nothing, or treating absent as uncacheable, are both one line changes if that trade is ever wrong.

`tool_choice` on its own does not block caching, and nor does an empty `tools` list. Neither can actually produce a tool call.

### What makes two requests the same

Two requests share a cached answer only when they would genuinely deserve the same answer. `src/services/cacheKey.ts` turns a request into a SHA-256 hash by rewriting it into one canonical form first:

- **Object keys are sorted** at every level, so `{model, messages}` and `{messages, model}` hash the same. JSON preserves the order you wrote, so without this the same request sent by two different clients would miss the cache every time.
- **Array order is preserved.** Swapping two messages changes the conversation, so it must change the hash.
- **Whitespace around message content is trimmed**, so a trailing newline does not cost a provider call. This is deliberately limited to message content: trimming every string in the request would turn a `stop` sequence of `" "` into `""` and change what the model does.
- **Everything else in the request is included**, not just the fields the cache was designed around. `max_tokens`, `seed`, `top_p`, `response_format`, `tools` and anything a provider adds later all change the hash. Listing the fields to include would mean that the first unlisted field to affect an answer starts serving wrong cached responses, silently.
- **`stream`, `stream_options` and `user` are ignored.** None of them change the answer, and ignoring `stream` is what lets a streaming request be served from an answer that was cached without streaming.

A missing field is not the same as a present one: no `temperature` hashes differently from `temperature: 0.2`, because an absent value means whatever the provider defaults to.

Run `npm test` to check all of this.

## Semantic cache

When the exact cache misses, the gateway checks whether a question that *means* the same thing has been answered before. "How can I reset my password?" can be served the stored answer to "How do I reset my password?", even though the words differ.

1. The last user message is turned into 384 numbers (an embedding) by a small model running inside the gateway (`Xenova/all-MiniLM-L6-v2`). It is free, takes about 13ms, and is loaded once at startup.
2. Postgres finds the closest stored question **within the same namespace** (`src/services/namespace.ts`): same tenant, model, system prompt, tools, temperature bucket, earlier conversation and other settings. A similar question under a different system prompt deserves a different answer, so it is never even compared.
3. If the closest one scores at least `SIMILARITY_THRESHOLD` (0.90, chosen by measurement, see [evals/results.md](../evals/results.md)), it still has to pass the guards in `src/services/semanticGuards.ts`: numbers, dates and names must match exactly and in the same order, neither side may be negated when the other is not ("working" / "not working", "legal" / "illegal"), a swapped "x to y" is refused, and the two questions must share enough meaningful words. Only then is the stored answer served and the row logged as `semantic_hit`. Otherwise the provider is called and the new question and answer are stored for an hour.

Embeddings are weak exactly where it hurts most: "What is 2+2?" and "What is 2+3?" look almost identical to them. On 200 labelled pairs, the guards cut wrong matches at 0.90 from 30 to 3 while correct matches only fell from 33 to 27. The three that still get through, and the rewordings the guards wrongly refuse, are listed in [evals/results.md](../evals/results.md). A refused match is logged with the reason, for example `Semantic match (0.972) rejected, one question is negated and the other is not`.

Every lookup writes the best score it found to `semantic_similarity` on the log row, hit or miss, so real traffic shows how close the near misses were.

### Expiry and clearing

- **Entries live for an hour** (`SEMANTIC_TTL_SECONDS`). Lookups skip anything past its `expires_at`, so a stale answer is never served, even before it is deleted.
- **A cleanup job** (`src/jobs/cleanup.ts`) deletes expired rows when the gateway starts and every hour after that. Hourly rather than more often so a hosted database that sleeps when idle, such as Neon's free tier, is not kept awake by housekeeping.
- **`hit_count` goes up each time an entry is served**, so `SELECT prompt, hit_count FROM cache_entries ORDER BY hit_count DESC` shows which answers actually earn their keep.
- **A whole namespace can be cleared at once**, for example when a tenant's facts change and every stored answer under that setup is now wrong:

  ```
  npm run cache:flush -- "Tenant name" path/to/request.json
  ```

  The request file is any request using the setup to clear (model, system prompt, tools, settings). The namespace is worked out from it, so nobody has to know the hash. Other namespaces are untouched.

A tenant who simply edits their system prompt needs no flush: the new prompt produces a new namespace, the old entries stop matching straight away, and cleanup removes them within the hour.

`npm run semantic:check` exercises all of this against the real database: hit counting, expiry, cleanup and flushing.

The same no-cache rules apply as for the exact cache. On top of those, only plain text questions are matched by meaning: a message with an image, or a conversation that does not end with a user message, skips this step. Answers cut off by `max_tokens` (`finish_reason: length`) are stored in neither cache.

Postgres narrows to the namespace first, using an ordinary index, and only then compares vectors. The HNSW vector index is there for the day one namespace holds thousands of entries. HNSW is approximate: it trades a perfect answer for a fast one. On its own it would find the nearest vectors across *all* namespaces and filter afterwards, which can leave nothing behind, so migration `0013` sets `hnsw.iterative_scan = strict_order` on the database itself, which makes it keep searching until it finds a match in the right namespace. Setting it on the database rather than per connection means it also survives a connection pooler such as Neon's.

## Tenants and keys

```
npm run tenant:create -- "App name" <monthly budget in dollars> [key label]
```

The key is printed once and only its SHA-256 hash is stored, so it cannot be recovered afterwards. Keys are turned off by setting `revoked_at`, never by deleting the row, so old request logs keep pointing at something real.

## What gets recorded

Every request writes one row to `requests` after the reply has been sent: tenant, model, provider, status, token counts, cost in micro-dollars, total latency and time to first token. The request log never stores prompt or reply text. The caches do, for as long as an entry lives: answers for 10 minutes in Redis, questions and answers for an hour in `cache_entries`.

If the caller disconnects, the gateway aborts its own request to the provider straight away, so no further tokens are generated for an answer nobody will read, and the row is recorded as `caller_hung_up`. The row is written only once the route handler has finished, so a late status change still lands.

## Stats

Read-only endpoints for the dashboard. They use their own `ADMIN_TOKEN` from `.env`, not a tenant key, because they show every tenant's traffic. Without `ADMIN_TOKEN` they answer 503. They are not written to the request log. `days` defaults to 30 and can be 1 to 365.

| Endpoint | Returns |
| --- | --- |
| `GET /stats/summary` | this month so far (UTC): spend, requests, hit rate, savings, median time to first token |
| `GET /stats/spend?days=30` | cost and request count for every UTC day, including days with nothing |
| `GET /stats/hit-rate?days=30` | exact, semantic, miss and skip counts with rates, overall and per day |
| `GET /stats/savings?days=30` | what the cached hits would have cost, split by exact and semantic |
| `GET /stats/latency?days=30` | p50, p95 and p99 latency, plus p50 and p95 time to first token, for each cache status |
| `GET /stats/providers` | each provider's circuit breaker state right now |
| `GET /stats/requests?limit=50&cursor=...` | newest requests first, one page at a time. Optional filters: `tenant` (id), `cacheStatus` (`hit`, `semantic_hit`, `miss`, `skip`), `status` (`ok`, `error`, `fallback`) |
| `GET /stats/tenants` | every tenant with its request count, for the dashboard's filter |

**Hit rate** is hits divided by lookups, where a lookup is an exact hit, a semantic hit or a miss. Skipped requests never looked in the cache, so counting them would make the cache look worse than it is. With no lookups the rate is `null`, not 0.

**Savings** prices each cached hit's token counts at the served model's price as it was on the day of the request, with the same per-side rounding as real costs. Hits on a model with no price on file are counted in `unpricedHits` rather than silently treated as free.

**Latency** and the median time to first token only use successful requests, because a fast 401 would drag the miss line down and flatter it. They also leave out the mock provider, whose speed is made up: a mock "miss" answers in 70ms and would make real misses look as fast as cache hits.

**The request list pages with a cursor, not an offset.** `OFFSET 10000` makes Postgres read and throw away 10,000 rows on every page, and rows arriving between pages shift everything along so rows get skipped or repeated. The cursor is the last row's `(created_at, id)`, and the next page asks for rows older than it, which the `requests_created_at_idx` index answers directly however long the table gets. The timestamp keeps its full microsecond precision inside the cursor, because JavaScript dates only hold milliseconds and two rows in the same millisecond would otherwise trip it up.

## Web app: landing page and dashboard

One React app in `client/`, with two pages: the landing page at `/` and the dashboard at `/dashboard`. The landing page's **Explore Dashboard** button opens the dashboard inside the same app, and the sun and moon button in the header switches between light and dark. The choice is remembered, and the first visit follows the system setting.

```
client/src/
  pages/                 LandingPage, DashboardPage
  components/landing/    Hero, CodeSample, StatsStrip, RequestFlow, Results, Features, Closing
  components/dashboard/  SummaryCard, the three charts, RequestLog, RequestDetail, ...
  components/layout/     SiteHeader, SiteFooter, ThemeToggle
  styles/                base (colours for both themes), landing, dashboard
```

While developing:

```
npm run web:install   # once
npm run dev           # the gateway, in one terminal
npm run web           # the web app, in another, then open http://localhost:5173
```

The dev server on 5173 forwards `/v1`, `/health` and `/stats` to the gateway. On `/stats` it adds `ADMIN_TOKEN` from the root `.env`, so the token never reaches the browser. Point it at a gateway somewhere else with `GATEWAY_URL`.

`npm run web:build` writes the app to `client/dist`. The deployed demo serves that folder from Vercel, but the gateway can also serve it itself at `/` and `/dashboard` from the same address as the API, so a single server is enough when that is simpler. The dashboard code is loaded only when someone opens it, so the landing page stays light.

**Public demo mode.** Set `STATS_PUBLIC=true` and `/stats` no longer needs the admin token, so visitors can open the dashboard. The endpoints are read-only, but they show every tenant's name and traffic, so only turn it on when the data is demo data. `render.yaml` turns it on, because the deployed site is a demo.

Below the four summary cards are three charts:

- **Response time, cached vs uncached.** Median and p95 latency for exact hits, semantic hits, misses and skipped requests. In a 50-request test against Groq, exact hits took a median 56ms and semantic hits 141ms, against 718ms for misses.
- **Spend per day** over the last 30 days.
- **Cache hit rate per day**, split into exact and semantic. Days without any cache lookups are left as gaps rather than drawn as 0%.

To fill the charts with realistic traffic, `npm run traffic -- <tenant key>` sends 50 requests through the gateway: 20 new questions, 15 exact repeats, 10 rewordings and 5 at high temperature, half of them streamed. It uses `fast` (Groq) by default and pauses between provider calls to stay under the free-tier rate limit. Add `mock` after the key to use the mock provider instead.

At the bottom is the **request log**: 25 requests a page, newest first, filtered by tenant, cache status and outcome. Filtering happens in SQL on the server, never by downloading everything and sorting it out in the browser, and the filters ride along with the paging cursor, so page 2 of "errors only" is still only errors. Clicking a row (or pressing Enter on it) opens a panel with everything recorded about that request: both model names, provider, attempts, tokens, cost, timings, error code, and the similarity score. For a semantic hit that score is the match that was served. For a miss it is the closest stored question that wasn't close enough.

Every request gives up after 8 seconds, so there is never a spinner that spins forever. If the gateway is down, the dashboard says so and offers a retry. If it fails after a successful load, the last numbers stay on screen with a note that they are stale.

## Deploying for free

The gateway runs on three free tiers: **Render** for the server, **Neon** for Postgres with pgvector, and **Upstash** for Redis. `render.yaml` describes the service, so Render can set it up as a Blueprint.

1. **Neon:** create a project and copy its connection string. Pooled or direct both work.
2. **Migrations and a first tenant**, run from your machine against Neon. A `DATABASE_URL` set in the shell wins over the one in `.env`:

   ```
   $env:DATABASE_URL = "postgres://...neon.tech/neondb?sslmode=require"
   npm run db:migrate
   npm run tenant:create -- "Demo" 1.00
   Remove-Item Env:DATABASE_URL
   ```

3. **Upstash:** create a Redis database and copy its `rediss://` URL.
4. **Render:** New, then Blueprint, then pick this repository. Fill in `DATABASE_URL`, `REDIS_URL`, `GROQ_API_KEY` and `GEMINI_API_KEY`. `ADMIN_TOKEN` is generated for you.
5. **Keep it awake:** a free Render service sleeps after 15 minutes without traffic and takes about a minute to wake. An uptime monitor (UptimeRobot's free plan works) calling `/health` every 10 minutes prevents that. `/health` does not touch the database, so Neon can still sleep between real requests and stays within its 100 free compute hours.

The web app is deployed separately on Vercel (project root `client`). `client/vercel.json` forwards `/stats`, `/v1` and `/health` to the Render address, so the browser only ever talks to one address and no CORS setup is needed. Put your Render address into that file before deploying. Public demo mode is on in `render.yaml`, which is what lets visitors open the dashboard.

**Free tier trade-offs:** the first request after a Neon sleep waits for the database to wake, Render has 512 MB of memory and can restart a free service at any time, and the embedding model (about 23 MB) is downloaded again on every restart, so the first semantic lookup after a restart is slow.
