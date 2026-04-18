# Product Requirements Document (PRD)
## Curalink — AI Medical Research Assistant

| Field | Value |
|---|---|
| **Product Name** | Curalink |
| **Document Version** | 1.0 |
| **Date** | 2026-04-17 |
| **Status** | Draft — Hackathon Submission |
| **Author** | Kartik Garg |
| **Type** | Full-stack MERN + Custom LLM Application |

---

## 1. Executive Summary

Curalink is a full-stack, AI-powered **Medical Research Assistant** that acts as a personal health-research companion. It ingests a user's medical context (disease, intent, optional location), retrieves high-quality biomedical evidence from **OpenAlex**, **PubMed**, and **ClinicalTrials.gov**, reasons over the retrieved corpus using a **custom open-source LLM**, and returns **structured, source-attributed, personalized** answers that hold up across multi-turn conversations.

Unlike a generic chatbot, Curalink is a **retrieval + reasoning system**: depth-first retrieval (50–300 candidates), precision-driven re-ranking, and grounded generation with strict source attribution.

---

## 2. Problem Statement

Patients, caregivers, and early-stage researchers struggle to navigate biomedical literature:

- **Fragmentation**: Relevant evidence is split across PubMed, OpenAlex, and ClinicalTrials.gov — no single pane of glass.
- **Generic LLM responses**: Off-the-shelf chatbots produce confident but unsourced, often hallucinated medical content.
- **Shallow retrieval**: Most tools return the top 1–2 results without re-ranking for relevance, recency, or credibility.
- **No context continuity**: Follow-up questions lose prior disease context, forcing users to repeat themselves.
- **No personalization**: Answers ignore the user's condition and intent.

**Curalink solves this** by combining broad retrieval, intelligent re-ranking, custom LLM reasoning, and conversational memory — all source-attributed.

---

## 3. Goals and Non-Goals

### 3.1 Goals
1. Deliver a working MERN-stack application with a conversational UI.
2. Perform **depth-first retrieval** (50–300 candidates) across 3 mandatory sources.
3. Re-rank to a top-6–8 final set using relevance, recency, and credibility.
4. Use a **custom/open-source LLM** (Ollama / Hugging Face / local) — **no** hosted API calls to OpenAI/Gemini/Anthropic.
5. Maintain multi-turn conversational context.
6. Produce **structured, source-attributed** answers (Condition Overview → Research Insights → Trials → Sources).
7. Ship a live deployment + Loom walkthrough.

### 3.2 Non-Goals
- Providing clinical diagnosis or prescriptive medical advice (disclaimer required).
- Real-time EHR/EMR integration.
- HIPAA compliance at hackathon stage (design considerations only).
- Mobile-native apps (responsive web is sufficient).
- Replacing physician judgement.

---

## 4. Target Users & Personas

| Persona | Description | Primary Need |
|---|---|---|
| **Patient / Caregiver** | Newly diagnosed, researching condition & treatments | Plain-language, source-backed answers |
| **Early-stage Researcher** | Grad student / junior clinician scanning literature | Broad candidate pool + filtering |
| **Clinician (secondary)** | Wants quick evidence lookup during consult prep | Trial recruitment status, eligibility |

---

## 5. User Stories

