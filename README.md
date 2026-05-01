# Design Squad

Plataforma web com time de agentes de IA especializados em design.  
Você manda o briefing → o squad produz em pipeline.

## Agentes

| Agente | Função |
|--------|--------|
| Estrategista | Conceito, público, tom, objetivos |
| UX Designer | Fluxo, wireframe, arquitetura de informação |
| Visual Designer | UI, cores, tipografia, protótipo HTML |
| Copywriter | Headlines, textos, CTAs, microcopy |
| Revisor | QA, refinamento, versão final |

---

## Rodar localmente

**Pré-requisito:** Node.js 18+

```bash
npm install
npm start
```

Acesse: http://localhost:3000

Cole sua Anthropic API key na barra lateral e mande o briefing.

---

## Deploy grátis no Railway

1. Crie conta em https://railway.app
2. Novo projeto → Deploy from GitHub
3. Suba esta pasta no GitHub primeiro
4. Configure a variável de ambiente `PORT=3000` (opcional, já tem default)
5. Deploy automático ✓

URL pública gerada automaticamente.

---

## Deploy grátis no Render

1. Crie conta em https://render.com
2. New Web Service → Connect GitHub repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Free tier ✓

---

## Deploy no VPS / servidor próprio

```bash
# Instale pm2 para manter o servidor rodando
npm install -g pm2

npm install
pm2 start server.js --name design-squad
pm2 save
pm2 startup
```

Com nginx como proxy reverso apontando para localhost:3000.

---

## API

### Listar agentes
```
GET /api/agents
```

### Rodar agente único
```
POST /api/run/:agentId
Body: { "prompt": "...", "apiKey": "sk-ant-..." }
```

### Rodar squad completo (SSE streaming)
```
POST /api/run/squad/full
Body: { "prompt": "...", "apiKey": "sk-ant-..." }
```

Retorna Server-Sent Events com progresso em tempo real.

---

## Segurança

A API key é enviada pelo frontend para o backend a cada requisição.  
Para produção com múltiplos usuários, configure autenticação e guarde a key como variável de ambiente no servidor.
