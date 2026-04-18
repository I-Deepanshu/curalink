/**
 * OpenAlex retrieval adapter.
 * Docs: https://docs.openalex.org/api-entities/works/search-works
 */

const BASE = 'https://api.openalex.org/works';
const MAILTO = process.env.OPENALEX_EMAIL || 'demo@curalink.ai';

/**
 * Fetch publications from OpenAlex.
 * @param {string} query - expanded search query
 * @param {number} pageSize - results per page (max 200)
 * @returns {Promise<Array>} normalised document objects
 */
export async function fetchOpenAlex(query, pageSize = 100) {
  const params = new URLSearchParams({
    search: query,
    'per-page': String(Math.min(pageSize, 200)),
    sort: 'relevance_score:desc',
    filter: 'from_publication_date:2015-01-01',
    select: 'id,title,abstract_inverted_index,authorships,publication_year,primary_location,cited_by_count,doi',
    mailto: MAILTO,
  });

  const url = `${BASE}?${params}`;
  console.log(`[OpenAlex] Fetching: ${url}`);

  const res = await fetchWithRetry(url);
  const data = await res.json();

  return (data.results || []).map(normalise);
}

/** Reconstruct abstract from OpenAlex inverted index. */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return '';
  const wordPositions = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push({ word, pos });
    }
  }
  wordPositions.sort((a, b) => a.pos - b.pos);
  return wordPositions.map((w) => w.word).join(' ');
}

function normalise(work) {
  const authors = (work.authorships || [])
    .slice(0, 5)
    .map((a) => a.author?.display_name)
    .filter(Boolean);

  const venue = work.primary_location?.source?.display_name || '';
  const doi = work.doi ? work.doi.replace('https://doi.org/', '') : null;
  const url = doi
    ? `https://doi.org/${doi}`
    : `https://openalex.org/${work.id?.replace('https://openalex.org/', '')}`;

  return {
    source: 'openalex',
    externalId: work.id,
    title: work.title || 'Untitled',
    abstract: reconstructAbstract(work.abstract_inverted_index),
    authors,
    year: work.publication_year,
    journal: venue,
    url,
    citationCount: work.cited_by_count || 0,
  };
}

/** Exponential back-off fetch (3 retries). */
async function fetchWithRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': `Curalink/1.0 (mailto:${MAILTO})` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      const delay = (i + 1) * 1500;
      console.warn(`[OpenAlex] Retry ${i + 1} after ${delay}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
