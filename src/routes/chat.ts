import express from "express"
import { BASE_DELAY_MS, describeAttemptFailure, MAX_ATTEMPTS, retry } from "../lib/retry.ts"
import { resolveModel } from "../models.ts"
import { readUsage } from "../providers/openai.ts"
import type { Providers } from "../providers/registry.ts"
import { describeCause, parseJson } from "../providers/shared.ts"
import type { Usage } from "../providers/types.ts"
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts"
import { elapsedMs, note, withLog } from "../services/requestLogger.ts"

export function chatRouter(providers: Providers): express.Router {
  const router = express.Router()

  router.post("/v1/chat/completions", withLog(async (req, res) => {
    const result = chatRequestSchema.safeParse(req.body)
    if (!result.success) {
      const problem = describeProblem(result.error)
      console.log(`Rejected bad request: ${problem.message}`)
      note(res, { status: "error", errorCode: "invalid_request" })
      res.status(400).json({
        error: {
          message: problem.message,
          type: "invalid_request_error",
          param: problem.param || null,
          code: null,
        },
      })
      return
    }

    const wantsStream = result.data.stream === true
    const target = resolveModel(result.data.model)

    const callerGone = new AbortController()
    res.on("close", () => {
      if (!res.writableEnded) callerGone.abort()
    })

    note(res, { modelRequested: result.data.model, modelServed: target.model, provider: target.provider })
    console.log(`Forwarding to ${target.provider}: asked for "${result.data.model}", serving "${target.model}"${wantsStream ? " (streaming)" : ""}`)

    const call = {
      model: target.model,
      body: result.data,
      stream: wantsStream,
      signal: callerGone.signal,
    }

    const reply = await retry(() => providers[target.provider].send(call), {
      attempts: MAX_ATTEMPTS,
      baseDelayMs: BASE_DELAY_MS,
      signal: callerGone.signal,
      onAttempt: (attempt) => note(res, { attempts: attempt }),
      onWait: (attempt, waitMs, error) => {
        console.log(`Attempt ${attempt} failed, waiting ${waitMs}ms before the next one: ${describeAttemptFailure(error)}`)
      },
    })

    if (!wantsStream || !reply.stream) {
      const body = reply.bodyText ?? ""
      const usage = readUsage(parseJson(body))
      if (usage) note(res, usage)
      res.status(200).type("application/json").send(body)
      return
    }

    res.status(200)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    const collected = createStreamCollector()
    const reader = reply.stream.getReader()

    let firstChunkSent = false

    function stopReading(): void {
      void reader.cancel().catch(() => {})
    }

    if (callerGone.signal.aborted) stopReading()
    else callerGone.signal.addEventListener("abort", stopReading, { once: true })

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (!firstChunkSent) {
          firstChunkSent = true
          note(res, { ttftMs: elapsedMs(res) })
        }

        res.write(value)
        collected.add(value)
      }

      if (callerGone.signal.aborted) {
        note(res, { status: "error", errorCode: "caller_hung_up" })
        console.log(`Caller hung up after ${collected.text.length} characters. Stopped the provider.`)
        return
      }

      if (collected.usage) note(res, collected.usage)
      res.end()
      console.log(`Full answer (${collected.text.length} characters): ${collected.text}`)
    } catch (error) {
      if (callerGone.signal.aborted) {
        note(res, { status: "error", errorCode: "caller_hung_up" })
        console.log(`Caller hung up after ${collected.text.length} characters. Stopped the provider.`)
        return
      }

      note(res, { status: "error", errorCode: "stream_broken" })
      console.error(`Stream broke after ${collected.text.length} characters: ${describeCause(error)}`)
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: { message: "The stream ended early.", type: "upstream_error" } })}\n\n`)
        res.end()
      }
    }
  }))

  return router
}

function createStreamCollector() {
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let usage: Usage | null = null

  return {
    add(chunk: Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ""

      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue

          const payload = line.slice(5).trim()
          if (payload === "[DONE]") continue

          const parsed = parseJson(payload)
          if (!parsed) continue

          const piece = parsed?.choices?.[0]?.delta?.content
          if (typeof piece === "string") text += piece

          const chunkUsage = readUsage(parsed)
          if (chunkUsage) usage = chunkUsage
        }
      }
    },
    get text() {
      return text
    },
    get usage() {
      return usage
    },
  }
}