import pg from "pg"

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (error) => {
    console.error(`Postgres connection dropped: ${error.message}`)
  });

  return pool
}

// Runs the simplest possible query to prove the database is reachable.
export async function checkDatabase(pool: pg.Pool): Promise<void> {
  try {
    await pool.query("SELECT 1")
  } catch (error) {
    throw new Error(`Cannot connect to Postgres: ${describeError(error)}`, { cause: error })
  }
}


function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map(describeError).join("; ")
  }
  if (error instanceof Error) {
    return error.message || error.name
  }
  return String(error)
}