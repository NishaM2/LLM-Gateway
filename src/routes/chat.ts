import express from "express";
import type { Config } from "../config.ts";
import { createChatCompletion } from "../providers/openai.ts";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1"

export function chatRouter(config: Config): express.Router {
    const router = express.Router()

    router.post("/v1/chat/completions", async (req, res) => {
        const upstream = await createChatCompletion({
            baseUrl: GROQ_BASE_URL,
            apiKey: config.groqApiKey,
            body: req.body,
        })

    res.status(upstream.status).type("application/json").send(upstream.body)
    })

    return router
}