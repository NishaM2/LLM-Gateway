import { createHash, randomBytes } from "node:crypto"

export function newApiKey(): string {
  return `gw_${randomBytes(24).toString("base64url")}`
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}
