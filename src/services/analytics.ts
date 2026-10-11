import { sql, type SQL } from "drizzle-orm"
import type { Db } from "../db.ts"

export type DaySpend = { day: string; costMicros: number; requests: number }

export type CacheCounts = { exact: number; semantic: number; miss: number; skip: number }

export type CacheRates = {
  exactRate: number | null
  semanticRate: number | null
  hitRate: number | null
}

export type HitRate = CacheCounts & CacheRates & { lookups: number; daily: (CacheCounts & CacheRates & { day: string })[] }

export type Savings = {
  savedMicros: number
  exactSavedMicros: number
  semanticSavedMicros: number
  hits: number
  unpricedHits: number
}

export type LatencyGroup = {
  cacheStatus: string
  requests: number
  latencyP50: number | null
  latencyP95: number | null
  latencyP99: number | null
  ttftSamples: number
  ttftP50: number | null
  ttftP95: number | null
}

export type RequestRow = {
  id: string
  createdAt: string
  tenantId: string | null
  tenant: string | null
  modelRequested: string | null
  modelServed: string | null
  provider: string | null
  status: string
  cacheStatus: string | null
  semanticSimilarity: number | null
  errorCode: string | null
  attempts: number | null
  inputTokens: number | null
  outputTokens: number | null
  costMicros: number | null
  latencyMs: number | null
  ttftMs: number | null
}

export type RequestPage = { requests: RequestRow[]; nextCursor: string | null }

export const CACHE_STATUSES = ["hit", "semantic_hit", "miss", "skip"] as const
export const REQUEST_STATUSES = ["ok", "error", "fallback"] as const

export type RequestFilters = {
  tenantId?: string
  cacheStatus?: (typeof CACHE_STATUSES)[number]
  status?: (typeof REQUEST_STATUSES)[number]
}

export type TenantOption = { id: string; name: string; requests: number }

async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  return result.rows as T[]
}


function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Math.round(Number(value))
}

export function ratesFor(counts: CacheCounts): CacheRates & { lookups: number } {
  const lookups = counts.exact + counts.semantic + counts.miss
  if (lookups === 0) return { lookups, exactRate: null, semanticRate: null, hitRate: null }
  return {
    lookups,
    exactRate: counts.exact / lookups,
    semanticRate: counts.semantic / lookups,
    hitRate: (counts.exact + counts.semantic) / lookups,
  }
}

export async function spendByDay(db: Db, days: number): Promise<DaySpend[]> {
  const result = await rows<{ day: string; cost_micros: string; requests: number }>(
    db,
    sql`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${days - 1}),
          date_trunc('day', now() AT TIME ZONE 'UTC'),
          interval '1 day'
        ) AS day
      ),
      totals AS (
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
               sum(cost_micros) AS cost_micros,
               count(*)::int AS requests
        FROM requests
        WHERE created_at >= (SELECT min(day) FROM days) AT TIME ZONE 'UTC'
        GROUP BY 1
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
             coalesce(totals.cost_micros, 0) AS cost_micros,
             coalesce(totals.requests, 0) AS requests
      FROM days
      LEFT JOIN totals ON totals.day = days.day
      ORDER BY days.day
    `,
  )

  return result.map((row) => ({ day: row.day, costMicros: toNumber(row.cost_micros), requests: row.requests }))
}

export async function hitRate(db: Db, from: Date): Promise<HitRate> {
  const daily = await rows<{ day: string; exact: number; semantic: number; miss: number; skip: number }>(
    db,
    sql`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             count(*) FILTER (WHERE cache_status = 'hit')::int AS exact,
             count(*) FILTER (WHERE cache_status = 'semantic_hit')::int AS semantic,
             count(*) FILTER (WHERE cache_status = 'miss')::int AS miss,
             count(*) FILTER (WHERE cache_status = 'skip')::int AS skip
      FROM requests
      WHERE created_at >= ${from} AND cache_status IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `,
  )

  const totals: CacheCounts = { exact: 0, semantic: 0, miss: 0, skip: 0 }
  for (const day of daily) {
    totals.exact += day.exact
    totals.semantic += day.semantic
    totals.miss += day.miss
    totals.skip += day.skip
  }

  return {
    ...totals,
    ...ratesFor(totals),
    daily: daily.map((day) => {
      const { lookups: _lookups, ...rates } = ratesFor(day)
      return { ...day, ...rates }
    }),
  }
}

