import express from "express"
import type { Config } from "../config.ts"
import { createChatCompletion } from "../providers/openai.ts"
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts"

const GROQ_BASE_URL = "https://api.groq.com/openai/v1"

export function chatRouter(config: Config): express.Router {
    const router = express.Router()

    router.post("/v1/chat/completions", async (req, res) => {

    // Check the request first. A bad one is turned away here, before it costs anything.
    const result = chatRequestSchema.safeParse(req.body)
    if (!result.success) {
        const problem = describeProblem(result.error)
        console.log(`Rejected bad request: ${problem.message}`)
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

    console.log(`Forwarding to Groq: ${result.data.model}`)
    const upstream = await createChatCompletion({
        baseUrl: GROQ_BASE_URL,
        apiKey: config.groqApiKey,
        body: result.data,
    })

    // Pass the provider's answer back untouched: same status code, same body.
    res.status(upstream.status).type("application/json").send(upstream.body)
    })

    return router
}