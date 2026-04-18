import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import './ChatWindow.css';

export default function ChatWindow({ messages, isStreaming, statusText, publicationCount }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="chat-window chat-window-empty">
        <div className="cw-empty-icon">🔬</div>
        <h2 className="cw-empty-title">What would you like to research?</h2>
        <p className="cw-empty-sub">
          Ask any medical question. I'll retrieve up to 300 biomedical sources and synthesise the evidence with full citations.
        </p>
        <div className="cw-suggestions">
          {SUGGESTIONS.map((s) => (
            <div key={s} className="cw-suggestion-chip">{s}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-window-inner">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Status indicator while streaming */}
        {isStreaming && statusText && (
          <div className="cw-status" aria-live="polite">
            <div className="spinner" />
            <span>{statusText}</span>
          </div>
        )}

        {publicationCount > 0 && !isStreaming && (
          <div className="cw-source-notice fade-in">
            📎 {publicationCount} source{publicationCount !== 1 ? 's' : ''} available in the panel →
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Latest treatments for Parkinson\'s disease',
  'Active clinical trials for lung cancer',
  'Deep brain stimulation outcomes',
  'Vitamin D and autoimmune disease',
];
