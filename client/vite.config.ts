import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "")
  const gateway = process.env.GATEWAY_URL ?? `http://localhost:${env.PORT || "3000"}`
  const token = env.ADMIN_TOKEN?.trim()

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/stats": {
          target: gateway,
          changeOrigin: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          configure(proxy) {
            proxy.on("error", (_error, _req, res) => {
              if (!("writeHead" in res) || res.headersSent) return
              res.writeHead(502, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: { type: "gateway_unreachable", message: `Nothing is answering at ${gateway}` } }))
            })
          },
        },
      },
    },
  }
})
