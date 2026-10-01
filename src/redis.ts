import { createClient } from "redis"

const CONNECT_TIMEOUT_MS = 3_000
const MAX_RECONNECT_WAIT_MS = 10_000

export function createCache(url: string) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(200 * 2 ** retries, MAX_RECONNECT_WAIT_MS),
    },
  })

  let reportedOutage = false

  client.on("error", (error: Error) => {
    if (reportedOutage) return
    reportedOutage = true
    console.error(`Redis is unavailable (${describe(error)}). The gateway keeps working, just without a cache.`)
  })

  client.on("ready", () => {
    if (reportedOutage) console.log("Redis is back")
    reportedOutage = false
  })

  return client
}

export type Cache = ReturnType<typeof createCache>

// Gives Redis a short window to answer. If it does not, the caller carries on without a
// cache while the client keeps trying to reconnect in the background.
export async function connectCache(client: Cache): Promise<void> {
  const connecting = client.connect().then(() => client.ping())
  connecting.catch(() => {})

  let timer: NodeJS.Timeout | undefined
  const givingUp = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS)
    timer.unref()
  })

  try {
    await Promise.race([connecting, givingUp])
  } catch (error) {
    throw new Error(`Cannot connect to Redis: ${describe(error)}`, { cause: error })
  } finally {
    clearTimeout(timer)
  }
}

export async function closeCache(client: Cache): Promise<void> {
  try {
    await client.close()
  } catch {
    client.destroy()
  }
}

function describe(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors.map(describe).filter(Boolean).join("; ")
    return inner || "could not connect"
  }
  if (error instanceof Error) {
    return error.message || error.name
  }
  return String(error) || "could not connect"
}
