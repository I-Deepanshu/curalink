/**
 * PubMed retrieval adapter (NCBI E-utilities, two-step).
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/
 */

import { parseStringPromise } from 'xml2js';
import pLimit from 'p-limit';

const ESEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const API_KEY = process.env.NCBI_API_KEY || '';

// With API key: 10 req/s; without: 3 req/s
const limit = pLimit(API_KEY ? 10 : 3);

/**
 * Fetch publications from PubMed.
 * @param {string} query - search terms
 * @param {number} maxResults - max IDs to fetch (caps at 200)
 * @returns {Promise<Array>} normalised document objects
 */
export async function fetchPubMed(query, maxResults = 20) {
  // Step 1: Search → ID list
  const ids = await searchIds(query, Math.min(maxResults, 50));
  if (!ids.length) return [];

  console.log(`[PubMed] Found ${ids.length} IDs for: "${query}"`);

  // Step 2: Fetch details in batches of 10 to speed up XML fetching
  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map((batch) => limit(() => fetchDetails(batch)))
  );

  return results.flat();
}

async function searchIds(query, retmax) {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: String(retmax),
    retmode: 'json',
    sort: 'relevance',
    ...(API_KEY && { api_key: API_KEY }),
  });

  const res = await fetchWithRetry(`${ESEARCH}?${params}`);
  const data = await res.json();
  return data.esearchresult?.idlist || [];
}

async function fetchDetails(ids) {
  const params = new URLSearchParams({
    db: 'pubmed',
    id: ids.join(','),
    rettype: 'abstract',
    retmode: 'xml',
    ...(API_KEY && { api_key: API_KEY }),
  });

  const res = await fetchWithRetry(`${EFETCH}?${params}`);
  const xml = await res.text();

  try {
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
    const articles = parsed?.PubmedArticleSet?.PubmedArticle;
    if (!articles) return [];

    const arr = Array.isArray(articles) ? articles : [articles];
    return arr.map(normalise).filter(Boolean);
  } catch (err) {
    console.error('[PubMed] XML parse error:', err.message);
    return [];
  }
}

function normalise(article) {
  try {
    const medline = article.MedlineCitation;
    const info = medline.Article;
    const pmid = medline.PMID?._ || medline.PMID;

    // Title
    const title = info.ArticleTitle?._ || info.ArticleTitle || 'Untitled';

    // Abstract — may be structured (array of sections)
    let abstract = '';
    const absNode = info.Abstract?.AbstractText;
    if (Array.isArray(absNode)) {
      abstract = absNode.map((t) => (t?._ || t || '')).join(' ');
    } else if (typeof absNode === 'object') {
      abstract = absNode?._ || '';
    } else {
      abstract = absNode || '';
    }

    // Authors
    const authorList = info.AuthorList?.Author;
    const authorsRaw = Array.isArray(authorList)
      ? authorList
      : authorList
      ? [authorList]
      : [];
    const authors = authorsRaw.slice(0, 5).map((a) => {
      const last = a.LastName || '';
      const fore = a.ForeName || a.Initials || '';
      return `${last}${fore ? ' ' + fore : ''}`.trim();
    });

    // Year
    const pubDate = info.Journal?.JournalIssue?.PubDate;
    const year = pubDate?.Year
      ? parseInt(pubDate.Year)
      : pubDate?.MedlineDate
      ? parseInt(pubDate.MedlineDate.slice(0, 4))
      : null;

    // Journal
    const journal = info.Journal?.Title || '';

    return {
      source: 'pubmed',
      externalId: String(pmid),
      title,
      abstract,
      authors,
      year,
      journal,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      citationCount: 0, // PubMed doesn't expose citation counts directly
    };
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      const delay = (i + 1) * 2000;
      console.warn(`[PubMed] Retry ${i + 1} after ${delay}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
