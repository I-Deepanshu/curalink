/**
 * Re-ranking service.
 *
 * Score = 0.55 * semantic + 0.20 * recency + 0.15 * credibility + 0.10 * intent_match
 *
 * Returns top-N pubs and top-N trials scored and sorted, each
 * annotated with a `rankingRationale` breakdown for the UI tooltip.
 */

import { similarity } from './embedder.js';

const WEIGHTS = { semantic: 0.55, recency: 0.20, credibility: 0.15, intent: 0.10 };
const CURRENT_YEAR = new Date().getFullYear();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score and rank publications.
 * @param {Object} queryEmb - embedding of the expanded query
 * @param {Array} publications - normalised docs with optional .embedding
 * @param {string} intent - e.g. "treatment", "diagnosis", "prognosis"
 * @param {number} topN
 */
export function rankPublications(queryEmb, publications, intent = '', topN = 8) {
  const scored = publications.map((doc) => {
    const semanticScore = doc.embedding
      ? similarity(queryEmb, { type: 'dense', vec: doc.embedding })
      : similarity(queryEmb, { type: 'sparse', vec: buildSparse(doc) });

    const recencyScore = recency(doc.year);
    const credScore = credibility(doc.citationCount);
    const intentScore = intentMatch(doc.abstract + ' ' + doc.title, intent);

    const final =
      WEIGHTS.semantic * semanticScore +
      WEIGHTS.recency * recencyScore +
      WEIGHTS.credibility * credScore +
      WEIGHTS.intent * intentScore;

    return {
      ...doc,
      _score: formatScore(final),
      rankingRationale: {
        semantic: formatScore(semanticScore),
        recency: formatScore(recencyScore),
        credibility: formatScore(credScore),
        intentMatch: formatScore(intentScore),
        total: formatScore(final),
      },
    };
  });

  return scored.sort((a, b) => b._score - a._score).slice(0, topN);
}

/**
 * Score and rank clinical trials (semantic not applicable — use status + relevance).
 */
export function rankTrials(queryEmb, trials, location = '', topN = 8) {
  const scored = trials.map((trial) => {
    const textBlob = [trial.title, trial.eligibility?.criteria, ...(trial.conditions || [])].join(' ');
    const semanticScore = similarity(queryEmb, { type: 'sparse', vec: buildSparseText(textBlob) });
    const statusScore = recruitingStatus(trial.status);
    const phaseScore = trialPhase(trial.phase);
    const locScore = location ? locationProximity(trial.locations, location) : 0.5;

    // Weighted combination adjusted for trial signals
    const final = 0.40 * semanticScore + 0.30 * statusScore + 0.20 * phaseScore + 0.10 * locScore;

    return {
      ...trial,
      _score: formatScore(final),
      rankingRationale: {
        semantic: formatScore(semanticScore),
        recruitingStatus: formatScore(statusScore),
        trialPhase: formatScore(phaseScore),
        locationMatch: formatScore(locScore),
        total: formatScore(final),
      },
    };
  });

  return scored.sort((a, b) => b._score - a._score).slice(0, topN);
}

// ── Scoring signals ───────────────────────────────────────────────────────────

/** Linear recency decay: full score for current year, 0 for 2000 or before. */
function recency(year) {
  if (!year) return 0.3;
  return Math.max(0, Math.min(1, (year - 2000) / (CURRENT_YEAR - 2000)));
}

/** Log-scaled citation count normalised to [0, 1]. */
function credibility(citations = 0) {
  if (citations <= 0) return 0.1;
  return Math.min(1, Math.log10(citations + 1) / 4); // 10000 citations → 1.0
}

/** Keyword-based intent matching. */
const INTENT_KEYWORDS = {
  treatment: ['treatment', 'therapy', 'therapeutic', 'drug', 'intervention', 'surgery', 'medication', 'cure', 'clinical trial'],
  diagnosis: ['diagnosis', 'diagnostic', 'biomarker', 'detection', 'screening', 'imaging', 'biopsy'],
  prognosis: ['prognosis', 'survival', 'outcome', 'mortality', 'recurrence', 'progression'],
  research: ['mechanism', 'pathway', 'gene', 'protein', 'molecular', 'pathogenesis'],
};

function intentMatch(text = '', intent = '') {
  if (!intent || !text) return 0.5;
  const lower = text.toLowerCase();
  // Find best matching category
  let best = 0;
  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent.toLowerCase().includes(category)) {
      const hits = keywords.filter((k) => lower.includes(k)).length;
      const score = Math.min(1, hits / 3);
      best = Math.max(best, score);
    }
  }
  // Fallback: direct word overlap
  if (best === 0) {
    const intentWords = intent.toLowerCase().split(/\s+/);
    const hits = intentWords.filter((w) => w.length > 3 && lower.includes(w)).length;
    best = Math.min(1, hits / intentWords.length);
  }
  return best;
}

function recruitingStatus(status = '') {
  const s = status.toUpperCase();
  if (s === 'RECRUITING') return 1.0;
  if (s === 'ENROLLING_BY_INVITATION') return 0.8;
  if (s === 'ACTIVE_NOT_RECRUITING') return 0.5;
  return 0.2;
}

function trialPhase(phase = '') {
  const p = (phase || '').toUpperCase();
  if (p.includes('3') || p.includes('4')) return 1.0;
  if (p.includes('2')) return 0.7;
  if (p.includes('1')) return 0.4;
  return 0.3;
}

function locationProximity(locations = [], query = '') {
  if (!locations.length) return 0.3;
  const q = query.toLowerCase();
  const match = locations.some(
    (l) =>
      (l.city && l.city.toLowerCase().includes(q)) ||
      (l.country && l.country.toLowerCase().includes(q)) ||
      (l.state && l.state.toLowerCase().includes(q))
  );
  return match ? 1.0 : 0.4;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSparse(doc) {
  return buildSparseText([doc.title, doc.abstract, ...(doc.authors || [])].join(' '));
}

function buildSparseText(text = '') {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const total = tokens.length || 1;
  const vec = {};
  for (const [t, c] of Object.entries(freq)) vec[t] = c / total;
  return vec;
}

function formatScore(n) {
  return Math.round(n * 100) / 100;
}
