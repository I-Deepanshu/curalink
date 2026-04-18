import { useState } from 'react';
import './TrialCard.css';

const STATUS_CONFIG = {
  RECRUITING: { label: 'Recruiting', color: 'badge-green' },
  ACTIVE_NOT_RECRUITING: { label: 'Active', color: 'badge-blue' },
  ENROLLING_BY_INVITATION: { label: 'By Invitation', color: 'badge-amber' },
  COMPLETED: { label: 'Completed', color: 'badge-slate' },
  TERMINATED: { label: 'Terminated', color: 'badge-red' },
};

export default function TrialCard({ trial, index }) {
  const [showEligibility, setShowEligibility] = useState(false);
  const [showRationale, setShowRationale] = useState(false);

  const statusCfg = STATUS_CONFIG[trial.status?.toUpperCase()] || { label: trial.status, color: 'badge-slate' };
  const primaryLocation = trial.locations?.[0];
  const contact = trial.contacts?.[0];

  return (
    <div className="trial-card fade-in" id={`trial-${index}`}>
      {/* ── Header ── */}
      <div className="tc-header">
        <span className={`badge ${statusCfg.color}`}>{statusCfg.label}</span>
        {trial.phase && <span className="badge badge-slate">{formatPhase(trial.phase)}</span>}
        <span className="tc-nct">
          <a href={trial.url} target="_blank" rel="noopener noreferrer">{trial.nctId}</a>
        </span>
      </div>

      {/* ── Title ── */}
      <a
        href={trial.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tc-title"
      >
        {trial.title}
      </a>

      {/* ── Conditions / Interventions ── */}
      {trial.conditions?.length > 0 && (
        <div className="tc-tags">
          {trial.conditions.slice(0, 3).map((c) => (
            <span key={c} className="tc-tag">{c}</span>
          ))}
        </div>
      )}

      {/* ── Location ── */}
      {primaryLocation && (
        <div className="tc-location">
          📍 {[primaryLocation.city, primaryLocation.state, primaryLocation.country].filter(Boolean).join(', ')}
          {trial.locations?.length > 1 && ` +${trial.locations.length - 1} more`}
        </div>
      )}

      {/* ── Eligibility accordion ── */}
      {trial.eligibility?.criteria && (
        <div className="tc-accordion">
          <button
            className="tc-accordion-btn"
            onClick={() => setShowEligibility(!showEligibility)}
            aria-expanded={showEligibility}
          >
            {showEligibility ? '▲' : '▼'} Eligibility criteria
          </button>
          {showEligibility && (
            <div className="tc-eligibility-body fade-in">
              {trial.eligibility.minAge && (
                <div className="tc-elig-row">
                  <span className="tc-elig-label">Age:</span>
                  {trial.eligibility.minAge} – {trial.eligibility.maxAge || 'N/A'}
                </div>
              )}
              {trial.eligibility.sex && trial.eligibility.sex !== 'ALL' && (
                <div className="tc-elig-row">
                  <span className="tc-elig-label">Sex:</span>
                  {trial.eligibility.sex}
                </div>
              )}
              <div className="tc-elig-text">
                {trial.eligibility.criteria.slice(0, 600)}
                {trial.eligibility.criteria.length > 600 && '…'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Contact ── */}
      {contact && (
        <div className="tc-contact">
          📞 {contact.name}
          {contact.email && (
            <> · <a href={`mailto:${contact.email}`}>{contact.email}</a></>
          )}
        </div>
      )}

      {/* ── Rationale ── */}
      {trial.rankingRationale && (
        <div className="tc-footer">
          <button className="sc-why-btn" onClick={() => setShowRationale(!showRationale)}>
            {showRationale ? '▲' : '▼'} Ranking score: {(trial.rankingRationale.total * 100).toFixed(0)}%
          </button>
          {showRationale && (
            <div className="tc-rationale fade-in" style={{ marginTop: 8 }}>
              {Object.entries(trial.rankingRationale).filter(([k]) => k !== 'total').map(([k, v]) => (
                <div key={k} className="sc-rationale-row">
                  <div className="sc-rationale-label">{k}</div>
                  <div className="sc-rationale-bar-outer">
                    <div className="sc-rationale-bar-inner" style={{ width: `${(v || 0) * 100}%` }} />
                  </div>
                  <div className="sc-rationale-value">{Math.round((v || 0) * 100)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatPhase(phase = '') {
  if (phase.includes('3') || phase.includes('III')) return 'Phase 3';
  if (phase.includes('2') || phase.includes('II')) return 'Phase 2';
  if (phase.includes('1') || phase.includes('I')) return 'Phase 1';
  if (phase.includes('4') || phase.includes('IV')) return 'Phase 4';
  return phase;
}
