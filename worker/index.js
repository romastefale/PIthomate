import page from "./page.js";

const OPENAI_PREFIX = "/api/openai";
const OPENAI_BASE = "https://api.openai.com";
const WEB_ORIGIN = "https://romastefale.github.io";
const RAILWAY_ORIGIN = "https://pithomate.up.railway.app";
const WEB_ORIGINS = new Set([WEB_ORIGIN, RAILWAY_ORIGIN]);

function cors(request, response) {
  const origin = request.headers.get("origin");
  if (!WEB_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, openai-beta");
  headers.set("access-control-expose-headers", "openai-request-id, retry-after, x-should-retry");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", headers.has("vary") ? `${headers.get("vary")}, Origin` : "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function allowed(method, path) {
  if (method === "GET" && ["/v1/agents/sessions", "/v1/agents/vaults"].includes(path)) return true;
  if (method === "POST" && path === "/v1/agents/sessions") return true;
  if (method === "GET" && /^\/v1\/agents\/sessions\/[^/]+(?:\/(?:items|turns|artifacts))?$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/agents\/sessions\/[^/]+\/artifacts\/[^/]+\/content$/.test(path)) return true;
  if (method === "POST" && /^\/v1\/agents\/sessions\/[^/]+\/events$/.test(path)) return true;
  if (method === "GET" && /^\/v1\/agents\/vaults\/[^/]+\/credentials$/.test(path)) return true;
  return false;
}

async function proxyOpenAI(request, env) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith(`${OPENAI_PREFIX}/v1/`)) {
    return json({ error: { message: "Endpoint indisponível." } }, 404);
  }
  const path = incoming.pathname.slice(OPENAI_PREFIX.length);
  if (!allowed(request.method, path)) return json({ error: { message: "Endpoint não permitido no Pithomate." } }, 404);
  if (request.method === "POST" && /^\/v1\/agents\/sessions\/[^/]+\/events$/.test(path)) {
    let payload;
    try {
      payload = await request.clone().json();
    } catch {
      return json({ error: { message: "Evento inválido." } }, 400);
    }
    if (!Array.isArray(payload?.events) || payload.events.length !== 1 || payload.events[0]?.type !== "agent.session.input.cancel") {
      return json({ error: { message: "Somente o cancelamento da execução é permitido." } }, 404);
    }
  }
  const apiKey = env?.Chave_SK ?? globalThis.process?.env?.Chave_SK;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return json({
      error: {
        message: "A chave secreta Chave_SK não está configurada no Site.",
      },
    }, 503);
  }

  const headers = new Headers({
    authorization: `Bearer ${apiKey.trim()}`,
    accept: request.headers.get("accept") || "application/json",
    "openai-beta": "agents=v1",
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  try {
    const upstream = await fetch(`${OPENAI_BASE}${path}${incoming.search}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      signal: request.signal,
    });
    const responseHeaders = new Headers({
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    for (const name of ["openai-request-id", "retry-after", "x-should-retry"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return json({ error: { message: "Não foi possível alcançar a API da OpenAI." } }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${OPENAI_PREFIX}/`)) {
      if (request.method === "OPTIONS") {
        return cors(request, new Response(null, { status: 204 }));
      }
      return cors(request, await proxyOpenAI(request, env));
    }
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
