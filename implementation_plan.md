# Curalink — AI Medical Research Assistant
## Implementation Plan v1.0

> **Scope**: Hackathon submission (5-day sprint). Full-stack MERN + Ollama/local LLM.

---

## Overview

Curalink is a retrieval-augmented-generation (RAG) system that:
1. Accepts structured or free-form medical queries
2. Fetches 50–300 candidates from OpenAlex, PubMed, and ClinicalTrials.gov in parallel
3. Re-ranks to ~14 top results using hybrid BM25 + embedding scoring
4. Feeds the re-ranked context into a **locally hosted LLM** (Ollama / Llama 3.1 8B)
5. Returns a **structured, source-attributed** response in a React chat interface with streaming

---

## User Review Required

> [!IMPORTANT]
> **Open Questions to resolve before Day 1**
> 1. **Session model**: Single-user demo (no auth) or multi-tenant (with userId)? Plan defaults to **single-user / anonymous** for the hackathon.
> 2. **LLM environment**: Will Ollama run on the demo machine, or should the fallback be a Hugging Face Inference Endpoint for the live demo? Plan uses **Ollama primary, HF as fallback**.
> 3. **PubMed API key**: Do you have an NCBI API key? Without one, rate limit is 3 req/s. Plan includes the polite-pool email parameter as a partial workaround.
> 4. **Deployment target**: Vercel (frontend) + Render/Railway (backend) + MongoDB Atlas? Plan assumes this stack.
> 5. **Ranking score visibility**: Expose ranking score to user in "Why this result?" tooltip? Plan exposes it.

> [!WARNING]
> Ollama **cannot run on Vercel/Render free tier** serverless functions due to memory and timeout limits. The backend must be deployed on a machine with enough RAM to hold a quantized 8B model (≥8 GB). Consider **Railway**, **Fly.io**, or a local tunnel (ngrok) for the demo.

---

## Proposed Changes

### Repository Scaffold

```
curalink/
├── client/                  # React (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── MessageBubble.jsx
│   │   │   ├── SourceCard.jsx
│   │   │   ├── TrialCard.jsx
│   │   │   ├── ContextForm.jsx
│   │   │   └── FilterBar.jsx
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   └── Chat.jsx
│   │   ├── hooks/
│   │   │   ├── useChat.js
│   │   │   └── useSession.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
│
├── server/                  # Express (Node.js)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── chat.js
│   │   │   └── sessions.js
│   │   ├── services/
│   │   │   ├── retrieval/
│   │   │   │   ├── openalex.js
│   │   │   │   ├── pubmed.js
│   │   │   │   └── clinicaltrials.js
│   │   │   ├── orchestrator.js
│   │   │   ├── reranker.js
│   │   │   ├── embedder.js
│   │   │   └── llm.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Session.js
│   │   │   ├── Message.js
│   │   │   ├── Document.js
│   │   │   └── Trial.js
│   │   ├── middleware/
│   │   │   ├── rateLimiter.js
│   │   │   └── errorHandler.js
│   │   └── index.js
│   └── package.json
│
├── .env.example
├── docker-compose.yml       # Mongo + Ollama (local dev)
└── README.md
```

---

### Phase 1 — Day 1: Scaffold + API Adapters

#### [NEW] `server/src/index.js`
- Express app entry point
- CORS, JSON body parser, `/api` router mount
- MongoDB connection via Mongoose

#### [NEW] `server/src/models/` (5 files)
Mongoose schemas matching the PRD data model:

| Model | Key Fields |
|---|---|
| `User` | `name, disease, location, createdAt` |
| `Session` | `userId, contextEntities[], messages[], createdAt` |
| `Message` | `sessionId, role, content, retrievedDocs[], createdAt` |
| `Document` | `source, externalId, title, abstract, authors, year, url, embedding[], fetchedAt, ttl` |
| `Trial` | `nctId, title, status, eligibility, locations, contacts, fetchedAt` |

#### [NEW] `server/src/services/retrieval/openalex.js`
```
fetchOpenAlex(query, disease, pageSize=100)
  → GET https://api.openalex.org/works
    ?search={expanded_query}
    &per-page={pageSize}
    &sort=relevance_score:desc
    &filter=from_publication_date:2018-01-01
    &mailto=you@email.com
  → normalize → [{id, title, abstract, authors, year, url, citations, source:"openalex"}]
```

#### [NEW] `server/src/services/retrieval/pubmed.js`
```
fetchPubMed(query, disease, maxResults=100)
  Step 1: esearch.fcgi → id list (up to 100)
  Step 2: batch efetch.fcgi (ids, rettype=xml) → xml2js parse
  → normalize → [{id, title, abstract, authors, year, url, journal, source:"pubmed"}]
  Rate: 3 req/s without key, 10 req/s with NCBI_API_KEY
```

#### [NEW] `server/src/services/retrieval/clinicaltrials.js`
```
fetchTrials(disease, location, pageSize=100)
  → GET https://clinicaltrials.gov/api/v2/studies
    ?query.cond={disease}
    &filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING
    &pageSize={pageSize}
    &format=json
  → normalize → [{nctId, title, status, eligibility, locations, contacts, source:"ct_gov"}]
```

