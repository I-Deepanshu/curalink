import './ContextForm.css';

/**
 * Structured input form: name, disease, intent, location.
 * The `onSubmit` callback receives the context object.
 */
export default function ContextForm({ onSubmit }) {
  function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    onSubmit({
      name: fd.get('name').trim(),
      disease: fd.get('disease').trim(),
      intent: fd.get('intent').trim(),
      location: fd.get('location').trim(),
    });
  }

  return (
    <form className="context-form" onSubmit={handleSubmit} id="context-form">
      <div className="form-group">
        <label className="form-label" htmlFor="cf-name">Your name (optional)</label>
        <input
          id="cf-name"
          name="name"
          type="text"
          className="form-input"
          placeholder="e.g. Alex"
          autoComplete="off"
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="cf-disease">
          Condition / Disease <span className="cf-required">*</span>
        </label>
        <input
          id="cf-disease"
          name="disease"
          type="text"
          className="form-input"
          placeholder="e.g. Parkinson's disease, lung cancer"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="cf-intent">Research focus</label>
        <select id="cf-intent" name="intent" className="form-select">
          <option value="">General research</option>
          <option value="treatment">Treatment options</option>
          <option value="clinical trial">Clinical trials</option>
          <option value="diagnosis">Diagnosis & biomarkers</option>
          <option value="prognosis">Prognosis & outcomes</option>
          <option value="mechanism">Disease mechanisms</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="cf-location">Location (for trial proximity)</label>
        <input
          id="cf-location"
          name="location"
          type="text"
          className="form-input"
          placeholder="e.g. Toronto, Canada"
          autoComplete="off"
        />
      </div>

      <button type="submit" className="btn btn-primary cf-submit" id="btn-start-research">
        Start research →
      </button>
    </form>
  );
}