1. **As a patient**, I enter my name, disease (Parkinson's), intent (Deep Brain Stimulation), and city (Toronto), so I get publications AND trials specific to my context.
2. **As a user**, I ask "Latest treatment for lung cancer" and receive an overview, top studies, active trials, and citations — not a generic paragraph.
3. **As a user**, after asking about lung cancer, I ask "Can I take Vitamin D?" — the system retains context and grounds the answer in lung-cancer-specific studies.
4. **As a researcher**, I see why each result was ranked highly (recency, citation count, source).
5. **As a user**, every claim in the answer links to a retrievable source with title, authors, year, URL.

---

## 6. Functional Requirements

### FR-1. Input Handling
- Accept **structured input**: patient name, disease, additional query, location.
- Accept **natural-language input**: free-form questions.
- Perform **intelligent query expansion** (e.g., `"deep brain stimulation"` → `"deep brain stimulation + Parkinson's disease"`).

### FR-2. Retrieval Layer — Mandatory Sources

#### FR-2.1 OpenAlex (Publications)
- Endpoint: `https://api.openalex.org/works`
- Params: `search`, `per-page` (up to 200), `page`, `sort=relevance_score:desc` or `publication_date:desc`, `filter=from_publication_date:...,to_publication_date:...`

#### FR-2.2 PubMed (Publications)
- Two-step: `esearch.fcgi` → ID list → `efetch.fcgi` → XML details.
- Parse title, abstract, authors, journal, year.

#### FR-2.3 ClinicalTrials.gov v2 (Trials)
- Endpoint: `https://clinicaltrials.gov/api/v2/studies`
- Params: `query.cond`, `filter.overallStatus`, `pageSize`, `format=json`.
- Capture: title, recruiting status, eligibility criteria, location, contact info.

#### FR-2.4 Retrieval Depth
- **Must** pull broad candidate pool: **50–300** results per source.
- **Must not** rely on top-1–2 shortcuts.

### FR-3. Re-Ranking Pipeline
- Inputs: candidate pool from all sources.
- Signals:
  - Semantic relevance (embeddings or hybrid BM25 + embeddings).
  - Recency (publication date decay).
  - Source credibility (journal impact, citation count for OpenAlex, trial phase for CT.gov).
  - Query-intent match (treatment vs diagnosis vs prognosis).
- Output: top **6–8** publications and top **6–8** trials for final response.

### FR-4. Custom LLM Reasoning
- **Allowed**: Ollama (Llama 3, Mistral, Phi-3), Hugging Face open-source models, locally-hosted inference.
- **Forbidden**: OpenAI / Gemini / Anthropic / any closed hosted API.
- LLM responsibilities:
  - Understand disease + intent.
  - Synthesize publications + trials into coherent narrative.
  - Refuse to speculate beyond retrieved sources (anti-hallucination prompt design).
  - Emit structured output (see FR-6).

### FR-5. Multi-Turn Context
- Persist conversation history per session (MongoDB).
- Carry forward disease/entity context into follow-ups.
- Trigger fresh retrieval when intent shifts or new entities appear.

### FR-6. Structured Response Format
Every answer must include:
1. **Condition Overview** — 2–3 sentence plain-language summary.
2. **Research Insights** — bulleted findings from publications.
3. **Clinical Trials** — active/relevant trials with status + eligibility + location.
4. **Source Attribution** — per cited item: title, authors, year, platform, URL, supporting snippet.
5. **Safety Disclaimer** — "informational, not medical advice".

### FR-7. Personalization
- Track user's stated condition across session.
- Frame answers relative to that condition ("Based on studies in lung cancer patients…").

### FR-8. UI (React)
- Chat-style interface with streaming responses.
- Side panel listing retrieved publications and trials as cards.
- Filters: date range, source, trial status.
- "Why this result?" tooltip showing ranking rationale.
- Structured-input form + free-text toggle.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | End-to-end query → response in ≤ 20s for typical query. |
| **Scalability** | Stateless backend; retrieval cache (Redis/Mongo) to reduce API pressure. |
| **Reliability** | Graceful degradation if one source fails (continue with remaining two). |
| **Transparency** | Every LLM claim must be traceable to a retrieved source. |
| **Accessibility** | WCAG AA contrast; keyboard navigable chat. |
| **Deployment** | Publicly accessible URL. No broken links. |
| **Observability** | Basic logging of query → retrieved IDs → ranked IDs → response. |

---

## 8. System Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  React UI    │◄───►│  Express API │◄───►│  Retrieval Orchestr. │
│  (chat +     │     │  (Node.js)   │     │  (parallel fetch)    │
│   cards)     │     └──────┬───────┘     └──────┬───────────────┘
└──────────────┘            │                    │
                            │                    ├──► OpenAlex
                            │                    ├──► PubMed (esearch+efetch)
                            │                    └──► ClinicalTrials.gov v2
                            │
                            ▼
                     ┌──────────────┐     ┌──────────────────────┐
                     │   MongoDB    │     │  Re-ranker           │
                     │ (sessions,   │     │  (embeddings +       │
                     │  cache,      │     │   recency + cred.)   │
                     │  history)    │     └──────┬───────────────┘
                     └──────────────┘            │
                                                 ▼
                                         ┌──────────────────┐
                                         │  Custom LLM      │
                                         │  (Ollama / HF)   │
                                         │  grounded RAG    │
                                         └──────────────────┘
```

### Component Responsibilities
- **React UI**: Chat, structured-input form, result cards, filters, source popover.
- **Express API**: Session mgmt, orchestration, rate limiting.
- **Retrieval Orchestrator**: Parallel async fetch from all 3 APIs, normalization to common schema.
- **Re-ranker**: Hybrid (BM25 + sentence-transformers embeddings) → weighted score.
- **LLM Layer**: Prompt template with retrieved context, structured output parsing.
- **MongoDB**: Users, sessions, message history, retrieved-document cache (TTL).

---

## 9. Data Model (MongoDB)

```js
// users
{ _id, name, disease, location, createdAt }

// sessions
{ _id, userId, contextEntities: [{type, value}], messages: [messageId], createdAt }

// messages
{ _id, sessionId, role: "user"|"assistant", content, retrievedDocs: [docId], createdAt }

// documents (cache)
{ _id, source: "openalex"|"pubmed"|"ct_gov", externalId, title, abstract,
  authors, year, url, raw, fetchedAt, ttl }

// trials
{ _id, nctId, title, status, eligibility, locations, contacts, raw, fetchedAt }
```

---

## 10. LLM & Prompt Strategy

### 10.1 Model Selection
- **Primary**: Llama 3.1 8B (Ollama) — good reasoning, runs locally.
- **Fallback**: Mistral 7B Instruct or Phi-3 for constrained environments.
- **Embedding model**: `sentence-transformers/all-MiniLM-L6-v2` (local, 384-dim).

### 10.2 Prompt Template (abridged)
```
SYSTEM: You are Curalink, a medical research assistant. Answer ONLY from
the provided sources. Cite inline as [S1], [S2]. If evidence is insufficient,
say so. Never invent studies, trial IDs, or statistics.

CONTEXT:
- User disease: {{disease}}
- User intent: {{intent}}
- Location: {{location}}
- Conversation memory: {{last_n_turns}}

SOURCES:
[S1] {{title}} — {{authors}} ({{year}}) — {{platform}} — {{url}}
     Snippet: {{top_matching_chunk}}
... (top 6–8 pubs + 6–8 trials)

TASK: Produce a structured response with sections:
1. Condition Overview
2. Research Insights (cite [S#])
3. Clinical Trials (status, eligibility, location)
4. Sources (full list)
5. Disclaimer

USER QUESTION: {{query}}
```

### 10.3 Anti-Hallucination Safeguards
- Constrained decoding: source IDs must match provided list.
- Post-generation check: strip any citation not in the source set.
- Refuse-to-answer fallback when candidate pool is empty.

---

## 11. Retrieval & Chunking Strategy

| Stage | Technique | Rationale |
|---|---|---|
| **Query expansion** | LLM rewrites with disease context + MeSH-like terms | Combines free-text with structured medical vocab |
| **Candidate fetch** | Parallel API calls, 50–100 per source | Depth before precision |
| **Chunking** | Abstract-level chunks (no split) for pubs; field-level for trials | Abstracts are already atomic units |
| **Embedding** | MiniLM, cached in MongoDB | Cheap, local, good enough for re-rank |
| **Re-rank score** | `0.55 * cosine + 0.20 * recency + 0.15 * credibility + 0.10 * intent_match` | Weights tunable post-demo |
| **Final cut** | Top 6–8 pubs + 6–8 trials | Keeps LLM context tight |

---

## 12. API Integration Specs

See hackathon brief for exact endpoints. Implementation notes:
- **PubMed**: rate-limit 3 req/s (no key) or 10 req/s (with key) — batch ID fetches.
- **OpenAlex**: include `mailto=` param for polite pool (higher quotas).
- **ClinicalTrials.gov v2**: use `filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING` for most actionable results.
- **Retry policy**: exponential backoff, 3 tries per source; degrade gracefully.

---

## 13. UI/UX Requirements

### 13.1 Screens
1. **Landing**: brief pitch + structured-input form + "Start Chat" CTA.
2. **Chat**: message thread, streaming response, side panel of source cards.
3. **Source Card**: title, authors, year, platform badge, URL, "why ranked" tooltip.
4. **Trial Card**: status pill, eligibility accordion, location, contact.
5. **Session History**: prior conversations grouped by disease.

### 13.2 Design Principles
- Clean, clinical, white/blue palette — no flashy gradients.
- Visible disclaimer on every response.
- Inline citations `[S1]` clickable → scrolls to source card.

---

## 14. Evaluation Criteria Alignment

| Criterion | How Curalink Addresses |
|---|---|
| **AI pipeline quality** | Hybrid retrieval + re-rank + grounded LLM |
| **Retrieval/ranking accuracy** | Depth-first 50–300, weighted re-rank, source-cred signals |
| **Engineering depth** | MERN + embeddings + cache + parallel fetch + session mgmt |
| **Usability** | Structured + NL input, streaming UI, source popovers |
| **Demo clarity** | Loom covering arch, pipeline, chunking, LLM choice, live demo |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PubMed XML parsing bugs | Med | High | Use `xml2js`, robust schema tests |
| LLM hallucination | Med | High | Strict grounded prompt + post-gen citation check |
| API rate limits during demo | Med | Med | Redis cache + polite-pool email |
| Local LLM latency | High | Med | 8B quantized model, streaming tokens |
| Irrelevant trials by location | Med | Low | Soft-filter by location, don't hard-exclude |
| Scope creep | High | Med | Lock scope to this PRD; defer extras to v2 |

---

## 16. Milestones & Timeline (Hackathon Scope)

| Day | Deliverable |
|---|---|
| **D1** | Repo scaffold (MERN), API adapters for OpenAlex/PubMed/CT.gov, schema |
| **D2** | Retrieval orchestrator + re-ranker (MVP weights), Ollama wired up |
| **D3** | Chat UI, session persistence, structured response rendering |
| **D4** | Multi-turn context, query expansion, source attribution polish |
| **D5** | Deployment, Loom recording, demo dry-run |

---

## 17. Deliverables (Submission Checklist)

- [ ] **Live deployed URL** (frontend + backend reachable)
- [ ] **Loom video** covering architecture, pipeline, chunking, LLM choice, live demo
- [ ] Demo with sample queries: Parkinson's + DBS, lung cancer treatments, diabetes trials, Alzheimer's researchers
- [ ] Visible source attribution in every response
- [ ] Multi-turn context demo (lung cancer → Vitamin D follow-up)

---

## 18. Future Work (Post-Hackathon)

- Clinician-facing mode with stronger domain vocab.
- PDF full-text retrieval via Unpaywall / PMC OA.
- Fine-tuned domain LLM on biomedical corpus.
- User accounts + saved research folders.
- HIPAA-conscious deployment architecture.
- Mobile app + voice interface.

---

## 19. Open Questions

1. Single-user vs multi-tenant session model for demo?
2. Should we cache PubMed XML raw or only normalized fields?
3. Hard location filter on trials, or soft-rank?
4. How aggressive should query expansion be — one rewrite or ensemble?
5. Do we expose the ranking score to the user or keep it internal?

---

*End of PRD — Curalink v1.0*
