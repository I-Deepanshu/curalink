import './FilterBar.css';

/**
 * FilterBar — controls for publications and trials side panel.
 */
export default function FilterBar({ activeTab, filters, onChange }) {
  function update(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="filter-bar">
      {activeTab === 'pubs' && (
        <>
          <div className="filter-group">
            <label className="filter-label">From</label>
            <select
              className="filter-select"
              value={filters.minYear}
              onChange={(e) => update('minYear', parseInt(e.target.value))}
              id="filter-min-year"
            >
              {[2025, 2022, 2020, 2018, 2015, 2010].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Source</label>
            <select
              className="filter-select"
              value={filters.source}
              onChange={(e) => update('source', e.target.value)}
              id="filter-source"
            >
              <option value="all">All</option>
              <option value="pubmed">PubMed</option>
              <option value="openalex">OpenAlex</option>
            </select>
          </div>
        </>
      )}

      {activeTab === 'trials' && (
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            className="filter-select"
            value={filters.trialStatus}
            onChange={(e) => update('trialStatus', e.target.value)}
            id="filter-trial-status"
          >
            <option value="all">All statuses</option>
            <option value="RECRUITING">Recruiting</option>
            <option value="ACTIVE_NOT_RECRUITING">Active</option>
            <option value="ENROLLING_BY_INVITATION">By Invitation</option>
          </select>
        </div>
      )}
    </div>
  );
}
