import ReactMarkdown from 'react-markdown';
import './MessageBubble.css';

/**
 * Renders a chat message. Assistant messages use ReactMarkdown for structured
 * output. Inline [S#] citations become clickable anchors that highlight the
 * matching SourceCard in the side panel.
 */
export default function MessageBubble({ message }) {
  const { role, content, streaming, model } = message;

  if (role === 'user') {
    return (
      <div className="mb-user fade-in">
        <div className="mb-user-bubble">{content}</div>
      </div>
    );
  }

  return (
    <div className="mb-assistant fade-in">
      <div className="mb-avatar">⚕</div>
      <div className="mb-assistant-body">
        {content ? (
          <div className="mb-content">
            <ReactMarkdown
              components={{
                // Render [S#] citations as anchor links
                p: ({ children }) => (
                  <p>{renderCitations(children)}</p>
                ),
                li: ({ children }) => (
                  <li>{renderCitations(children)}</li>
                ),
                h2: ({ children }) => <h2 className="mb-section-heading">{children}</h2>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="mb-typing">
            <span /><span /><span />
          </div>
        )}
        {streaming && <div className="mb-cursor" aria-hidden />}
        {model && !streaming && (
          <div className="mb-model-tag">via {model}</div>
        )}
      </div>
    </div>
  );
}

/** Replace [S#] with styled clickable spans. */
function renderCitations(children) {
  if (!children) return children;
  if (typeof children === 'string') {
    return children.split(/(\[S\d+\])/g).map((part, i) => {
      const match = part.match(/^\[S(\d+)\]$/);
      if (match) {
        const idx = parseInt(match[1]);
        return (
          <a
            key={i}
            href={`#source-${idx}`}
            className="mb-citation"
            title={`Go to source ${idx}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`source-${idx}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('source-highlight');
                setTimeout(() => el.classList.remove('source-highlight'), 2000);
              }
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string' ? <span key={i}>{renderCitations(child)}</span> : child
    );
  }
  return children;
}
