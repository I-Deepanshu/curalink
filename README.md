# Curalink — AI Medical Research Assistant

> Full-stack MERN + Ollama RAG application for biomedical literature research.

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- Docker (for MongoDB + Ollama)
- Ollama installed locally OR Docker running

### 1. Clone & install

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 2. Pull Ollama models

```bash
docker compose up -d
docker exec curalink_ollama ollama pull llama3.1
docker exec curalink_ollama ollama pull nomic-embed-text
```

### 3. Configure environment

```bash
cp .env.example server/.env
# Edit server/.env with your MongoDB URI, NCBI API key, and HF token
```

### 4. Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

App available at: http://localhost:5173

---

## Architecture

```
React (Vite) ─── Express (Node.js) ─── MongoDB Atlas
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
       OpenAlex      PubMed     ClinicalTrials.gov
           └────────────┼────────────┘
                        ▼
                   Re-ranker
                 (BM25 + cosine)
                        ▼
                  Ollama LLM
                (llama3.1 8B Q4)
```

## Deployment

### Backend → Railway
1. Connect GitHub repo to Railway
2. Set root directory to `server/`
3. Set environment variables from `.env.example`
4. Ensure instance has ≥ 8GB RAM for Ollama

### Frontend → Vercel
1. Connect GitHub repo to Vercel
2. Set root directory to `client/`
3. Set `VITE_API_URL` to your Railway backend URL

### Database → MongoDB Atlas
- Create free M0 cluster
- Add connection URI to `MONGODB_URI` env var

---

## Demo Queries (Hackathon Checklist)

1. Disease: `Parkinson's disease` · Intent: `treatment` · Location: `Toronto` · Query: `Deep brain stimulation outcomes`
2. Query: `Latest treatment for lung cancer`
3. Follow-up (same session): `Can I take Vitamin D?` ← tests multi-turn context
4. Disease: `Alzheimer's disease` · Intent: `research`
5. Disease: `Type 2 diabetes` · Intent: `clinical trial` · Location: `New York`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, react-router-dom, react-markdown |
| Backend | Node.js 18, Express 4, Mongoose 8 |
| Database | MongoDB Atlas (M0 free) |
| LLM | Ollama + Llama 3.1 8B (primary) / HF Inference (fallback) |
| Embeddings | Ollama nomic-embed-text (primary) / TF-IDF (fallback) |
| Retrieval | OpenAlex, PubMed E-utilities, ClinicalTrials.gov v2 |
| Deployment | Railway (backend) + Vercel (frontend) |

---

*No OpenAI / Gemini / Anthropic APIs are used.*
