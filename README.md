# LLM Gateway

An OpenAI-compatible gateway in front of LLM providers. Applications point at it instead of a provider, and it validates requests, forwards them, streams replies back, and records who spent what.

## Running it

```
docker compose up -d --wait
npm run db:migrate
npm run dev
```

The gateway listens on port 3000. Postgres runs in Docker on port 5433.

`GROQ_BASE_URL` can point the Groq adapter at any other OpenAI compatible endpoint, which is how retry and fallback behaviour is tested against a server that fails on purpose.

## Endpoints

- `GET /health` - open, no key needed
- `POST /v1/chat/completions` - needs `Authorization: Bearer <key>`, streaming supported

## Model names

Clients may ask for a logical name instead of a provider's model name:

| Logical name | Served by |
| --- | --- |
| `fast` | groq `openai/gpt-oss-20b` |
| `smart` | groq `openai/gpt-oss-120b` |
| `balanced` | gemini `gemini-3.6-flash` |

Anything that is not a logical name is passed straight through to the provider, so real model names keep working. Names beginning with `gemini-` go to Gemini, everything else defaults to Groq. Both names are recorded: `model_requested` is what the client asked for, `model_served` is what actually answered, and cost is priced on the served model.

## Providers

The gateway speaks OpenAI format to its clients, and OpenAI format is also its internal format, so no third shape has to be invented. Every provider adapter has the same job: accept an OpenAI-shaped request and hand back either an OpenAI-shaped JSON body or a stream of OpenAI-shaped SSE chunks.

- **Groq** (`src/providers/openai.ts`) is OpenAI-compatible already, so its bytes are forwarded untouched. Vendor extras such as `x_groq` survive.
- **Gemini** (`src/providers/gemini.ts`) is not, so it is translated on the way in and on the way out. System messages become `systemInstruction`, `assistant` becomes `model`, `max_tokens` becomes `generationConfig.maxOutputTokens`, and each Gemini stream event is rebuilt as a `chat.completion.chunk`.

Two things to know about Gemini specifically:

- It spends output tokens on hidden reasoning. Google bills those, so `output_tokens` here is `candidatesTokenCount + thoughtsTokenCount`. A small `max_tokens` can be eaten entirely by thinking, and the reply then comes back with `finish_reason: length`.
- At list price it is far more expensive per answer than the Groq models, because reasoning tokens are charged at the output rate. Identical prompts in testing cost 25 micro-dollars on `fast` and 906 on `balanced`.

## Retries

A failed call to a provider is tried up to three times. Between attempts the gateway waits a doubling amount of time plus a small random extra: roughly 250ms, then 500ms, each plus up to 250ms of jitter.

Only failures that might pass on a second try are retried: timeouts, unreachable hosts, 429 rate limits and 5xx server errors. A 400 rejection or a 401 bad key is retried never, because the answer will not change. Each attempt count is stored on the log row as `attempts`, so a provider having a bad day is visible in the data.

The doubling matters because a struggling provider should be given more room each time, not hammered at a fixed rate. The jitter matters because without it every client that failed at the same moment would retry at the same moment, and the recovering provider would be knocked over again.

Retries happen around the whole provider call, which means they are safe for streaming too: nothing has been sent to the client until the provider has accepted the request.

## Tenants and keys

```
npm run tenant:create -- "App name" <monthly budget in dollars> [key label]
```

The key is printed once and only its SHA-256 hash is stored, so it cannot be recovered afterwards. Keys are turned off by setting `revoked_at`, never by deleting the row, so old request logs keep pointing at something real.

## What gets recorded

Every request writes one row to `requests` after the reply has been sent: tenant, model, provider, status, token counts, cost in micro-dollars, total latency and time to first token. Prompt and reply text are never stored.

If the caller disconnects, the gateway aborts its own request to the provider straight away, so no further tokens are generated for an answer nobody will read, and the row is recorded as `caller_hung_up`. The row is written only once the route handler has finished, so a late status change still lands.

## Known limitations

- **The budget check has a race.** Spend for the month is summed before each request. Two requests arriving at the same moment can both read the same total and both be allowed, so a tenant can overshoot its budget slightly. Fixing this properly needs a reservation or a lock per tenant, which is not worth the complexity here.
- **The request that crosses the limit still succeeds.** Cost is only known after the provider replies, so the block happens on the next request.
- **Budgets reset on the first of the month in UTC**, not in the tenant's own timezone.
- **A provider that hangs can hold a request for 90 seconds.** Each attempt waits up to 30 seconds for the first byte, and there are up to three attempts. The circuit breaker in Step 23 is what stops this being paid repeatedly.
