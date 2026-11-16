import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://hrallhfsbatwxiqbvfeo.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_4W5yZddIS2226JESRqs6xA_nrubHb9S';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  DEFAULT_SUPABASE_URL;

const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  DEFAULT_SUPABASE_KEY;

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
