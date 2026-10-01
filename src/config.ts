export type Config = {
  port: number;
  databaseUrl: string;
  groqApiKey: string;
  groqBaseUrl: string;
  geminiApiKey: string;
  redisUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const problems: string[] = []

  function required(name: string): string {
    const value = env[name]?.trim()
    if (!value) {
      problems.push(`${name} is missing`);
      return ""
    }
    return value
  }

  const rawPort = env.PORT?.trim() || "3000"
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be a whole number from 1 to 65535 (got "${rawPort}")`)
  }

  const config: Config = {
    port,
    databaseUrl: required("DATABASE_URL"),
    groqApiKey: required("GROQ_API_KEY"),
    groqBaseUrl: env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
    geminiApiKey: required("GEMINI_API_KEY"),
    redisUrl: env.REDIS_URL?.trim() || "redis://localhost:6379",
  };

  if (problems.length > 0) {
    throw new Error(
      `Cannot start, the configuration has problems:\n  - ${problems.join("\n  - ")}\n` +
        "Fix these in your .env file (see .env.example).",
    );
  }

  return config
}
