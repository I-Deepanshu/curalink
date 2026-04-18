import { useState } from 'react';
import './SourceCard.css';

const SOURCE_LABELS = {
  openalex: { label: 'OpenAlex', color: 'badge-blue' },
  pubmed: { label: 'PubMed', color: 'badge-green' },
};

/**
 * SourceCard displays a publication with:
 * - Platform badge, year, citation count
 * - Truncatable abstract
 * - "Why ranked?" tooltip
 */
export default function SourceCard({ doc, index }) {
  const [showRationale, setShowRationale] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const badge = SOURCE_LABELS[doc.source] || { label: doc.source, color: 'badge-slate' };
  const truncatedAbstract = doc.abstract?.slice(0, 220);
  const hasMore = doc.abstract?.length > 220;

  return (
    <div className="source-card fade-in" id={`source-${index}`}>
      {/* ── Header row ── */}
      <div className="sc-header">
        <div className="sc-index">[S{index}]</div>
        <div className="sc-badges">
          <span className={`badge ${badge.color}`}>{badge.label}</span>
          {doc.year && <span className="badge badge-slate">{doc.year}</span>}
          {doc.citationCount > 0 && (
            <span className="badge badge-slate" title="Citation count">
              📊 {doc.citationCount.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Title ── */}
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="sc-title"
      >
        {doc.title}
      </a>

      {/* ── Authors / Journal ── */}
      {(doc.authors?.length > 0 || doc.journal) && (
        <div className="sc-meta">
          {doc.authors?.slice(0, 3).join(', ')}
          {doc.authors?.length > 3 && ' et al.'}
          {doc.journal && ` · ${doc.journal}`}
        </div>
      )}

      {/* ── Abstract snippet ── */}
      {doc.abstract && (
        <div className="sc-abstract">
          {expanded ? doc.abstract : truncatedAbstract}
          {hasMore && !expanded && '…'}
          {hasMore && (
            <button
              className="sc-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* ── Footer: why ranked ── */}
      {doc.rankingRationale && (
        <div className="sc-footer">
          <button
            className="sc-why-btn"
            onClick={() => setShowRationale(!showRationale)}
            aria-expanded={showRationale}
          >
            {showRationale ? '▲' : '▼'} Why ranked #{index}?
          </button>

          {showRationale && (
            <div className="sc-rationale">
              <RationaleBar label="Semantic" value={doc.rankingRationale.semantic} />
              <RationaleBar label="Recency" value={doc.rankingRationale.recency} />
              <RationaleBar label="Credibility" value={doc.rankingRationale.credibility} />
              <RationaleBar label="Intent match" value={doc.rankingRationale.intentMatch} />
              <div className="sc-rationale-total">
                Total score: <strong>{doc.rankingRationale.total}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RationaleBar({ label, value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="sc-rationale-row">
      <div className="sc-rationale-label">{label}</div>
      <div className="sc-rationale-bar-outer">
        <div className="sc-rationale-bar-inner" style={{ width: `${pct}%` }} />
      </div>
      <div className="sc-rationale-value">{pct}%</div>
    </div>
  );
}
