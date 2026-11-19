import { createClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://hrallhfsbatwxiqbvfeo.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_4W5yZddIS2226JESRqs6xA_nrubHb9S';

export function resolveSupabaseUrl(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_SUPABASE_URL;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('MY_')) return DEFAULT_SUPABASE_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    // Fall back to default URL below
  }
  return DEFAULT_SUPABASE_URL;
}

export function resolveSupabaseKey(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_SUPABASE_KEY;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('MY_') || trimmed.length < 20) {
    return DEFAULT_SUPABASE_KEY;
  }
  return trimmed;
}

const supabaseUrl = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey = resolveSupabaseKey(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_PROJECT_ID = 'hrallhfsbatwxiqbvfeo';

export function formatAuthError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials')) {
      return 'Incorrect email or password. Please check your credentials and try again.';
    }
    if (lower.includes('email not confirmed')) {
      return 'This Supabase project currently has email confirmation turned on. Disable "Confirm email" in Supabase Dashboard → Authentication → Providers → Email to sign in without confirmation mail.';
    }
    if (lower.includes('user already registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (lower.includes('email rate limit')) {
      return 'Too many email requests in Supabase. Disable "Confirm email" under Authentication → Providers → Email in your Supabase Dashboard.';
    }
    return msg;
  }
  return 'Authentication failed. Please try again.';
}
