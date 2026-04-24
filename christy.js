// ============================================================
// lib/christy.js
// Christy — Core Agent Logic
// Haiku evaluates every patient inside strict governance guardrails.
// Error boundaries ensure one bad patient never kills the whole run.
// ============================================================

import {
  CHRISTY_SYSTEM_PROMPT,
  GOVERNANCE_ERRORS,
  AGENT_ID,
  AGENT_VERSION,
  HAIKU_MODEL
} from './governance.js';
import { supabase, dbInsert, dbUpsert, loadConfig } from './supabase.js';
import { getActivePatients, getPatientEngagement } from './chroniccareiq.js';

// ------------------------------------------------------------
// Step 1: Evaluate a single patient with Haiku
// ------------------------------------------------------------
async function evaluatePatient(patient, engagementData, config) {
  const enrollmentDays = Math.floor(
    (Date.now() - new Date(patient.enrollment_date).getTime()) / 86400000
  );

  const context = {
    enrollment_day_number:     enrollmentDays,
    grace_period_days:         parseInt(config.new_enrollee_grace_days),
    flag_threshold_short_days: parseInt(config.flag_window_short_days),
    flag_threshold_long_days:  parseInt(config.flag_window_long_days),
    min_unanswered_calls:      parseInt(config.min_unanswered_calls),
    last_device_transmission_at: engagementData.last_device_transmission_at ?? null,
    days_since_device_data:    engagementData.days_since_last_transmission ?? null,
    unanswered_calls_7d:       engagementData.unanswered_calls_7d ?? 0,
    unanswered_calls_30d:      engagementData.unanswered_calls_30d ?? 0,
    call_attempts_7d:          engagementData.call_attempts_7d ?? 0,
    call_attempts_30d:         engagementData.call_attempts_30d ?? 0
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 256,
      system: CHRISTY_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Evaluate this patient engagement data:\n\n${JSON.stringify(context, null, 2)}`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`${GOVERNANCE_ERRORS.HAIKU_PARSE_FAIL}: API ${response.status}`);
  }

  const haikuData = await response.json();
  const rawText = haikuData.content?.[0]?.text ?? '';

  let assessment;
  try {
    assessment = JSON.parse(rawText);
  } catch {
    throw new Error(`${GOVERNANCE_ERRORS.HAIKU_PARSE_FAIL} — raw: ${rawText.slice(0, 100)}`);
  }

  // Validate Haiku returned expected shape
  const validLevels = ['none', '7_day', '30_day', 'monitor_only'];
  if (!validLevels.includes(assessment.flag_level)) {
    throw new Error(`${GOVERNANCE_ERRORS.HAIKU_PARSE_FAIL} — invalid flag_level: ${assessment.flag_level}`);
  }

  return { assessment, enrollmentDays };
}

// ------------------------------------------------------------
// Step 2: Save engagement snapshot (always, for every patient)
// ------------------------------------------------------------
async function saveSnapshot(patient, engagementData, enrollmentDays, runId) {
  await dbInsert('engagement_snapshots', {
    patient_id:                 patient.id,
    run_id:                     runId,
    snapshot_date:              new Date().toISOString().split('T')[0],
    last_device_transmission_at: engagementData.last_device_transmission_at ?? null,
    days_since_device_data:     engagementData.days_since_last_transmission ?? null,
    call_attempts_7d:           engagementData.call_attempts_7d ?? 0,
    call_attempts_30d:          engagementData.call_attempts_30d ?? 0,
    unanswered_calls_7d:        engagementData.unanswered_calls_7d ?? 0,
    unanswered_calls_30d:       engagementData.unanswered_calls_30d ?? 0,
    enrollment_day_number:      enrollmentDays,
    raw_data:                   engagementData
  });
}

// ------------------------------------------------------------
// Step 3: Write flag (idempotent — upsert with conflict constraint)
// ------------------------------------------------------------
async function writeFlag(patient, assessment, runId) {
  if (assessment.flag_level === 'none') return null;

  const today = new Date().toISOString().split('T')[0];

  return dbUpsert('patient_flags', {
    patient_id:      patient.id,
    run_id:          runId,
    flag_date:       today,
    flag_level:      assessment.flag_level,
    reason:          assessment.reason ?? null,
    priority:        assessment.priority,
    haiku_reasoning: assessment.monitoring_note,
    is_active:       true
  }, 'patient_id,flag_date,flag_level');
}

// ------------------------------------------------------------
// Step 4: Send alert (idempotent — check before sending)
// ------------------------------------------------------------
async function sendAlert(patient, flag, runId) {
  if (!flag || flag.flag_level === 'monitor_only') return;

  const today = new Date().toISOString().split('T')[0];
  const alertType = `${flag.flag_level}_gap`;

  // Idempotency check — did we already alert for this patient today?
  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('patient_id', patient.id)
    .eq('alert_date', today)
    .eq('alert_type', alertType)
    .maybeSingle();

  if (existing) return;

  // Log as pending before we attempt delivery
  const alertRecord = await dbInsert('alerts', {
    flag_id:         flag.id,
    patient_id:      patient.id,
    run_id:          runId,
    alert_date:      today,
    recipient_id:    patient.care_manager_id,
    alert_type:      alertType,
    delivery_status: 'pending'
  });

  try {
    const notifUrl = process.env.NOTIFICATION_API_URL;
    const notifKey = process.env.NOTIFICATION_API_KEY;
    if (!notifUrl) throw new Error('NOTIFICATION_API_URL not configured');

    const res = await fetch(notifUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${notifKey}`
      },
      body: JSON.stringify({
        recipient_id:   patient.care_manager_id,
        patient_name:   `${patient.first_name} ${patient.last_name}`,
        patient_id:     patient.cciq_patient_id,
        flag_level:     flag.flag_level,
        reason:         flag.reason,
        priority:       flag.priority,
        note:           flag.haiku_reasoning,
        action_required: 'Outreach needed — patient engagement gap detected'
      })
    });

    if (!res.ok) throw new Error(`Notification API returned ${res.status}`);

    await supabase.from('alerts')
      .update({ delivery_status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', alertRecord.id);

  } catch (err) {
    // Log failure — do not throw. Alert failure never blocks the run.
    await supabase.from('alerts')
      .update({ delivery_status: 'failed', error_message: err.message })
      .eq('id', alertRecord.id);
    console.error(`${GOVERNANCE_ERRORS.ALERT_SEND_FAIL}:`, err.message);
  }
}

