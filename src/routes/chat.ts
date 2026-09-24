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

        // text/event-stream means you're sending Server-Sent Events (SSE).
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8")

        // telling intermediaries not to cache or transform this stream.
        res.setHeader("Cache-Control", "no-cache, no-transform")

        // keeps the HTTP connection open while the AI is generating.
        res.setHeader("Connection", "keep-alive")

        // Stops proxies in front of the gateway from holding pieces back.
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders()

        const collected = createTextCollector()

        // Pass every piece on the moment it arrives. Never wait for the whole answer.
        for await (const chunk of upstream.body) {
            res.write(chunk)
            collected.add(chunk)
        }

        res.end()
        console.log(`Full answer (${collected.text.length} characters): ${collected.text}`)
    })

    return router
}

// Watches the pieces fly past and builds up the answer text without slowing them down
function createTextCollector() {
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    return {
        add(chunk: Uint8Array) {
            // A network piece can hold half an event, or several, so keep the leftover for next time.
            buffer += decoder.decode(chunk, { stream: true });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";

            for (const event of events) {
                for (const line of event.split(/\r?\n/)) {
                    if (!line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") continue;
                    try {
                        const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                        if (typeof piece === "string") text += piece;
                    } catch {
                        // One unreadable piece is not worth killing a live stream for.
                    }
                }
            }
        },
        get text() {
            return text;
        }
    }
}