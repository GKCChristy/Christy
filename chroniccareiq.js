// ============================================================
// lib/chroniccareiq.js
// Chronic Care IQ API Client
// IMPORTANT: All endpoint paths must be validated against the
// actual CCIQ API documentation before deploying.
// Never assume field names — verify against real API schema.
// ============================================================

import { GOVERNANCE_ERRORS } from './governance.js';

const BASE_URL = process.env.CCIQ_API_URL;
const API_KEY  = process.env.CCIQ_API_KEY;

if (!BASE_URL) throw new Error(GOVERNANCE_ERRORS.CONFIG_MISSING + ': CCIQ_API_URL');
if (!API_KEY)  throw new Error(GOVERNANCE_ERRORS.CONFIG_MISSING + ': CCIQ_API_KEY');

const DEFAULT_TIMEOUT_MS = 10000;

async function cciqFetch(endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(
        `${GOVERNANCE_ERRORS.API_TIMEOUT}: HTTP ${response.status} on ${endpoint}`
      );
    }

    return response.json();

  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`${GOVERNANCE_ERRORS.API_TIMEOUT}: Request timed out on ${endpoint}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Returns paginated list of active patients
// Verify exact endpoint and response shape against CCIQ API docs
export async function getActivePatients(cursor = null, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit), status: 'active' });
  if (cursor) params.set('cursor', cursor);
  return cciqFetch(`/patients?${params}`);
  // Expected shape: { patients: [...], next_cursor: string|null, has_more: boolean }
}

// Returns engagement data for a single patient
// Verify exact endpoint and field names against CCIQ API docs
export async function getPatientEngagement(cciqPatientId) {
  return cciqFetch(`/patients/${cciqPatientId}/engagement?days=30`);
  // Expected fields to verify:
  //   last_device_transmission_at (ISO timestamp or null)
  //   days_since_last_transmission (integer or null)
  //   call_attempts_7d (integer)
  //   call_attempts_30d (integer)
  //   unanswered_calls_7d (integer)
  //   unanswered_calls_30d (integer)
}
