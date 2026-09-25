import http from "node:http";\nimport { Readable } from "node:stream";
import worker from "./dist/server/index.js";

const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined && key !== "connection" && key !== "transfer-encoding") {
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    const host = headers.get("host") || "localhost";
    const method = req.method || "GET";
    const chunks = [];
    if (method !== "GET" && method !== "HEAD") {
      for await (const chunk of req) chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const input = new Request(new URL(req.url || "/", `http://${host}`), {
      method,
      headers,
      ...(body ? { body } : {}),
    });
    const output = await worker.fetch(input, process.env);
    res.writeHead(output.status, Object.fromEntries(output.headers));
    if (!output.body) {
      res.end();
      return;
    }
    Readable.fromWeb(output.body).pipe(res);
  } catch {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Erro interno.");
  }
}).listen(port, "0.0.0.0");
