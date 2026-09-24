import express from "express"
import type { Config } from "../config.ts"
import { createChatCompletion } from "../providers/openai.ts"
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts"

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function chatRouter(config: Config): express.Router {
    const router = express.Router()

    router.post("/v1/chat/completions", async (req, res) => {

        // Check the request first. A bad one is turned away here, before it costs anything.
        const result = chatRequestSchema.safeParse(req.body)

        if (!result.success) {
            const problem = describeProblem(result.error);
            console.log(`Rejected bad request: ${problem.message}`)
            
            res.status(400).json({
                error: {
                message: problem.message,
                type: "invalid_request_error",
                param: problem.param || null,
                code: null,
                },
            })
            return;
        }

    const wantsStream = result.data.stream === true
    console.log(`Forwarding to Groq: ${result.data.model}${wantsStream ? " (streaming)" : ""}`)

    const upstream = await createChatCompletion({
        baseUrl: GROQ_BASE_URL,
        apiKey: config.groqApiKey,
        body: result.data,
    })

    // A failed request answers with ordinary JSON even when streaming was asked for.
    if (!wantsStream || !upstream.ok || !upstream.body) {
        const body = await upstream.text();
        res.status(upstream.status).type("application/json").send(body);
        return;
    }

    // Open the stream to the caller before any text has arrived.
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")

    // Stops proxies in front of the gateway from holding pieces back.
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    // Pass every piece on the moment it arrives. Never wait for the whole answer.
    for await (const chunk of upstream.body) {
        res.write(chunk)
    }

    res.end()
    })

    return router
}