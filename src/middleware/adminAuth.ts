import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export function requireAdminToken(adminToken: string | null) {
  const expected = adminToken ? digest(adminToken) : null

  return function (req: Request, res: Response, next: NextFunction): void {
    if (!expected) {
      res.status(503).json({ error: { message: "Stats are turned off. Set ADMIN_TOKEN in .env to turn them on.", type: "stats_disabled" } })
      return
    }

    const match = /^Bearer[ ]+(.+)$/i.exec(req.header("authorization")?.trim() ?? "")
    const given = match?.[1]?.trim()
    if (!given || !timingSafeEqual(digest(given), expected)) {
      res.status(401).json({ error: { message: "Invalid admin token. Send it as: Authorization: Bearer <ADMIN_TOKEN>", type: "invalid_admin_token" } })
      return
    }

    next()
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}
