/**
 * Embedder service.
 * Primary:  Ollama nomic-embed-text (dense vectors, 768-dim)
 * Fallback: TF-IDF sparse vectors (pure JS, no deps)
 *
 * Both implementations expose the same interface so the re-ranker
 * doesn't care which backend is active.
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

let ollamaAvailable = true; // probed lazily

// ── Dense (Ollama) ────────────────────────────────────────────────────────────

async function embedWithOllama(text) {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const data = await res.json();
  if (!data.embedding) throw new Error('Ollama returned no embedding');
  return { type: 'dense', vec: data.embedding };
}

// ── Sparse (TF-IDF fallback) ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','about','into','through','during','is','are','was','were','be',
  'have','has','had','do','does','did','will','would','could','should','may',
  'might','this','that','these','those','it','its','we','they','he','she',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function buildTFIDFVec(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const total = tokens.length || 1;
  const vec = {};
  for (const [t, count] of Object.entries(freq)) {
    vec[t] = count / total;
  }
  return { type: 'sparse', vec };
}

function embedSparse(text) {
  return buildTFIDFVec(tokenize(text));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get an embedding for text. Automatically falls back to sparse on error.
 * @param {string} text
 * @returns {Promise<{type: 'dense'|'sparse', vec: number[]|Object}>}
 */
export async function getEmbedding(text) {
  if (ollamaAvailable) {
    try {
      return await embedWithOllama(text);
    } catch (err) {
      console.warn(`[Embedder] Ollama unavailable, switching to TF-IDF: ${err.message}`);
      ollamaAvailable = false;
    }
  }
  return embedSparse(text);
}

/**
 * Compute cosine similarity between two embeddings (dense or sparse).
 * @param {{type, vec}} a
 * @param {{type, vec}} b
 * @returns {number} score in [0, 1]
 */
export function similarity(a, b) {
  if (a.type === 'dense' && b.type === 'dense') {
    return denseCosine(a.vec, b.vec);
  }
  // Mixed or both sparse → use sparse cosine
  const va = a.type === 'sparse' ? a.vec : denseToSparse(a.vec);
  const vb = b.type === 'sparse' ? b.vec : denseToSparse(b.vec);
  return sparseCosine(va, vb);
}

function denseCosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function sparseCosine(va, vb) {
  const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const a = va[k] || 0;
    const b = vb[k] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function denseToSparse(vec) {
  // Dimensionality reduction for cross-type comparison (not ideal, but functional)
  const sparse = {};
  vec.forEach((v, i) => { if (Math.abs(v) > 0.01) sparse[`d${i}`] = v; });
  return sparse;
}
