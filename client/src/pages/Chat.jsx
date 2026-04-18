import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatWindow from '../components/ChatWindow.jsx';
import FilterBar from '../components/FilterBar.jsx';
import SourceCard from '../components/SourceCard.jsx';
import TrialCard from '../components/TrialCard.jsx';
import { useChat } from '../hooks/useChat.js';
import { useSession } from '../hooks/useSession.js';
import './Chat.css';

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId, setSessionId, context, setContext } = useSession();
  const { messages, isStreaming, sources, statusText, sendMessage, stopStreaming, clearChat } = useChat();

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('pubs'); // 'pubs' | 'trials'
  const [filters, setFilters] = useState({ minYear: 2015, source: 'all', trialStatus: 'all' });
  const inputRef = useRef(null);

  // Restore context from navigation state (coming from Landing)
  useEffect(() => {
    if (location.state?.context) {
      setContext(location.state.context);
    }
  }, [location.state, setContext]);

  function handleSend() {
    const q = inputText.trim();
    if (!q || isStreaming) return;
    setInputText('');
    sendMessage({
      query: q,
      disease: context?.disease || '',
      intent: context?.intent || '',
      location: context?.location || '',
      sessionId,
      onSessionId: setSessionId,
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewSession() {
    clearChat();
    setSessionId(null);
    navigate('/', { replace: true });
  }

  // Apply filters to sources
  const filteredPubs = (sources.publications || []).filter((p) => {
    if (filters.source !== 'all' && p.source !== filters.source) return false;
    if (p.year && p.year < filters.minYear) return false;
    return true;
  });

  const filteredTrials = (sources.trials || []).filter((t) => {
    if (filters.trialStatus !== 'all' && t.status !== filters.trialStatus) return false;
    return true;
  });

  const totalSources = filteredPubs.length + filteredTrials.length;

  return (
    <div className="chat-layout">
      {/* ── Sidebar left: session info ── */}
      <aside className="chat-sidebar-left">
        <div className="chat-brand">
          <span className="chat-brand-icon">⚕</span>
          <span className="chat-brand-text">Curalink</span>
        </div>

        {context && (
          <div className="chat-context-card">
            <div className="chat-context-label">Research context</div>
            {context.name && <div className="chat-context-item"><span>👤</span> {context.name}</div>}
            {context.disease && <div className="chat-context-item"><span>🏥</span> {context.disease}</div>}
            {context.intent && <div className="chat-context-item"><span>🎯</span> {context.intent}</div>}
            {context.location && <div className="chat-context-item"><span>📍</span> {context.location}</div>}
          </div>
        )}

        {sources.expandedQuery && (
          <div className="chat-expanded-query">
            <div className="chat-context-label">Expanded query</div>
            <div className="chat-expanded-query-text">{sources.expandedQuery}</div>
          </div>
        )}

        {sources.meta && (
          <div className="chat-expanded-query" style={{ marginTop: 8 }}>
            <div className="chat-context-label">Pipeline stats</div>
            <div className="chat-expanded-query-text">
              Retrieval: {sources.meta.latencyMs}ms<br />
              Raw pool: {sources.meta.rawCounts?.pubs} pubs + {sources.meta.rawCounts?.trials} trials
            </div>
          </div>
        )}

        <button className="btn btn-secondary chat-new-session-btn" onClick={handleNewSession}>
          + New research session
        </button>
      </aside>

      {/* ── Main chat area ── */}
      <main className="chat-main">
        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          statusText={statusText}
          publicationCount={filteredPubs.length}
        />

        {/* ── Input bar ── */}
        <div className="chat-input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              context?.disease
                ? `Ask about ${context.disease}...`
                : 'Ask a medical research question...'
            }
            rows={2}
            disabled={isStreaming}
            aria-label="Chat input"
          />
          <div className="chat-input-actions">
            {isStreaming ? (
              <button className="btn btn-secondary" onClick={stopStreaming} id="btn-stop-streaming">
                ⏹ Stop
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!inputText.trim()}
                id="btn-send-message"
              >
                Send →
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Right panel: sources ── */}
      <aside className="chat-panel-right">
        <div className="chat-panel-header">
          <div className="chat-panel-tabs">
            <button
              className={`chat-panel-tab ${activeTab === 'pubs' ? 'active' : ''}`}
              onClick={() => setActiveTab('pubs')}
              id="tab-publications"
            >
              📄 Publications ({filteredPubs.length})
            </button>
            <button
              className={`chat-panel-tab ${activeTab === 'trials' ? 'active' : ''}`}
              onClick={() => setActiveTab('trials')}
              id="tab-trials"
            >
              🧪 Trials ({filteredTrials.length})
            </button>
          </div>

          <FilterBar
            activeTab={activeTab}
            filters={filters}
            onChange={setFilters}
          />
        </div>

        <div className="chat-panel-body">
          {totalSources === 0 && (
            <div className="chat-panel-empty">
              {isStreaming ? (
                <div style={{ textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <div style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>
                    Retrieving evidence…
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.85rem' }}>
                  Sources will appear here after your first query.
                </div>
              )}
            </div>
          )}

          {activeTab === 'pubs' &&
            filteredPubs.map((pub, i) => (
              <SourceCard key={pub.externalId || i} doc={pub} index={i + 1} />
            ))}

          {activeTab === 'trials' &&
            filteredTrials.map((trial, i) => (
              <TrialCard key={trial.nctId || i} trial={trial} index={i + 1} />
            ))}
        </div>
      </aside>
    </div>
  );
}
