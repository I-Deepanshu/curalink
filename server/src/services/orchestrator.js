/**
 * Retrieval Orchestrator.
 *
 * 1. Expand query  
 * 2. Parallel fetch from OpenAlex + PubMed + ClinicalTrials.gov  
 * 3. Cache new documents in MongoDB  
 * 4. Embed + re-rank  
 * 5. Return top pubs + top trials  
 *
 * Gracefully degrades: if one source fails, the others still contribute.
 */

import { fetchOpenAlex } from './retrieval/openalex.js';
import { fetchPubMed } from './retrieval/pubmed.js';
import { fetchTrials } from './retrieval/clinicaltrials.js';
import { expandQuery } from './queryExpander.js';
import { getEmbedding } from './embedder.js';
import { rankPublications, rankTrials } from './reranker.js';
import DocumentModel from '../models/Document.js';
import TrialModel from '../models/Trial.js';

/**
 * @param {object} params
 * @param {string} params.query
 * @param {string} params.disease
 * @param {string} params.intent
 * @param {string} params.location
 * @param {Array}  params.conversationMemory  last N messages [{role, content}]
 * @returns {Promise<{publications, trials, expandedQuery, meta}>}
 */
export async function orchestrate({ query, disease, intent, location, conversationMemory = [] }) {
  const startTime = Date.now();

  // ── 1. Query expansion ────────────────────────────────────────────────────
  const expandedQuery = await expandQuery(query, disease, intent);

  // ── 2. Parallel fetch with graceful degradation ───────────────────────────
  const [alexResult, pubmedResult, trialsResult] = await Promise.allSettled([
    fetchOpenAlex(expandedQuery, 100),
    fetchPubMed(expandedQuery, 100),
    fetchTrials(disease || expandedQuery, location, 100),
  ]);

  const publications = [
    ...(alexResult.status === 'fulfilled' ? alexResult.value : logFailure('OpenAlex', alexResult.reason)),
    ...(pubmedResult.status === 'fulfilled' ? pubmedResult.value : logFailure('PubMed', pubmedResult.reason)),
  ];

  const rawTrials = trialsResult.status === 'fulfilled'
    ? trialsResult.value
    : logFailure('ClinicalTrials', trialsResult.reason);

  console.log(`[Orchestrator] Raw: ${publications.length} pubs, ${rawTrials.length} trials`);

  // ── 3. Deduplicate publications by externalId ────────────────────────────
  const seen = new Set();
  const uniquePubs = publications.filter((doc) => {
    if (seen.has(doc.externalId)) return false;
    seen.add(doc.externalId);
    return true;
  });

  // ── 4. Cache docs + embed in parallel (missing ones only) ────────────────
  const embeddedPubs = await embedAndCache(uniquePubs, expandedQuery);
  const cachedTrials = await cacheTrials(rawTrials);

  // ── 5. Compute query embedding ────────────────────────────────────────────
  const queryEmb = await getEmbedding(expandedQuery);

  // ── 6. Re-rank ────────────────────────────────────────────────────────────
  const topPublications = rankPublications(queryEmb, embeddedPubs, intent, 8);
  const topTrials = rankTrials(queryEmb, cachedTrials, location, 8);

  const latencyMs = Date.now() - startTime;
  console.log(`[Orchestrator] Done in ${latencyMs}ms — top ${topPublications.length} pubs, ${topTrials.length} trials`);

  return {
    publications: topPublications,
    trials: topTrials,
    expandedQuery,
    meta: { latencyMs, rawCounts: { pubs: uniquePubs.length, trials: rawTrials.length } },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logFailure(source, reason) {
  console.error(`[Orchestrator] ${source} failed: ${reason?.message || reason}`);
  return [];
}

async function embedAndCache(docs, queryText) {
  const results = [];

  for (const doc of docs) {
    try {
      // Check MongoDB cache first
      let cached = await DocumentModel.findOne({ source: doc.source, externalId: doc.externalId });

      if (!cached) {
        // Embed and store
        const emb = await getEmbedding(`${doc.title} ${doc.abstract}`);
        const embedding = emb.type === 'dense' ? emb.vec : [];

        cached = await DocumentModel.findOneAndUpdate(
          { source: doc.source, externalId: doc.externalId },
          { ...doc, embedding, fetchedAt: new Date() },
          { upsert: true, new: true }
        );
      }

      results.push({
        ...doc,
        _mongoId: cached._id,
        embedding: cached.embedding?.length ? cached.embedding : null,
      });
    } catch (err) {
      console.warn(`[Orchestrator] Cache error for ${doc.externalId}: ${err.message}`);
      results.push(doc);
    }
  }

  return results;
}

async function cacheTrials(trials) {
  const results = [];
  for (const trial of trials) {
    try {
      const cached = await TrialModel.findOneAndUpdate(
        { nctId: trial.nctId },
        { ...trial, fetchedAt: new Date() },
        { upsert: true, new: true }
      );
      results.push({ ...trial, _mongoId: cached._id });
    } catch (err) {
      console.warn(`[Orchestrator] Trial cache error ${trial.nctId}: ${err.message}`);
      results.push(trial);
    }
  }
  return results;
}
