import { useCallback, useState } from 'react';

const SESSION_KEY = 'curalink_session_id';
const CONTEXT_KEY = 'curalink_context';

export function useSession() {
  const [sessionId, setSessionIdState] = useState(() => sessionStorage.getItem(SESSION_KEY) || null);
  const [context, setContextState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || 'null') || null;
    } catch {
      return null;
    }
  });

  const setSessionId = useCallback((id) => {
    setSessionIdState(id);
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const setContext = useCallback((ctx) => {
    setContextState(ctx);
    if (ctx) sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
    else sessionStorage.removeItem(CONTEXT_KEY);
  }, []);

  const clearSession = useCallback(() => {
    setSessionId(null);
    setContext(null);
  }, [setSessionId, setContext]);

  return { sessionId, setSessionId, context, setContext, clearSession };
}
