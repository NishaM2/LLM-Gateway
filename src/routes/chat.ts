import express from "express"
import type { Config } from "../config.ts"
import { createChatCompletion, describeCause, describeProviderFailure, parseJson, readUsage, type Usage } from "../providers/openai.ts"
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts"
import { note } from "../services/requestLogger.ts"

const GROQ_BASE_URL = "https://api.groq.com/openai/v1"

export function chatRouter(config: Config): express.Router {
  const router = express.Router()

  router.post("/v1/chat/completions", async (req, res) => {
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
    note(res, { modelRequested: result.data.model, provider: "groq" })
    console.log(`Forwarding to Groq: ${result.data.model}${wantsStream ? " (streaming)" : ""}`)

    const upstream = await createChatCompletion({
      baseUrl: GROQ_BASE_URL,
      apiKey: config.groqApiKey,
      body: wantsStream ? { ...result.data, stream_options: { include_usage: true } } : result.data,
    })

    if (!upstream.ok) {
      throw describeProviderFailure(upstream.status, await upstream.text())
    }

    if (!wantsStream || !upstream.body) {
      const body = await upstream.text()
      const usage = readUsage(parseJson(body))
      if (usage) note(res, usage)
      res.status(upstream.status).type("application/json").send(body)
      return
    }

    res.status(200)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    const collected = createStreamCollector()
    const reader = upstream.body.getReader()

    let callerLeft = false
    res.on("close", () => {
      if (!res.writableEnded) {
        callerLeft = true
        void reader.cancel().catch(() => {})
      }
    })

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
        collected.add(value)
      }

      if (callerLeft) {
        note(res, { status: "error", errorCode: "caller_hung_up" })
        console.log(`Caller hung up after ${collected.text.length} characters. Stopped the provider.`)
        return
      }

      if (collected.usage) note(res, collected.usage)
      res.end()
      console.log(`Full answer (${collected.text.length} characters): ${collected.text}`)
    } catch (error) {
      if (callerLeft) {
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
  })

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