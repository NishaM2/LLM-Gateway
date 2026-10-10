import { existsSync } from "node:fs"
import { createApp } from "./app.ts"
import { loadConfig, type Config } from "./config.ts"
import { checkDatabase, createDb, createPool } from "./db.ts"
import { connectCache, createCache } from "./redis.ts"
import { startCleanup } from "./jobs/cleanup.ts"
import { embed, EMBEDDING_MODEL } from "./services/embeddings.ts"

if (existsSync(".env")) {
  process.loadEnvFile(".env")
}

let config: Config
try {
  config = loadConfig(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const pool = createPool(config.databaseUrl)
try {
  await checkDatabase(pool)
  console.log("Connected to Postgres")
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error("Is the database running? Start it with: docker compose up -d --wait")
  process.exit(1)
}

const cache = createCache(config.redisUrl)
try {
  await connectCache(cache)
  console.log("Connected to Redis")
} catch (error) {
  console.warn(error instanceof Error ? error.message : error)
  console.warn("Running without a cache. Start Redis with: docker compose up -d --wait")
}

embed("warm up")
  .then(() => console.log(`Loaded the embedding model ${EMBEDDING_MODEL}`))
  .catch((error) => console.warn(`Could not load the embedding model, the semantic cache will miss: ${error instanceof Error ? error.message : error}`))

if (!config.adminToken) {
  console.warn("ADMIN_TOKEN is not set, so the /stats endpoints are turned off")
}

const db = createDb(pool)
const app = createApp(config, db, cache)
startCleanup(db)


app.listen(config.port, (error) => {
  if (error) {
    console.error(`Could not start the server on port ${config.port}: ${error.message}`)
    process.exit(1)
  }
  console.log(`Gateway running at http://localhost:${config.port}`)
});