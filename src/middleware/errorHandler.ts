import type { NextFunction, Request, Response } from "express"
import { ProviderError } from "../providers/openai.ts"
import { note } from "../services/requestLogger.ts"

export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error)
    return
  }

  if (error instanceof ProviderError) {
    note(res, { status: "error", errorCode: error.code })
    console.error(`Provider problem -> answering ${error.status}: ${error.detail}`)
    sendError(res, error.status, error.message, "upstream_error")
    return
  }

  const asBodyError = error as { type?: string; status?: number }
  if (asBodyError?.type === "entity.parse.failed") {
    note(res, { status: "error", errorCode: "invalid_request" })
    console.error("Rejected bad request: the body is not valid JSON")
    sendError(res, 400, "The request body is not valid JSON.", "invalid_request_error")
    return
  }
  if (asBodyError?.type === "entity.too.large") {
    note(res, { status: "error", errorCode: "body_too_large" })
    console.error("Rejected bad request: the body is too large")
    sendError(res, 413, "The request body is too large.", "invalid_request_error")
    return
  }

  note(res, { status: "error", errorCode: "gateway_error" })
  console.error("Unexpected gateway error:", error)
  sendError(res, 500, "Something went wrong inside the gateway.", "gateway_error")
}

function sendError(res: Response, status: number, message: string, type: string): void {
  res.status(status).json({ error: { message, type, param: null, code: null } })
}