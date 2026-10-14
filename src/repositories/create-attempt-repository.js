import { createClient } from '@supabase/supabase-js';
import { InMemoryAttemptRepository } from './in-memory-attempt-repository.js';
import { SupabaseAttemptRepository } from './supabase-attempt-repository.js';

/**
 * Picks the attempt store from configuration: Supabase when both variables are set,
 * otherwise in-memory with a warning. Set-but-wrong configuration fails fast instead of
 * silently falling back, so a typo can't lose data.
 * @param {Record<string, string | undefined>} env usually process.env (passed in by server.js)
 * @param {{warn: (message: string) => void}} [logger]
 * @returns {import('./attempt-repository.js').AttemptRepository}
 */
export function createAttemptRepository(env, logger = console) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url && !key) {
    logger.warn('[attempts] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: using in-memory storage. Attempts are lost on restart.');
    return new InMemoryAttemptRepository();
  }
  if (!url || !key) {
    throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither to use in-memory storage.');
  }
  if (!/^https:\/\/.+/.test(url)) {
    throw new Error(`SUPABASE_URL must be the project URL (https://<project-ref>.supabase.co), not "${url.split(':')[0]}:..." (a database connection string will not work).`);
  }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return new SupabaseAttemptRepository(client);
}
