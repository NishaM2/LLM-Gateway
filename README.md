# LLM Gateway

An OpenAI-compatible gateway in front of LLM providers. Applications point at it instead of a provider, and it validates requests, forwards them, streams replies back, and records who spent what.

## Running it

```
docker compose up -d --wait
npm run db:migrate
npm run dev
```

The gateway listens on port 3000. Postgres runs in Docker on port 5433.

## Endpoints

- `GET /health` - open, no key needed
- `POST /v1/chat/completions` - needs `Authorization: Bearer <key>`, streaming supported

## Model names

Clients may ask for a logical name instead of a provider's model name:

| Logical name | Served by |
| --- | --- |
| `fast` | groq `openai/gpt-oss-20b` |
| `smart` | groq `openai/gpt-oss-120b` |

Anything that is not a logical name is passed straight through to the provider, so real model names keep working. Both names are recorded: `model_requested` is what the client asked for, `model_served` is what actually answered, and cost is priced on the served model.

## Tenants and keys

```
npm run tenant:create -- "App name" <monthly budget in dollars> [key label]
```

The key is printed once and only its SHA-256 hash is stored, so it cannot be recovered afterwards. Keys are turned off by setting `revoked_at`, never by deleting the row, so old request logs keep pointing at something real.

## What gets recorded

Every request writes one row to `requests` after the reply has been sent: tenant, model, provider, status, token counts, cost in micro-dollars, total latency and time to first token. Prompt and reply text are never stored.

## Known limitations

- **The budget check has a race.** Spend for the month is summed before each request. Two requests arriving at the same moment can both read the same total and both be allowed, so a tenant can overshoot its budget slightly. Fixing this properly needs a reservation or a lock per tenant, which is not worth the complexity here.
- **The request that crosses the limit still succeeds.** Cost is only known after the provider replies, so the block happens on the next request.
- **Budgets reset on the first of the month in UTC**, not in the tenant's own timezone.
- **Only Groq is wired up** so far.
