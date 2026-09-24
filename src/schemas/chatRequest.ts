import { z } from "zod"
const roles = ["system", "developer", "user", "assistant", "tool"] as const

const message = z.looseObject({
    role: z.enum(roles, { error: `must be one of: ${roles.join(", ")}`})
})

// Checks only what the gateway relies on. Every other field (max_tokens, temperature, tools...)
// passes through untouched, so the gateway never rejects a request the provider would accept.

export const chatRequestSchema = z.looseObject(
    {
        model: z.string({ error: "is required and must be text" }).min(1, { error: "must not be empty" }),
        messages: z
            .array(message, { error: "is required and must be a list of messages" })
            .min(1, { error: "must contain at least one message" }),
        stream: z.boolean({ error: "must be true or false" }).optional(),
    },
    { error: "The request body must be a JSON object" },
)

// Turns zod report into one sentence describing the error
export function describeProblem(error: z.ZodError): { message: string; param: string } {
    const issue = error.issues[0];
    if (!issue) {
        return { message: "Invalid request", param: "" }
    }
    const param = issue.path.join(".")
    return { message: param ? `${param} ${issue.message}` : issue.message, param }
}