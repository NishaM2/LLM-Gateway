import http from "node:http"
const status = Number(process.argv[2] ?? 500)
let first = null, n = 0
http.createServer((req, res) => {
  req.resume(); n += 1
  const now = Date.now(); if (first === null) first = now
  console.log(`attempt ${n} at +${now - first}ms`)
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: { message: `fake ${status}` } }))
}).listen(4010, () => console.log(`fake provider on 4010 answering ${status}`))
