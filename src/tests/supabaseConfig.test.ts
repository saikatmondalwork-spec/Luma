import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUPABASE_KEY,
  DEFAULT_SUPABASE_URL,
  resolveSupabaseKey,
  resolveSupabaseUrl,
  supabase,
} from '@/src/lib/supabase';

describe('Supabase client configuration & env fallback', () => {
  it('initializes a valid Supabase client instance', () => {
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it('ignores placeholder or non-HTTP(S) Supabase URLs and falls back to default', () => {
    expect(resolveSupabaseUrl(undefined)).toBe(DEFAULT_SUPABASE_URL);
    expect(resolveSupabaseUrl('')).toBe(DEFAULT_SUPABASE_URL);
    expect(resolveSupabaseUrl('MY_SUPABASE_URL')).toBe(DEFAULT_SUPABASE_URL);
    expect(resolveSupabaseUrl('not-a-url')).toBe(DEFAULT_SUPABASE_URL);
    expect(resolveSupabaseUrl('ftp://example.com')).toBe(DEFAULT_SUPABASE_URL);
    expect(resolveSupabaseUrl('https://custom.supabase.co')).toBe(
      'https://custom.supabase.co'
    );
  });

  it('ignores placeholder Supabase publishable keys and falls back to default', () => {
    expect(resolveSupabaseKey(undefined)).toBe(DEFAULT_SUPABASE_KEY);
    expect(resolveSupabaseKey('')).toBe(DEFAULT_SUPABASE_KEY);
    expect(resolveSupabaseKey('MY_SUPABASE_PUBLISHABLE_KEY')).toBe(
      DEFAULT_SUPABASE_KEY
    );
    expect(resolveSupabaseKey('sb_publishable_valid_override_key_123456')).toBe(
      'sb_publishable_valid_override_key_123456'
    );
  });
});
