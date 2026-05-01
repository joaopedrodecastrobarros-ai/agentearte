import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { agents } from "./agents/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

async function callClaude(systemPrompt, userPrompt, apiKey) {
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
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// Rota: listar agentes disponíveis
app.get("/api/agents", (req, res) => {
  res.json(
    Object.entries(agents).map(([id, agent]) => ({
      id,
      name: agent.name,
      role: agent.role,
      icon: agent.icon,
      description: agent.description,
    }))
  );
});

// Rota: executar um agente específico
app.post("/api/run/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const { prompt, apiKey } = req.body;

  if (!prompt || !apiKey) {
    return res.status(400).json({ error: "prompt e apiKey são obrigatórios" });
  }

  const agent = agents[agentId];
  if (!agent) {
    return res.status(404).json({ error: "Agente não encontrado" });
  }

  try {
    const result = await callClaude(agent.system, prompt, apiKey);
    res.json({ agent: agent.name, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rota: executar squad completo (pipeline)
app.post("/api/run/squad/full", async (req, res) => {
  const { prompt, apiKey, pipeline = ["estrategista", "ux", "visual", "copy", "revisor"] } = req.body;

  if (!prompt || !apiKey) {
    return res.status(400).json({ error: "prompt e apiKey são obrigatórios" });
  }

  // SSE para streaming de progresso
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let context = `Briefing original do cliente: ${prompt}\n\n`;
  const outputs = {};

  for (const agentId of pipeline) {
    const agent = agents[agentId];
    if (!agent) continue;

    send({ type: "agent_start", agentId, agentName: agent.name });

    try {
      const userPrompt = `${context}\n\nSua tarefa como ${agent.name}: ${prompt}`;
      const result = await callClaude(agent.system, userPrompt, apiKey);
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
