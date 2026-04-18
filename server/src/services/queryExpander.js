/**
 * Query expansion service.
 * Uses Ollama (or HF fallback) to rewrite the user's query
 * with disease context and MeSH-like medical terminology.
 *
 * Falls back to simple concatenation if LLM unavailable.
 */

import { callLLM } from './llm.js';

const EXPANSION_PROMPT = (query, disease, intent) => `You are a biomedical search query specialist.

Given the following user context, rewrite and expand the search query with relevant medical terminology, synonyms, and MeSH-like terms to maximise recall in PubMed and OpenAlex.

User disease: ${disease || 'not specified'}
User intent: ${intent || 'general research'}
Original query: "${query}"

Rules:
- Output ONLY a single expanded search query string, no explanation.
- Include disease synonyms, treatment names, and relevant medical terms.
- Keep it under 15 words.
- Do NOT include boolean operators (AND/OR), just key terms.

Expanded query:`;

/**
 * Expand a user query with disease context.
 * @param {string} query - original user input
 * @param {string} disease - from session context
 * @param {string} intent - e.g. "treatment", "clinical trial"
 * @returns {Promise<string>} expanded query string
 */
export async function expandQuery(query, disease = '', intent = '') {
  try {
    const prompt = EXPANSION_PROMPT(query, disease, intent);
    const expanded = await callLLM(prompt, { maxTokens: 60, stream: false });
    const cleaned = expanded.trim().replace(/^["']|["']$/g, '').trim();
    if (cleaned.length < 3) throw new Error('Empty expansion');
    console.log(`[QueryExpander] "${query}" → "${cleaned}"`);
    return cleaned;
  } catch (err) {
    console.warn(`[QueryExpander] LLM expansion failed, using fast fallback: ${err.message}`);
    
    // Strict fallback safeguards to ensure PubMed does not return 0 results
    let fallbackQuery = query;
    if (query.trim().length <= 8) { // Target short queries like "symptoms" or "piles"
      fallbackQuery = `${query} disease symptoms treatment`;
    }
    
    // Append disease context securely
    const parts = [fallbackQuery, disease, intent].filter(Boolean);
    const finalFallback = [...new Set(parts.join(' ').split(' '))].join(' ');
    
    console.log(`[QueryExpander] Fallback optimized -> "${finalFallback}"`);
    return finalFallback;
  }
}
