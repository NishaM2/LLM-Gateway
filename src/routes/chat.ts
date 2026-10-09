import express from "express"
import type { Response } from "express"
import { describeAttemptFailure } from "../lib/retry.ts"
import { resolveModel } from "../models.ts"
import { readUsage } from "../providers/openai.ts"
import { describeCause, parseJson } from "../providers/shared.ts"
import type { Db } from "../db.ts"
import type { Cache } from "../redis.ts"
import type { Usage } from "../providers/types.ts"
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts"
import { tenantOf } from "../middleware/auth.ts"
import { cachePolicy } from "../services/cachePolicy.ts"
import { completionFrom, replayAsStream } from "../services/cacheReplay.ts"
import { cacheKeyFor, readAnswer, writeAnswer, type CachedAnswer } from "../services/exactCache.ts"
import { elapsedMs, note, withLog } from "../services/requestLogger.ts"
import type { Router } from "../services/router.ts"
import { isSemanticHit, rememberAnswer, searchSemantic, type SemanticSearch } from "../services/semanticCache.ts"
import { checkGuards } from "../services/semanticGuards.ts"

export function chatRouter(modelRouter: Router, cache: Cache, db: Db): express.Router {
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
    const route = resolveModel(result.data.model)

    const callerGone = new AbortController()
    res.on("close", () => {
      if (!res.writableEnded) callerGone.abort()
    })

    note(res, { modelRequested: result.data.model, attempts: 0 })

    const tenant = tenantOf(res)
    const decision = cachePolicy({ body: result.data, cacheControl: req.header("cache-control") })
    const key = tenant && decision.cacheable ? cacheKeyFor(tenant.id, result.data) : null
    let search: SemanticSearch | null = null

    async function serveCached(answer: CachedAnswer, cacheStatus: "hit" | "semantic_hit"): Promise<void> {
      note(res, {
        cacheStatus,
        provider: answer.provider,
        modelServed: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
      })

      if (wantsStream) {
        startEventStream(res)
        await replayAsStream(res, answer, callerGone.signal)
        if (callerGone.signal.aborted) note(res, { status: "error", errorCode: "caller_hung_up" })
      } else {
        res.status(200).type("application/json").send(answer.bodyText ?? completionFrom(answer))
      }
    }

    async function remember(answer: CachedAnswer): Promise<void> {
      if (key === null || answer.text === "" || answer.finishReason === "length") return
      await writeAnswer(cache, key, answer)
      if (search) await rememberAnswer(db, search, answer)
    }

    if (key === null || !tenant) {
      note(res, { cacheStatus: "skip" })
      if (!decision.cacheable) console.log(`Not using the cache: ${decision.reason}`)
    } else {
      const cached = await readAnswer(cache, key)
      if (cached) {
        console.log(`Cache hit for "${result.data.model}"${wantsStream ? ", replaying it as a stream" : ""}`)
        await serveCached(cached, "hit")
        return
      }

      search = await searchSemantic(db, tenant.id, result.data)
      const closest = search?.closest
      if (closest) note(res, { semanticSimilarity: closest.similarity })

      if (isSemanticHit(search)) {
        const score = search.closest.similarity.toFixed(3)
        const guard = checkGuards(search.question, search.closest.prompt)

        if (guard.ok) {
          console.log(`Semantic hit (${score}): "${search.question}" matched "${search.closest.prompt}"`)
          await serveCached(search.closest.answer, "semantic_hit")
          return
        }

        console.log(`Semantic match (${score}) rejected, ${guard.reason}: "${search.question}" vs "${search.closest.prompt}"`)
      } else if (closest) {
        console.log(`Semantic miss, closest was ${closest.similarity.toFixed(3)}: "${closest.prompt}"`)
      }

      note(res, { cacheStatus: "miss" })
    }

    const plan = route.map((target) => `${target.provider}/${target.model}`).join(" then ")
    console.log(`Routing "${result.data.model}" to ${plan}${wantsStream ? " (streaming)" : ""}`)

    const outcome = await modelRouter.send(
      route,
      { body: result.data, stream: wantsStream, signal: callerGone.signal },
      {
        onAttempt: (target, attemptsSoFar) => {
          note(res, { provider: target.provider, modelServed: target.model, attempts: attemptsSoFar })
        },
        onWait: (target, waitMs, error) => {
          console.log(`${target.provider} failed, waiting ${waitMs}ms before trying it again: ${describeAttemptFailure(error)}`)
        },
        onSkip: (target, state) => {
          console.log(`Skipped ${target.provider} without calling it, its circuit is ${state}`)
        },
        onBreakerOpened: (target) => {
          console.log(`Circuit opened for ${target.provider}, it will be skipped for the next 30 seconds`)
        },
        onFallback: (from, to, error) => {
          console.log(`${from.provider} is out, falling back to ${to.provider}: ${describeAttemptFailure(error)}`)
        },
      },
    )

    const reply = outcome.reply
    if (outcome.usedFallback) note(res, { status: "fallback" })

    if (!wantsStream || !reply.stream) {
      const body = reply.bodyText ?? ""
      const parsed = parseJson(body)
      const usage = readUsage(parsed)
      if (usage) note(res, usage)
      res.status(200).type("application/json").send(body)

      await remember({
        text: answerText(parsed),
        finishReason: finishReasonOf(parsed),
        bodyText: body,
        provider: outcome.target.provider,
        model: outcome.target.model,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      })
      return
    }

    startEventStream(res)

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

      await remember({
        text: collected.text,
        finishReason: collected.finishReason,
        bodyText: null,
        provider: outcome.target.provider,
        model: outcome.target.model,
        inputTokens: collected.usage?.inputTokens ?? null,
        outputTokens: collected.usage?.outputTokens ?? null,
      })
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

function startEventStream(res: Response): void {
  res.status(200)
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
}

function answerText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  return typeof content === "string" ? content : ""
}

function finishReasonOf(payload: any): string {
  const reason = payload?.choices?.[0]?.finish_reason
  return typeof reason === "string" ? reason : "stop"
}

function createStreamCollector() {
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let finishReason = "stop"
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

          const reason = parsed?.choices?.[0]?.finish_reason
          if (typeof reason === "string") finishReason = reason

          const chunkUsage = readUsage(parsed)
          if (chunkUsage) usage = chunkUsage
        }
      }
    },
    get text() {
      return text
    },
    get finishReason() {
      return finishReason
    },
    get usage() {
      return usage
    },
  }
}