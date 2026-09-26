import express from "express";
import type { Config } from "../config.ts";
import { createChatCompletion, describeCause, describeProviderFailure } from "../providers/openai.ts";
import { chatRequestSchema, describeProblem } from "../schemas/chatRequest.ts";
import { note } from "../services/requestLogger.ts";

// For now every request goes to Groq. Week 2 adds a router that can pick a provider.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function chatRouter(config: Config): express.Router {
  const router = express.Router();

  // Same path as OpenAI's API, so any OpenAI SDK can use the gateway by changing only its base URL.
  router.post("/v1/chat/completions", async (req, res) => {
    // Check the request first. A bad one is turned away here, before it costs anything.
    const result = chatRequestSchema.safeParse(req.body);
    if (!result.success) {
      const problem = describeProblem(result.error);
      console.log(`Rejected bad request: ${problem.message}`);
      note(res, { status: "error", errorCode: "invalid_request" });
      // Same error shape OpenAI uses, so OpenAI SDKs can read it.
      res.status(400).json({
        error: {
          message: problem.message,
          type: "invalid_request_error",
          param: problem.param || null,
          code: null,
        },
      });
      return;
    }

    const wantsStream = result.data.stream === true;
    // Remember these now, so even a failure later is logged against the right model.
    note(res, { modelRequested: result.data.model, provider: "groq" });
    console.log(`Forwarding to Groq: ${result.data.model}${wantsStream ? " (streaming)" : ""}`);

    // If this fails to reach the provider at all, it throws and the error handler answers.
    const upstream = await createChatCompletion({
      baseUrl: GROQ_BASE_URL,
      apiKey: config.groqApiKey,
      body: result.data,
    });

    // A failed request answers with ordinary JSON even when streaming was asked for.
    if (!upstream.ok) {
      throw describeProviderFailure(upstream.status, await upstream.text());
    }

    if (!wantsStream || !upstream.body) {
      const body = await upstream.text();
      res.status(upstream.status).type("application/json").send(body);
      return;
    }

    // Open the stream to the caller before any text has arrived.
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Stops proxies in front of the gateway from holding pieces back.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const collected = createTextCollector();

    // Read the answer one piece at a time. Holding the reader ourselves is what lets us
    // stop early further down.
    const reader = upstream.body.getReader();

    // If the caller hangs up, stop pulling from the provider instead of paying for
    // an answer nobody will read.
    let callerLeft = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        callerLeft = true;
        void reader.cancel().catch(() => {});
      }
    });

    try {
      // Pass every piece on the moment it arrives, then keep a copy for ourselves.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        collected.add(value);
      }

      // Cancelling the reader ends the loop quietly, so check before calling this a full answer.
      if (callerLeft) {
        note(res, { status: "error", errorCode: "caller_hung_up" });
        console.log(`Caller hung up after ${collected.text.length} characters. Stopped the provider.`);
        return;
      }

      res.end();
      console.log(`Full answer (${collected.text.length} characters): ${collected.text}`);
    } catch (error) {
      if (callerLeft) {
        note(res, { status: "error", errorCode: "caller_hung_up" });
        console.log(`Caller hung up after ${collected.text.length} characters. Stopped the provider.`);
        return;
      }

      // The caller already holds part of the answer, so the status cannot be changed now.
      // All we can do is say the stream broke, and never keep an incomplete answer.
      note(res, { status: "error", errorCode: "stream_broken" });
      console.error(`Stream broke after ${collected.text.length} characters: ${describeCause(error)}`);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: { message: "The stream ended early.", type: "upstream_error" } })}\n\n`);
        res.end();
      }
    }
  });

  return router;
}

// Watches the pieces fly past and builds up the answer text without slowing them down.
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
    },
  };
}