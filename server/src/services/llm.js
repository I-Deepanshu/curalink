/**
 * LLM service — Ollama primary, Hugging Face Inference API fallback.
 *
 * callLLM(prompt, opts)       → string (non-streamed, e.g. query expansion)
 * streamLLM(prompt, res, opts) → streams SSE tokens to Express `res`
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

const HF_TOKEN = process.env.HF_TOKEN || '';
const HF_MODEL = process.env.HF_MODEL || 'HuggingFaceH4/zephyr-7b-beta';
const HF_URL = 'https://api-inference.huggingface.co/v1/chat/completions';

let ollamaAvailable = true; // flipped on first failure

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt() {
  return `You are Curalink, a medical research assistant. Your role is to help users understand biomedical research and clinical trials.

CRITICAL RULES:
1. Answer ONLY from the sources provided in [S1], [S2], etc. format.
2. Cite sources inline as [S1], [S2] — NEVER invent citation numbers not in the list.
3. If the evidence is insufficient, explicitly say so — never fabricate studies, statistics, or trial IDs.
4. Always include the safety disclaimer at the end.
5. Structure your response in EXACTLY these sections:

## Condition Overview
2-3 sentence plain-language summary of the condition and its current treatment landscape.

## Research Insights
- Bullet-point key findings from the provided publications. Cite each with [S#].
- Focus on recency and clinical relevance.

## Clinical Trials
- List active/recruiting trials with status, eligibility summary, and location.
- Note trial phase and contact info where available.

## Sources
Full citation list matching [S#] numbers used above.

## Disclaimer
⚠️ This information is for research purposes only and does not constitute medical advice. Always consult a qualified healthcare professional.`;
}

/**
 * Build the full RAG prompt with sources injected.
 */
export function buildRAGPrompt({ disease, intent, location, query, conversationMemory, sources }) {
  const sourceList = sources
    .map((s, i) => {
      const authors = (s.authors || []).slice(0, 3).join(', ');
      const line = `[S${i + 1}] ${s.title} — ${authors} (${s.year || 'n.d.'}) — ${s.source?.toUpperCase()} — ${s.url}`;
      const snippet = (s.abstract || s.eligibility?.criteria || '').slice(0, 300);
      return `${line}\n     Snippet: ${snippet}...`;
    })
    .join('\n');

  const memory = conversationMemory?.length
    ? `\nPrevious conversation context:\n${conversationMemory.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}\n`
    : '';

  return `${memory}
CONTEXT:
- Patient disease/condition: ${disease || 'not specified'}
- Research intent: ${intent || 'general research'}
- Location: ${location || 'not specified'}

SOURCES:
${sourceList}

USER QUESTION: ${query}

Produce your structured response now:`;
}

// ── Non-streaming call (for query expansion etc.) ─────────────────────────────

export async function callLLM(prompt, { maxTokens = 256, stream = false } = {}) {
  if (ollamaAvailable) {
    try {
      return await ollamaGenerate(prompt, { maxTokens, stream: false });
    } catch (err) {
      console.warn(`[LLM] Ollama failed, trying HF: ${err.message}`);
      ollamaAvailable = false;
    }
  }
  return hfGenerate(prompt, { maxTokens });
}

// ── Streaming call (for chat responses) ──────────────────────────────────────

/**
 * Stream LLM response as SSE to an Express response object.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} expressRes - Express response (already in SSE mode)
 * @returns {Promise<string>} full generated text
 */
export async function streamLLM(systemPrompt, userPrompt, expressRes) {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  if (ollamaAvailable) {
    try {
      return await streamOllama(fullPrompt, expressRes);
    } catch (err) {
      console.warn(`[LLM] Ollama stream failed, falling back to HF: ${err.message}`);
      ollamaAvailable = false;
    }
  }
  return streamHF(fullPrompt, expressRes);
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async function ollamaGenerate(prompt, { maxTokens }) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { num_predict: maxTokens, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return data.response || '';
}

async function streamOllama(prompt, expressRes) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: true,
      options: { temperature: 0.3, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) throw new Error(`Ollama stream HTTP ${res.status}`);

  const decoder = new TextDecoder();
  let fullText = '';

  for await (const chunk of res.body) {
    const text = decoder.decode(chunk, { stream: true });
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.response) {
          fullText += obj.response;
          sseWrite(expressRes, { type: 'token', content: obj.response });
        }
        if (obj.done) {
          sseWrite(expressRes, { type: 'model', content: `${OLLAMA_MODEL} (Ollama)` });
        }
      } catch {
        // partial JSON, skip
      }
    }
  }

  return fullText;
}

// ── Hugging Face Inference API ────────────────────────────────────────────────

async function hfGenerate(prompt, { maxTokens }) {
  if (!HF_TOKEN) throw new Error('HF_TOKEN not set');
  
  // Force upgrade deprecated Mistral endpoint
  const targetModel = HF_MODEL.includes('Mistral-7B-Instruct') 
    ? 'HuggingFaceH4/zephyr-7b-beta' 
    : HF_MODEL;

  const res = await fetch(HF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: targetModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HF HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function streamHF(prompt, expressRes) {
  if (!HF_TOKEN) {
    sseWrite(expressRes, { type: 'error', content: 'No LLM backend available. Set OLLAMA_BASE_URL or HF_TOKEN.' });
    return '';
  }

  // HF Inference API doesn't support true streaming for all models.
  // We do a non-streaming call and emit all at once.
  sseWrite(expressRes, { type: 'token', content: '⏳ Generating response via Hugging Face...\n\n' });

  const text = await hfGenerate(prompt, { maxTokens: 2048 });
  sseWrite(expressRes, { type: 'token', content: text });
  sseWrite(expressRes, { type: 'model', content: `${HF_MODEL} (HuggingFace)` });
  return text;
}

// ── SSE helper ────────────────────────────────────────────────────────────────

export function sseWrite(res, obj) {
  try {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  } catch {
    // client disconnected
  }
}

/**
 * Strip any citation markers not present in the provided source list.
 * @param {string} text - LLM generated text
 * @param {number} maxSourceIndex - highest valid [S#] index
 * @returns {string} sanitised text
 */
export function stripInvalidCitations(text, maxSourceIndex) {
  return text.replace(/\[S(\d+)\]/g, (match, num) => {
    return parseInt(num) <= maxSourceIndex ? match : '';
  });
}
