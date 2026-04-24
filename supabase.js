// ============================================================
// lib/supabase.js
// Supabase client — service role only, RLS enforced at DB level
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { GOVERNANCE_ERRORS } from './governance.js';

// Supabase new protocol: SUPABASE_SECRET_KEY
// Legacy SUPABASE_SERVICE_KEY kept as fallback for compatibility
const supabaseUrl    = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl)    throw new Error(GOVERNANCE_ERRORS.CONFIG_MISSING + ': SUPABASE_URL');
if (!supabaseSecret) throw new Error(GOVERNANCE_ERRORS.CONFIG_MISSING + ': SUPABASE_SECRET_KEY');

export const supabase = createClient(supabaseUrl, supabaseSecret, {
  auth: { persistSession: false }
});

// Wrapper that always logs to Supabase and throws named errors on failure
export async function dbInsert(table, data) {
  const { data: result, error } = await supabase.from(table).insert(data).select().single();
  if (error) throw new Error(`${GOVERNANCE_ERRORS.SUPABASE_WRITE_FAIL} [${table}]: ${error.message}`);
  return result;
}

export async function dbUpsert(table, data, conflictColumn) {
  const { data: result, error } = await supabase
    .from(table)
    .upsert(data, { onConflict: conflictColumn, ignoreDuplicates: true })
    .select()
    .single();
  if (error) throw new Error(`${GOVERNANCE_ERRORS.SUPABASE_WRITE_FAIL} [${table}]: ${error.message}`);
  return result;
}

export async function loadConfig() {
  const { data, error } = await supabase.from('christy_config').select('key, value');
  if (error) throw new Error(GOVERNANCE_ERRORS.CONFIG_MISSING);
  return data.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}
