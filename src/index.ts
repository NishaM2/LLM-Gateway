import { existsSync } from "node:fs"
import { createApp } from "./app.ts"
import { loadConfig, type Config } from "./config.ts"
import { checkDatabase, createDb, createPool } from "./db.ts"

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

const db = createDb(pool)
const app = createApp(config, db)


app.listen(config.port, (error) => {
  if (error) {
    console.error(`Could not start the server on port ${config.port}: ${error.message}`)
    process.exit(1)
  }
  console.log(`Gateway running at http://localhost:${config.port}`)
});