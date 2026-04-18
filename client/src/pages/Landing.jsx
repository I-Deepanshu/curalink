import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ContextForm from '../components/ContextForm.jsx';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  function handleStart(context) {
    navigate('/chat', { state: { context } });
  }

  function handleQuickStart() {
    navigate('/chat', { state: { context: null } });
  }

  return (
    <div className="landing">
      {/* ── Header ── */}
      <header className="landing-header">
        <div className="landing-logo">
          <span className="landing-logo-icon">⚕</span>
          <span className="landing-logo-text">Curalink</span>
        </div>
        <nav className="landing-nav">
          <a href="#how">How it works</a>
          <a href="#sources">Sources</a>
          <button className="btn btn-primary" onClick={handleQuickStart}>
            Try now →
          </button>
        </nav>
      </header>

      {/* ── Hero ── */}
      <main className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-badge badge badge-blue">
            ✦ AI-Powered Biomedical Research
          </div>
          <h1 className="landing-title">
            Your personal{' '}
            <span className="landing-title-accent">medical research</span>{' '}
            companion
          </h1>
          <p className="landing-subtitle">
            Curalink retrieves and synthesises evidence from PubMed, OpenAlex,
            and ClinicalTrials.gov — ranked, cited, and explained in plain
            language by a locally-hosted AI.
          </p>

          <div className="landing-cta-group">
            <button className="btn btn-primary landing-cta-primary" onClick={() => setShowForm(true)}>
              Start your research →
            </button>
            <button className="btn btn-secondary" onClick={handleQuickStart}>
              Quick start (no context)
            </button>
          </div>

          {/* ── Features row ── */}
          <div className="landing-features">
            {FEATURES.map((f) => (
              <div key={f.label} className="landing-feature">
                <span className="landing-feature-icon">{f.icon}</span>
                <div>
                  <div className="landing-feature-label">{f.label}</div>
                  <div className="landing-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── How it works ── */}
      <section id="how" className="landing-section">
        <h2 className="landing-section-title">How Curalink works</h2>
        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <div key={i} className="landing-step">
              <div className="landing-step-num">{i + 1}</div>
              <div>
                <div className="landing-step-title">{s.title}</div>
                <div className="landing-step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sources ── */}
      <section id="sources" className="landing-section landing-section-alt">
        <h2 className="landing-section-title">Evidence from trusted sources</h2>
        <div className="landing-sources">
          {SOURCES.map((s) => (
            <div key={s.name} className="landing-source-card">
              <div className="landing-source-name">{s.name}</div>
              <div className="landing-source-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Disclaimer footer ── */}
      <footer className="landing-footer">
        <p>⚠️ Curalink is for research purposes only and does not constitute medical advice.</p>
        <p>Built for the Hackathon · Open-source LLM · No OpenAI/Gemini APIs used</p>
      </footer>

      {/* ── Context form modal ── */}
      {showForm && (
        <div className="landing-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="landing-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Tell us about your research</h2>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <ContextForm onSubmit={handleStart} />
          </div>
        </div>
      )}
    </div>
  );
}

const FEATURES = [
  { icon: '🔍', label: '50–300 candidates', desc: 'Depth-first retrieval across 3 sources' },
  { icon: '📊', label: 'Smart re-ranking', desc: 'Semantic + recency + credibility scores' },
  { icon: '🤖', label: 'Local LLM', desc: 'Llama 3.1 via Ollama — no data leaves your infra' },
  { icon: '📎', label: 'Source attribution', desc: 'Every claim linked to a retrievable paper' },
];

const STEPS = [
  { title: 'Enter your context', desc: 'Provide your condition, intent, and location for personalised results.' },
  { title: 'We retrieve evidence', desc: 'Curalink searches PubMed, OpenAlex, and ClinicalTrials.gov in parallel, fetching up to 300 candidates.' },
  { title: 'Intelligent re-ranking', desc: 'Results are scored by semantic relevance, recency, citation count, and your stated intent.' },
  { title: 'Grounded AI synthesis', desc: 'A local LLM reads the top evidence and produces a structured, cited response — refusing to speculate beyond the sources.' },
];

const SOURCES = [
  { name: 'PubMed', desc: '35M+ biomedical citations from MEDLINE and life science journals.' },
  { name: 'OpenAlex', desc: 'Open catalogue of 250M+ scholarly works with citation counts.' },
  { name: 'ClinicalTrials.gov', desc: 'Live database of 400K+ clinical studies worldwide.' },
];