---

### Phase 2 — Day 2: Orchestrator + Re-Ranker + LLM

#### [NEW] `server/src/services/orchestrator.js`
```
orchestrate(query, disease, intent, location, sessionContext)
  1. Query expansion: LLM rewrites → expanded_query
  2. Parallel fetch: Promise.allSettled([openAlex, pubmed, trials])
  3. Normalize & deduplicate by external ID
  4. Cache new docs to MongoDB (TTL 24h)
  5. Return {publications: [...], trials: [...]}
```

**Graceful degradation**: if one source fails, log + continue with the other two.

#### [NEW] `server/src/services/embedder.js`
- Uses `@xenova/transformers` (JS port of sentence-transformers)
- Model: `Xenova/all-MiniLM-L6-v2` (runs entirely in Node.js — no Python dep)
- Cache embeddings in MongoDB `Document.embedding` field

```js
embedText(text) → Float32Array (384-dim)
cosineSimilarity(vecA, vecB) → number
```

> [!NOTE]
> Using `@xenova/transformers` keeps the entire stack in Node.js. The first run downloads the model (~25 MB) — subsequent calls use the cache. Alternative: Python FastAPI microservice with `sentence-transformers` if you prefer Python.

#### [NEW] `server/src/services/reranker.js`
```
rerank(queryEmbedding, candidates, disease, intent)
  For each candidate:
    semanticScore  = cosineSimilarity(queryEmbedding, doc.embedding)
    recencyScore   = decayFunction(doc.year)           // linear decay from 2026
    credScore      = normalizeCitations(doc.citations) // 0–1, log-scaled
    intentScore    = intentMatch(doc.abstract, intent) // keyword overlap
    finalScore     = 0.55*semantic + 0.20*recency + 0.15*cred + 0.10*intent
  Sort desc → top 6–8 pubs + top 6–8 trials
  Attach rankingRationale: {semantic, recency, cred, intent} per doc
```

#### [NEW] `server/src/services/llm.js`
```
generateResponse(systemPrompt, userPrompt, sources)
  → POST http://localhost:11434/api/generate (Ollama)
      { model: "llama3.1", prompt, stream: true }
  → SSE stream → piped back to Express response
  Fallback: HF Inference API (open-access model) if Ollama unavailable
```

Prompt template enforces:
- Answer ONLY from provided `[S#]` sources
- Output must match structured sections (Condition Overview → Research Insights → Clinical Trials → Sources → Disclaimer)
- Post-generation citation validator strips any `[S#]` not in the provided set

---

### Phase 3 — Day 3: Chat API + Session + React UI

#### [NEW] `server/src/routes/chat.js`
```
POST /api/chat
  Body: { sessionId?, query, disease, intent, location }
  1. Upsert session + user context in MongoDB
  2. Append user message
  3. Call orchestrator → reranker
  4. Stream LLM response back via SSE
  5. Save assistant message + retrievedDocs refs
  Returns: SSE stream (token by token) + final sources JSON

GET /api/sessions/:id
  Returns full message history for session
```

#### [NEW] `client/src/` — React components (Vite)

| Component | Responsibility |
|---|---|
| `Landing.jsx` | Hero section + `ContextForm` (name, disease, intent, location) + "Start Research" CTA |
| `Chat.jsx` | Main chat page — renders `ChatWindow` + `FilterBar` + source side panel |
| `ChatWindow.jsx` | Message thread, auto-scroll, streaming token appender |
| `MessageBubble.jsx` | Renders structured response: overview, insights, trials, sources — with inline `[S1]` citation links |
| `SourceCard.jsx` | Title, authors, year, platform badge, link, "Why?" tooltip (ranking rationale) |
| `TrialCard.jsx` | Status pill (color-coded), eligibility accordion, location, contact |
| `FilterBar.jsx` | Date range slider, source checkbox (OpenAlex/PubMed/CT.gov), trial status filter |
| `ContextForm.jsx` | Structured input form (controlled) |
| `useChat.js` | Hook: SSE connection, message state, streaming accumulator |
| `useSession.js` | Hook: session ID persistence (localStorage), history fetch |

**Styling**: Clean clinical palette (white/steel-blue/slate). No TailwindCSS — plain CSS with CSS custom properties. Inter font via Google Fonts.

---

### Phase 4 — Day 4: Multi-Turn Context + Query Expansion + Polish

#### [MODIFY] `server/src/services/orchestrator.js`
- Read last N messages from session for `contextEntities`
- Detect entity shift (new disease mentioned) → trigger fresh retrieval
- Pass conversation memory to LLM prompt

#### [NEW] `server/src/services/queryExpander.js`
```
expandQuery(rawQuery, disease, intent, conversationMemory)
  → One LLM call with MeSH-style expansion prompt
  → Returns: expanded_query string
  Example: "deep brain stimulation" + disease:"Parkinson's"
    → "deep brain stimulation Parkinson's disease neuroprosthetics tremor therapy"
```