export async function savings(db: Db, from: Date): Promise<Savings> {
  const [row] = await rows<{
    hits: number
    unpriced_hits: number
    saved_micros: string
    exact_saved_micros: string
    semantic_saved_micros: string
  }>(
    db,
    sql`
      WITH priced AS (
        SELECT r.cache_status,
               r.provider,
               price.provider IS NOT NULL AS has_price,
               round(coalesce(r.input_tokens, 0) * price.input_micros_per_million / 1000000.0)
                 + round(coalesce(r.output_tokens, 0) * price.output_micros_per_million / 1000000.0) AS would_have_cost
        FROM requests r
        LEFT JOIN LATERAL (
          SELECT mp.provider, mp.input_micros_per_million, mp.output_micros_per_million
          FROM model_prices mp
          WHERE mp.provider = r.provider AND mp.model = r.model_served AND mp.effective_from <= r.created_at
          ORDER BY mp.effective_from DESC
          LIMIT 1
        ) price ON true
        WHERE r.cache_status IN ('hit', 'semantic_hit') AND r.created_at >= ${from}
      )
      SELECT count(*)::int AS hits,
             count(*) FILTER (WHERE NOT has_price AND provider IS DISTINCT FROM 'mock')::int AS unpriced_hits,
             coalesce(sum(would_have_cost), 0) AS saved_micros,
             coalesce(sum(would_have_cost) FILTER (WHERE cache_status = 'hit'), 0) AS exact_saved_micros,
             coalesce(sum(would_have_cost) FILTER (WHERE cache_status = 'semantic_hit'), 0) AS semantic_saved_micros
      FROM priced
    `,
  )

  return {
    savedMicros: toNumber(row?.saved_micros),
    exactSavedMicros: toNumber(row?.exact_saved_micros),
    semanticSavedMicros: toNumber(row?.semantic_saved_micros),
    hits: row?.hits ?? 0,
    unpricedHits: row?.unpriced_hits ?? 0,
  }
}

export async function latencyByCacheStatus(db: Db, from: Date): Promise<LatencyGroup[]> {
  const result = await rows<Record<string, unknown>>(
    db,
    sql`
      SELECT cache_status::text AS cache_status,
             count(*)::int AS requests,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS latency_p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS latency_p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS latency_p99,
             count(ttft_ms)::int AS ttft_samples,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p95
      FROM requests
      WHERE created_at >= ${from}
        AND status <> 'error'
        AND provider IS DISTINCT FROM 'mock'
        AND cache_status IS NOT NULL
        AND latency_ms IS NOT NULL
      GROUP BY cache_status
      ORDER BY cache_status
    `,
  )

  return result.map((row) => ({
    cacheStatus: String(row.cache_status),
    requests: toNumber(row.requests),
    latencyP50: toNullableNumber(row.latency_p50),
    latencyP95: toNullableNumber(row.latency_p95),
    latencyP99: toNullableNumber(row.latency_p99),
    ttftSamples: toNumber(row.ttft_samples),
    ttftP50: toNullableNumber(row.ttft_p50),
    ttftP95: toNullableNumber(row.ttft_p95),
  }))
}

export type Summary = {
  from: string
  spendMicros: number
  requests: number
  hitRate: number | null
  hits: number
  lookups: number
  savedMicros: number
  ttftP50: number | null
  ttftSamples: number
}

