// Hands back the provider's reply as it is, so the caller can either read it all at once
// or pass it on piece by piece while it is still arriving.
export function createChatCompletion(options: {
    baseUrl: string;
    apiKey: string;
    body: unknown;
}): Promise<Response> {
    return fetch(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(options.body),
    })
}