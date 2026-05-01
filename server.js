import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { agents } from "./agents/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Faz fetch do site do cliente e extrai texto + meta
async function fetchWebsite(url) {
  try {
    if (!url.startsWith("http")) url = "https://" + url;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DesignSquadBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    // Extrai texto limpo removendo tags
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    // Extrai cores CSS
    const colorMatches = html.match(/#[0-9a-fA-F]{3,6}/g) || [];
    const colors = [...new Set(colorMatches)].slice(0, 20);
    // Extrai meta description e title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)/i);
    return {
      title: titleMatch?.[1]?.trim() || "",
      description: descMatch?.[1]?.trim() || "",
      colors,
      text,
    };
  } catch (e) {
    return null;
  }
}

// Chama Claude com suporte a imagens (base64)
async function callClaude(systemPrompt, userPrompt, apiKey, images = []) {
  const content = [];

  // Adiciona imagens de referência se houver
  if (images && images.length > 0) {
    for (const img of images) {
      const [meta, data] = img.split(",");
      const mediaType = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
    }
    content.push({ type: "text", text: `[Acima estão ${images.length} imagem(ns) de referência visual da marca do cliente. Analise cores, estilo, fontes e composição.]\n\n${userPrompt}` });
  } else {
    content.push({ type: "text", text: userPrompt });
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// Rota: fetch do site do cliente
app.post("/api/fetch-site", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL obrigatória" });
  const data = await fetchWebsite(url);
  if (!data) return res.status(422).json({ error: "Não foi possível acessar o site" });
  res.json(data);
});

// Rota: executar agente único
app.post("/api/run/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const { prompt, apiKey, images } = req.body;

  if (!prompt || !apiKey) return res.status(400).json({ error: "prompt e apiKey são obrigatórios" });

  const agent = agents[agentId];
  if (!agent) return res.status(404).json({ error: "Agente não encontrado" });

  try {
    const result = await callClaude(agent.system, prompt, apiKey, images);
    res.json({ agent: agent.name, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rota: squad completo (SSE)
app.post("/api/run/squad/full", async (req, res) => {
  const { prompt, apiKey, images, pipeline = ["estrategista", "ux", "visual", "copy", "revisor"] } = req.body;

  if (!prompt || !apiKey) return res.status(400).json({ error: "prompt e apiKey são obrigatórios" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let context = prompt;
  const outputs = {};

  for (const agentId of pipeline) {
    const agent = agents[agentId];
    if (!agent) continue;

    send({ type: "agent_start", agentId, agentName: agent.name });

    try {
      // Imagens só para o visual designer
      const agentImages = agentId === "visual" ? images : [];
      const userPrompt = `${context}\n\nSua tarefa como ${agent.name}:`;
      const result = await callClaude(agent.system, userPrompt, apiKey, agentImages);
      outputs[agentId] = result;
      context += `\n\n--- Entrega do ${agent.name} ---\n${result}\n`;
      send({ type: "agent_done", agentId, agentName: agent.name, result });
    } catch (e) {
      send({ type: "agent_error", agentId, agentName: agent.name, error: e.message });
      break;
    }
  }

  send({ type: "done", outputs });
  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎨 Design Squad rodando em http://localhost:${PORT}\n`);
});
