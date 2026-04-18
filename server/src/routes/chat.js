/**
 * POST /api/chat
 * Streams an SSE response containing LLM tokens + a final sources event.
 *
 * GET /api/chat/session/:sessionId
 * Returns the current session context (for client state restoration).
 */

import { Router } from 'express';
import { chatLimiter } from '../middleware/rateLimiter.js';
import { orchestrate } from '../services/orchestrator.js';
import {
  buildSystemPrompt,
  buildRAGPrompt,
  streamLLM,
  stripInvalidCitations,
  sseWrite,
} from '../services/llm.js';
import Session from '../models/Session.js';
import Message from '../models/Message.js';

const router = Router();

/**
 * POST /api/chat
 * Body: { sessionId?, query, disease, intent, location }
 */
router.post('/', chatLimiter, async (req, res) => {
  const { sessionId, query, disease, intent, location } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on Railway
  res.flushHeaders();

  // Keep-alive so Railway/Vercel don't time out during retrieval
  const keepAlive = setInterval(() => sseWrite(res, { type: 'ping' }), 15000);

  try {
    // ── Upsert session ───────────────────────────────────────────────────────
    let session;
    if (sessionId) {
      session = await Session.findById(sessionId);
    }
    if (!session) {
      session = await Session.create({
        contextEntities: buildContextEntities(disease, intent, location),
      });
    } else {
      // Merge new entities into existing context
      updateContextEntities(session, disease, intent, location);
      await session.save();
    }

    // ── Pull conversation memory (last 4 turns) ──────────────────────────────
    const recentMessages = await Message.find({ sessionId: session._id })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('role content -_id');
    const conversationMemory = recentMessages.reverse();

    // ── Persist user message ─────────────────────────────────────────────────
    const userMsg = await Message.create({
      sessionId: session._id,
      role: 'user',
      content: query,
    });
    session.messages.push(userMsg._id);
    await session.save();

    // Emit session ID so client can persist it
    sseWrite(res, { type: 'session', sessionId: session._id.toString() });
    sseWrite(res, { type: 'status', content: 'Retrieving biomedical evidence...' });

    // ── Resolve context (from session or request body) ───────────────────────
    const resolvedDisease = disease || getEntityValue(session, 'disease');
    const resolvedIntent = intent || getEntityValue(session, 'intent');
    const resolvedLocation = location || getEntityValue(session, 'location');

    // ── Orchestrate retrieval + re-rank ──────────────────────────────────────
    const { publications, trials, expandedQuery, meta } = await orchestrate({
      query,
      disease: resolvedDisease,
      intent: resolvedIntent,
      location: resolvedLocation,
      conversationMemory,
    });

    sseWrite(res, {
      type: 'status',
      content: `Found ${publications.length} publications, ${trials.length} trials. Generating response...`,
    });

    // ── Build source list for the prompt ────────────────────────────────────
    const sourcesForPrompt = [
      ...publications.map((p) => ({ ...p, _type: 'publication' })),
      ...trials.map((t) => ({ ...t, _type: 'trial', abstract: t.eligibility?.criteria })),
    ];

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRAGPrompt({
      disease: resolvedDisease,
      intent: resolvedIntent,
      location: resolvedLocation,
      query,
      conversationMemory,
      sources: sourcesForPrompt,
    });

    // ── Stream LLM response ──────────────────────────────────────────────────
    const startTs = Date.now();
    let fullText = await streamLLM(systemPrompt, userPrompt, res);

    // Post-gen: strip invalid citations
    fullText = stripInvalidCitations(fullText, sourcesForPrompt.length);

    const latencyMs = Date.now() - startTs;

    // ── Persist assistant message ────────────────────────────────────────────
    const pubMongoIds = publications.map((p) => p._mongoId).filter(Boolean);
    const trialMongoIds = trials.map((t) => t._mongoId).filter(Boolean);

    const assistantMsg = await Message.create({
      sessionId: session._id,
      role: 'assistant',
      content: fullText,
      retrievedDocs: pubMongoIds,
      retrievedTrials: trialMongoIds,
      queryMeta: { expandedQuery, latencyMs, llmModel: process.env.OLLAMA_MODEL || 'llama3.1' },
    });
    session.messages.push(assistantMsg._id);
    await session.save();

    // ── Emit final sources payload ───────────────────────────────────────────
    sseWrite(res, {
      type: 'sources',
      data: {
        publications: publications.map(sanitiseSource),
        trials: trials.map(sanitiseTrial),
        expandedQuery,
        meta: { ...meta, llmLatencyMs: latencyMs },
      },
    });

    sseWrite(res, { type: 'done' });
  } catch (err) {
    console.error('[Chat] Error:', err);
    sseWrite(res, { type: 'error', content: err.message || 'Internal error' });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContextEntities(disease, intent, location) {
  const entities = [];
  if (disease) entities.push({ type: 'disease', value: disease });
  if (intent) entities.push({ type: 'intent', value: intent });
  if (location) entities.push({ type: 'location', value: location });
  return entities;
}

function updateContextEntities(session, disease, intent, location) {
  const updates = [
    disease && { type: 'disease', value: disease },
    intent && { type: 'intent', value: intent },
    location && { type: 'location', value: location },
  ].filter(Boolean);

  for (const update of updates) {
    const existing = session.contextEntities.find((e) => e.type === update.type);
    if (existing) {
      existing.value = update.value;
    } else {
      session.contextEntities.push(update);
    }
  }
}

function getEntityValue(session, type) {
  return session.contextEntities.find((e) => e.type === type)?.value || '';
}

function sanitiseSource(doc) {
  return {
    externalId: doc.externalId,
    title: doc.title,
    authors: doc.authors?.slice(0, 3),
    year: doc.year,
    journal: doc.journal,
    url: doc.url,
    source: doc.source,
    abstract: doc.abstract?.slice(0, 500),
    citationCount: doc.citationCount,
    rankingRationale: doc.rankingRationale,
  };
}

function sanitiseTrial(trial) {
  return {
    nctId: trial.nctId,
    title: trial.title,
    status: trial.status,
    phase: trial.phase,
    eligibility: trial.eligibility,
    locations: trial.locations?.slice(0, 5),
    contacts: trial.contacts?.slice(0, 2),
    conditions: trial.conditions,
    url: trial.url,
    rankingRationale: trial.rankingRationale,
  };
}

export default router;
