export function CodeSample() {
  const origin = window.location.origin

  return (
    <div className="code-card" aria-label="Example: pointing the OpenAI SDK at the gateway">
      <div className="code-bar">
        <span>app.js</span>
        <span>one line changes</span>
      </div>
      <pre>
        <span className="k">import</span>
        {" OpenAI "}
        <span className="k">from</span>
        {" "}
        <span className="s">"openai"</span>
        {"\n\n"}
        <span className="k">const</span>
        {" client = "}
        <span className="k">new</span>
        {" OpenAI({\n  "}
        <span className="hl">
          {"baseURL: "}
          <span className="s">{`"${origin}/v1"`}</span>
          {","}
        </span>
        {"\n  apiKey: process.env.GATEWAY_KEY,\n})\n\n"}
        <span className="k">const</span>
        {" reply = "}
        <span className="k">await</span>
        {" client.chat.completions.create({\n  model: "}
        <span className="s">"fast"</span>
        {",  "}
        <span className="c">// Groq, falls back to Gemini</span>
        {"\n  messages: [\n    { role: "}
        <span className="s">"user"</span>
        {", content: "}
        <span className="s">"Why is the sky blue?"</span>
        {" },\n  ],\n})"}
      </pre>
    </div>
  )
}
