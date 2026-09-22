// Talks to any service that speaks OpenAI's chat format. Groq is one of them.
export async function createChatCompletion(options: {
    baseUrl: string;
    apiKey: string;
    body: unknown;
}): Promise<{ status: number; body: string }> {
    const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(options.body),
    });

    return { status: response.status, body: await response.text() };
}