export async function summary(db: Db, from: Date): Promise<Summary> {
  const [totals] = await rows<{ spend_micros: string; requests: number; ttft_p50: unknown; ttft_samples: number }>(
    db,
    sql`
      SELECT coalesce(sum(cost_micros), 0) AS spend_micros,
             count(*)::int AS requests,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) FILTER (WHERE status <> 'error' AND provider IS DISTINCT FROM 'mock') AS ttft_p50,
             count(ttft_ms) FILTER (WHERE status <> 'error' AND provider IS DISTINCT FROM 'mock')::int AS ttft_samples
      FROM requests
      WHERE created_at >= ${from}
    `,
  )
  const rates = await hitRate(db, from)
  const saved = await savings(db, from)

  return {
    from: from.toISOString(),
    spendMicros: toNumber(totals?.spend_micros),
    requests: totals?.requests ?? 0,
    hitRate: rates.hitRate,
    hits: rates.exact + rates.semantic,
    lookups: rates.lookups,
    savedMicros: saved.savedMicros,
    ttftP50: toNullableNumber(totals?.ttft_p50),
    ttftSamples: totals?.ttft_samples ?? 0,
  }
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url")
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") return null
    if (Number.isNaN(Date.parse(parsed[0])) || !/^[0-9a-f-]{36}$/i.test(parsed[1])) return null
    return { createdAt: parsed[0], id: parsed[1] }
  } catch {
    return null
  }
}

export async function tenantOptions(db: Db): Promise<TenantOption[]> {
  const result = await rows<{ id: string; name: string; requests: number }>(
    db,
    sql`
      SELECT t.id, t.name, count(r.id)::int AS requests
      FROM tenants t
      LEFT JOIN requests r ON r.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY t.name, t.id
    `,
  )
  return result
}

export function requestConditions(filters: RequestFilters, cursor: { createdAt: string; id: string } | null): SQL {
  const conditions: SQL[] = []
  if (cursor) conditions.push(sql`(r.created_at, r.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`)
  if (filters.tenantId) conditions.push(sql`r.tenant_id = ${filters.tenantId}::uuid`)
  if (filters.cacheStatus) conditions.push(sql`r.cache_status = ${filters.cacheStatus}::cache_status`)
  if (filters.status) conditions.push(sql`r.status = ${filters.status}::request_status`)
  return conditions.length === 0 ? sql`` : sql`WHERE ${sql.join(conditions, sql` AND `)}`
}

export async function requestPage(
  db: Db,
  options: { limit: number; cursor: { createdAt: string; id: string } | null; filters?: RequestFilters },
): Promise<RequestPage> {
  const after = requestConditions(options.filters ?? {}, options.cursor)

  const result = await rows<Record<string, unknown>>(
    db,
    sql`
      SELECT r.id, r.created_at::text AS cursor_at, r.created_at, r.tenant_id, t.name AS tenant,
             r.model_requested, r.model_served, r.provider, r.status::text AS status,
             r.cache_status::text AS cache_status, r.semantic_similarity, r.error_code, r.attempts,
             r.input_tokens, r.output_tokens, r.cost_micros, r.latency_ms, r.ttft_ms
      FROM requests r
      LEFT JOIN tenants t ON t.id = r.tenant_id
      ${after}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${options.limit + 1}
    `,
  )

  const page = result.slice(0, options.limit)
  const last = page.at(-1)
  const nextCursor = result.length > options.limit && last ? encodeCursor(String(last.cursor_at), String(last.id)) : null

  return {
    requests: page.map((row) => ({
      id: String(row.id),
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      tenantId: (row.tenant_id as string | null) ?? null,
      tenant: (row.tenant as string | null) ?? null,
      modelRequested: (row.model_requested as string | null) ?? null,
      modelServed: (row.model_served as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      status: String(row.status),
      cacheStatus: (row.cache_status as string | null) ?? null,
      semanticSimilarity: row.semantic_similarity === null ? null : Number(row.semantic_similarity),
      errorCode: (row.error_code as string | null) ?? null,
      attempts: (row.attempts as number | null) ?? null,
      inputTokens: (row.input_tokens as number | null) ?? null,
      outputTokens: (row.output_tokens as number | null) ?? null,
      costMicros: (row.cost_micros as number | null) ?? null,
      latencyMs: (row.latency_ms as number | null) ?? null,
      ttftMs: (row.ttft_ms as number | null) ?? null,
    })),
    nextCursor,
  }
}