#### Source Attribution Polish
- Every inline `[S1]` in the response is a clickable anchor
- Clicking scrolls the side panel to and highlights the matching SourceCard
- Tooltip shows: `Semantic: 0.87 | Recency: 0.75 | Credibility: 0.60`

---

### Phase 5 — Day 5: Deployment + Logging + Demo Prep

#### Deployment Architecture

```
┌─────────────────────┐        ┌────────────────────────┐
│  Vercel             │        │  Railway / Fly.io       │
│  (React frontend)   │◄──────►│  (Express + Ollama)    │
│  HTTPS CDN          │        │  ≥ 8GB RAM instance     │
└─────────────────────┘        └──────────┬─────────────┘
                                          │
                               ┌──────────▼─────────────┐
                               │  MongoDB Atlas          │
                               │  (free M0 cluster)      │
                               └────────────────────────┘
```

#### [NEW] `server/src/middleware/rateLimiter.js`
- `express-rate-limit`: 30 requests / 10-minute window per IP
- PubMed-specific: internal queue limiting to 3 req/s (10 with key)

#### [NEW] Observability Logging
```
Each query logs:
  { queryId, query, disease, expandedQuery,
    retrievedIds: {openalex:[], pubmed:[], ct_gov:[]},
    rankedIds: [],
    llmModel, latencyMs, responseLength }
```
Stored in MongoDB `logs` collection. No external service required at hackathon stage.

#### [NEW] `docker-compose.yml` (local dev)
```yaml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes: ["~/.ollama:/root/.ollama"]
```

---

## Technology Decisions

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast HMR, PRD specifies React |
| Styling | Vanilla CSS + CSS custom props | PRD spec: clean clinical palette |
| Backend | Node.js + Express | PRD specifies MERN |
| Database | MongoDB + Mongoose | PRD specifies MongoDB |
| Embeddings | `@xenova/transformers` (JS) | No Python dep, runs in-process |
| LLM | Ollama (Llama 3.1 8B Q4) | PRD forbids hosted APIs; local |
| LLM Fallback | `mistralai/Mixtral-8x7B-Instruct` via HF Inference (free tier) | Demo fallback if Ollama unavailable |
| Streaming | Server-Sent Events (SSE) | Native fetch + EventSource, simple |
| Deployment | Vercel (FE) + Railway (BE) + Atlas | Free tiers, good CI/CD |
| XML parsing | `xml2js` | PRD explicitly mentions it |
| Rate limiting | `express-rate-limit` | Simple, no Redis needed at this scale |

---

## Day-by-Day Execution Plan

| Day | Focus | Key Deliverables |
|---|---|---|
| **D1** | Foundation | Repo scaffold, all 3 API adapters working, MongoDB schemas, `.env` wiring |
| **D2** | Intelligence layer | Embedder, re-ranker, Ollama LLM integration, orchestrator with graceful degradation |
| **D3** | Chat UI + API | SSE streaming chat route, React frontend (Landing → Chat flow), structured response rendering |
| **D4** | Multi-turn + polish | Context carry-forward, query expansion, citation anchors, "Why?" tooltips, FilterBar |
| **D5** | Deploy + Demo | Docker setup, Railway deploy, Vercel deploy, observability logging, Loom recording |

---

## Verification Plan

### Automated Tests (Jest)
```bash
# API adapter unit tests (mock HTTP)
npm test server/src/services/retrieval/

# Re-ranker logic test
npm test server/src/services/reranker.js

# Integration test: full pipeline with seed query
npm test server/src/integration/pipeline.test.js
```

### Manual Verification Checklist
- [ ] Query: "Parkinson's + Deep Brain Stimulation + Toronto" → returns ≥6 pubs, ≥3 trials, sources cited
- [ ] Follow-up: "What are the side effects?" → retains Parkinson's context, no fresh structured form needed
- [ ] Kill one API source → remaining two still respond (graceful degradation)
- [ ] Citation `[S3]` in response → clicking scrolls to SourceCard #3
- [ ] "Why ranked?" tooltip shows numeric component scores
- [ ] Response arrives with first token in ≤ 5s (streaming perception); full response ≤ 20s

### Browser E2E (via browser_subagent after deployment)
- Land on homepage → fill form → navigate to chat
- Send query → verify streaming renders token-by-token
- Verify SourceCards appear in side panel
- Verify TrialCard shows status pill + eligibility accordion

---

## Risk Mitigations (from PRD §15)

| Risk | Plan Mitigation |
|---|---|
| PubMed XML parse bugs | `xml2js` with strict schema; fallback to PubMed abstract-only fields |
| LLM hallucination | Post-gen citation stripper; system prompt with hard constraints |
| API rate limits | Internal queues, TTL cache, polite-pool email, exponential backoff |
| Local LLM latency | Q4_K_M quantized 8B; streaming so user sees progress; optional HF fallback |
| Scope creep | This plan is locked to PRD v1.0 scope; all future items deferred to v2 |

---

*End of Implementation Plan — Curalink v1.0*
