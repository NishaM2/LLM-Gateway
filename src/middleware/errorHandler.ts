import type { NextFunction, Request, Response } from "express";
import { ProviderError } from "../providers/openai.ts";
import { note } from "../services/requestLogger.ts";

// The last safety net. Anything that goes wrong ends up here, becomes a clean answer,
// and the server carries on running.
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  // The answer already started, so its status can no longer be changed. Just close it.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ProviderError) {
    note(res, { status: "error", errorCode: error.code });
    console.error(`Provider problem -> answering ${error.status}: ${error.detail}`);
    sendError(res, error.status, error.message, "upstream_error");
    return;
  }

  // express.json() throws these when the body is not valid JSON, or is too big.
  const asBodyError = error as { type?: string; status?: number };
  if (asBodyError?.type === "entity.parse.failed") {
    note(res, { status: "error", errorCode: "invalid_request" });
    console.error("Rejected bad request: the body is not valid JSON");
    sendError(res, 400, "The request body is not valid JSON.", "invalid_request_error");
    return;
  }
  if (asBodyError?.type === "entity.too.large") {
    note(res, { status: "error", errorCode: "body_too_large" });
    console.error("Rejected bad request: the body is too large");
    sendError(res, 413, "The request body is too large.", "invalid_request_error");
    return;
  }

  // Anything else is a bug in the gateway. Log everything, tell the caller nothing useful to an attacker.
  note(res, { status: "error", errorCode: "gateway_error" });
  console.error("Unexpected gateway error:", error);
  sendError(res, 500, "Something went wrong inside the gateway.", "gateway_error");
}

function sendError(res: Response, status: number, message: string, type: string): void {
  res.status(status).json({ error: { message, type, param: null, code: null } });
}