// ------------------------------------------------------------
// MAIN: runChristy()
// Called by the Vercel cron at 9:00 AM CT every morning.
// ------------------------------------------------------------
export async function runChristy() {
  const today  = new Date().toISOString().split('T')[0];
  const runId  = `christy-run-${today}-${crypto.randomUUID()}`;
  const config = await loadConfig();

  // Open the audit run record
  await dbInsert('agent_runs', {
    run_id:    runId,
    agent_id:  AGENT_ID,
    run_date:  today,
    status:    'running',
    run_metadata: {
      model:   HAIKU_MODEL,
      version: AGENT_VERSION,
      env:     process.env.VERCEL_ENV ?? 'unknown',
      config_snapshot: config
    }
  });

  let patientsEvaluated = 0;
  let flagsCreated      = 0;
  let alertsSent        = 0;
  const errors          = [];

  // Cursor-based pagination — never loads all patients at once
  let cursor  = null;
  let hasMore = true;

  while (hasMore) {
    let batch;
    try {
      batch = await getActivePatients(cursor, parseInt(config.batch_size));
    } catch (err) {
      errors.push({ phase: 'pagination', error: err.message });
      break; // stop pagination on API failure, close run below
    }

    const { patients: cciqPatients, next_cursor, has_more } = batch;
    hasMore = has_more;
    cursor  = next_cursor;

    for (const cciqPatient of cciqPatients) {
      // Per-patient error boundary: one bad record never kills the run
      try {
        // Look up our internal patient record
        const { data: patient, error: lookupErr } = await supabase
          .from('patients')
          .select('*')
          .eq('cciq_patient_id', cciqPatient.id)
          .maybeSingle();

        if (lookupErr || !patient) {
          errors.push({ patient_id: cciqPatient.id, error: 'Not found in patients table' });
          continue;
        }

        const engagementData = await getPatientEngagement(cciqPatient.id);
        const { assessment, enrollmentDays } = await evaluatePatient(patient, engagementData, config);

        // Always save snapshot (including week-1 patients)
        await saveSnapshot(patient, engagementData, enrollmentDays, runId);

        // Write flag (returns null for flag_level: "none")
        const flag = await writeFlag(patient, assessment, runId);
        if (flag) {
          flagsCreated++;
          await sendAlert(patient, flag, runId);
          alertsSent++;
        }

        patientsEvaluated++;

      } catch (err) {
        // Log, skip, continue
        errors.push({
          patient_id: cciqPatient.id,
          error:      err.message,
          timestamp:  new Date().toISOString()
        });
        console.error(`[Christy] Skipping patient ${cciqPatient.id}:`, err.message);
      }
    }
  }

  // Determine final run status
  const allFailed = patientsEvaluated === 0 && errors.length > 0;
  const runStatus = allFailed ? 'failed' : 'completed';

  // Close the audit run record
  await supabase.from('agent_runs')
    .update({
      status:             runStatus,
      completed_at:       new Date().toISOString(),
      patients_evaluated: patientsEvaluated,
      flags_created:      flagsCreated,
      alerts_sent:        alertsSent,
      error_log:          errors.length > 0 ? errors : null
    })
    .eq('run_id', runId);

  return { runId, patientsEvaluated, flagsCreated, alertsSent, errors };
}
