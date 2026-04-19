import { useCallback, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sources, setSources] = useState({ publications: [], trials: [] });
  const [statusText, setStatusText] = useState('');
  const abortRef = useRef(null);

  const sendMessage = useCallback(async ({ query, disease, intent, location, sessionId, onSessionId }) => {
    if (isStreaming) return;

    // Generate unique IDs to prevent bubble collision
    const userId = Date.now() + Math.random().toString(36).substring(7);
    const assistantId = Date.now() + Math.random().toString(36).substring(7);

    // Add both messages atomically
    setMessages((prev) => [
      ...prev, 
      { role: 'user', content: query, id: userId },
      { role: 'assistant', content: '', id: assistantId, streaming: true }
    ]);

    setIsStreaming(true);
    setStatusText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, disease, intent, location, sessionId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            handleEvent(event, assistantId, { setSources, setStatusText, onSessionId, setMessages });
          } catch {
            // malformed event, skip
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `❌ Error: ${err.message}`, streaming: false }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
      abortRef.current = null;
    }
  }, [isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSources({ publications: [], trials: [] });
    setStatusText('');
  }, []);

  return { messages, isStreaming, sources, statusText, sendMessage, stopStreaming, clearChat };
}

function handleEvent(event, assistantId, { setSources, setStatusText, onSessionId, setMessages }) {
  switch (event.type) {
    case 'session':
      onSessionId?.(event.sessionId);
      break;
    case 'status':
      setStatusText(event.content);
      break;
    case 'token':
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content + event.content }
            : m
        )
      );
      break;
    case 'sources':
      setSources({
        publications: event.data.publications || [],
        trials: event.data.trials || [],
        expandedQuery: event.data.expandedQuery,
        meta: event.data.meta,
      });
      break;
    case 'model':
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, model: event.content } : m
        )
      );
      break;
    case 'error':
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: (m.content || '') + `\n\n❌ ${event.content}`, streaming: false }
            : m
        )
      );
      break;
    default:
      break;
  }
}
