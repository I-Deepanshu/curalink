/**
 * LLM service — Ollama primary, Hugging Face Inference API fallback.
 *
 * callLLM(prompt, opts)       → string (non-streamed, e.g. query expansion)
 * streamLLM(prompt, res, opts) → streams SSE tokens to Express `res`
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

const CLOUD_API_KEY = process.env.OPENROUTER_API_KEY || process.env.TOGETHER_API_KEY || '';
const CLOUD_API_URL = process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.together.xyz/v1/chat/completions';
const CLOUD_MODEL = process.env.OPENROUTER_API_KEY ? 'meta-llama/llama-3.3-70b-instruct:free' : 'meta-llama/Llama-3-8b-chat-hf';

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
      console.warn(`[LLM] Ollama failed, trying Cloud LLM: ${err.message}`);
      ollamaAvailable = false;
    }
  }
  return cloudGenerate(prompt, { maxTokens });
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
      const ollamaText = await streamOllama(fullPrompt, expressRes);
      if (ollamaText) return ollamaText;
    } catch (err) {
      console.warn(`[LLM] Ollama stream failed, falling back to Cloud LLM: ${err.message}`);
      ollamaAvailable = false;
    }
  }

  try {
    const cloudText = await streamCloud(fullPrompt, expressRes);
    if (cloudText) return cloudText;
  } catch (err) {
    console.warn(`[LLM] Cloud stream failed directly: ${err.message}`);
  }

  // Final fallback guarantees a string for DB validation
  const fallbackMsg = '⚠️ AI is busy. Showing basic info instead...';
  sseWrite(expressRes, { type: 'token', content: fallbackMsg });
  return fallbackMsg;
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

// ── Cloud LLM API (OpenRouter / Together) ───────────────────────────────────

async function cloudGenerate(prompt, { maxTokens }) {
  if (!CLOUD_API_KEY) throw new Error('CLOUD_API_KEY not set. Please set OPENROUTER_API_KEY or TOGETHER_API_KEY in environment.');

  // Fallback chain of free models
  const primaryModel = process.env.CLOUD_MODEL || CLOUD_MODEL;
  const fallbackModels = primaryModel.includes('openrouter') 
    ? [
        primaryModel, 
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-2-9b-it:free',
        'mistralai/mistral-7b-instruct:free',
        'openchat/openchat-7b:free',
        'openrouter/free'
      ]
    : [primaryModel];

  let lastError = null;

  for (const modelId of fallbackModels) {
    try {
      const res = await fetch(CLOUD_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLOUD_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.CLIENT_URL || 'https://curalink-blush.vercel.app',
          'X-Title': 'Curalink AI'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.3,
          stream: false
        }),
        signal: AbortSignal.timeout(60000),
      });
      
      const payloadText = await res.text();

      if (!res.ok) {
        if (res.status === 429) {
          lastError = `Rate limited on ${modelId}: ${payloadText}`;
          console.warn(lastError);
          continue; // Try next model
        }
        throw new Error(`Cloud API HTTP ${res.status}: ${payloadText}`);
      }
      
      const data = JSON.parse(payloadText);
      return data.choices?.[0]?.message?.content || '';
      
    } catch (err) {
      if (err.name === 'TimeoutError') {
        lastError = `Timeout on ${modelId}`;
        continue;
      }
      throw err; // Stop on auth errors or fatal crashes
    }
  }

  throw new Error(`All available free cloud models failed. Last Error: ${lastError}`);
}

async function streamCloud(prompt, expressRes) {
  if (!CLOUD_API_KEY) {
    sseWrite(expressRes, { type: 'error', content: 'No LLM backend available. Please set OPENROUTER_API_KEY in your Render dashboard.' });
    return '';
  }

  // Not true streaming since we use the basic endpoint, but streams the whole block for UX UI compatibility
  sseWrite(expressRes, { type: 'token', content: '⏳ Generating response via Cloud LLM...\n\n' });

  try {
    const text = await cloudGenerate(prompt, { maxTokens: 2048 });
    sseWrite(expressRes, { type: 'token', content: text });
    sseWrite(expressRes, { type: 'model', content: `${process.env.CLOUD_MODEL || CLOUD_MODEL} (Cloud)` });
    return text;
  } catch (err) {
    console.warn(`[LLM] Cloud cascade failed entirely: ${err.message}`);
    const errorMsg = '⚠️ AI is busy right now. However, you can still view the retrieved sources and research publications on the right panel.';
    
    // Write the clean degradation message directly to the UI
    sseWrite(expressRes, { type: 'token', content: errorMsg });
    
    // Final graceful degradation fallback to prevent validation errors 
    return errorMsg;
  }
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
