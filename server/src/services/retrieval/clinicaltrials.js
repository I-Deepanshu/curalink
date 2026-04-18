/**
 * ClinicalTrials.gov v2 retrieval adapter.
 * Docs: https://clinicaltrials.gov/data-api/api
 */

const BASE = 'https://clinicaltrials.gov/api/v2/studies';

/**
 * Fetch clinical trials from ClinicalTrials.gov v2.
 * @param {string} disease - condition to search for
 * @param {string|null} location - optional city/country for soft-ranking
 * @param {number} pageSize - max results (caps at 200)
 * @returns {Promise<Array>} normalised trial objects
 */
export async function fetchTrials(disease, location = null, pageSize = 100) {
  const params = new URLSearchParams({
    'query.cond': disease,
    'filter.overallStatus': 'RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION',
    pageSize: String(Math.min(pageSize, 200)),
    format: 'json',
    fields: [
      'NCTId', 'BriefTitle', 'OverallStatus', 'Phase',
      'EligibilityModule', 'LocationModule', 'ContactsLocationsModule',
      'ConditionsModule', 'InterventionsModule', 'StudyFirstSubmitDate',
    ].join(','),
  });

  // Soft location filter (prefer, don't exclude)
  if (location) {
    params.set('query.locn', location);
  }

  const url = `${BASE}?${params}`;
  console.log(`[ClinicalTrials] Fetching: ${url}`);

  const res = await fetchWithRetry(url);
  const data = await res.json();

  const studies = data.studies || [];
  console.log(`[ClinicalTrials] Got ${studies.length} trials`);

  return studies.map(normalise).filter(Boolean);
}

function normalise(study) {
  try {
    const proto = study.protocolSection;
    const id = proto?.identificationModule;
    const status = proto?.statusModule;
    const eligibility = proto?.eligibilityModule;
    const contacts = proto?.contactsLocationsModule;
    const conditions = proto?.conditionsModule?.conditions || [];
    const interventions =
      (proto?.interventionsModule?.interventions || []).map((i) => i.name);

    const nctId = id?.nctId;
    if (!nctId) return null;

    // Locations
    const rawLocations = contacts?.locations || [];
    const locations = rawLocations.slice(0, 10).map((loc) => ({
      facility: loc.facility,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      zip: loc.zip,
    }));

    // Central contacts
    const centralContacts = (contacts?.centralContacts || []).slice(0, 3).map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
    }));

    return {
      nctId,
      title: id?.briefTitle || 'Untitled Trial',
      status: status?.overallStatus || 'Unknown',
      phase: status?.phase || proto?.designModule?.phases?.[0] || null,
      eligibility: {
        criteria: eligibility?.eligibilityCriteria || '',
        minAge: eligibility?.minimumAge || null,
        maxAge: eligibility?.maximumAge || null,
        sex: eligibility?.sex || 'ALL',
      },
      locations,
      contacts: centralContacts,
      conditions,
      interventions,
      url: `https://clinicaltrials.gov/study/${nctId}`,
    };
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === tries - 1) throw err;
      const delay = (i + 1) * 2000;
      console.warn(`[ClinicalTrials] Retry ${i + 1} after ${delay}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
