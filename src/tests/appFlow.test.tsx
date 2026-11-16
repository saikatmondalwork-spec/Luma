import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/src/App';
import { wipeAllLocalData } from '@/src/services/storageService';

const authMock = vi.hoisted(() => {
  type AuthListener = (event: string, session: unknown) => void;
  let listeners: AuthListener[] = [];

  const mockSession = {
    access_token: 'mock-access-token',
    token_type: 'bearer',
    user: {
      id: 'user-123',
      email: 'elena@luma.app',
    },
  };

  // In-memory mock tables keyed by table name
  const tables: Record<string, Array<Record<string, unknown>>> = {
    luma_users: [],
    luma_user_settings: [],
    luma_cycles: [],
    luma_daily_logs: [],
  };

  function makeTableQuery(tableName: string) {
    const rows = tables[tableName] ?? [];
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];

    const applyFilters = () =>
      rows.filter((r) => filters.every((fn) => fn(r)));

    const chain = {
      select: (_cols?: string) => chain,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return chain;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      order: (_col: string, _opts?: { ascending?: boolean }) => ({
        then: (resolve: (val: { data: unknown[]; error: null }) => void) =>
          resolve({ data: applyFilters(), error: null }),
      }),
      maybeSingle: async () => ({
        data: applyFilters()[0] ?? null,
        error: null,
      }),
      upsert: async (
        payload: Record<string, unknown> | Array<Record<string, unknown>>,
        opts?: { onConflict?: string }
      ) => {
        const items = Array.isArray(payload) ? payload : [payload];
        const conflictCols = (opts?.onConflict ?? 'id')
          .split(',')
          .map((c) => c.trim());

        for (const item of items) {
          const idx = rows.findIndex((existing) =>
            conflictCols.every((c) => existing[c] === item[c])
          );
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...item };
          } else {
            rows.push({ ...item });
          }
        }
        return { error: null };
      },
      delete: () => ({
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return {
            in: async (inCol: string, vals: unknown[]) => {
              filters.push((r) => vals.includes(r[inCol]));
              tables[tableName] = rows.filter(
                (r) => !filters.every((fn) => fn(r))
              );
              return { error: null };
            },
            then: (resolve: (val: { error: null }) => void) => {
              tables[tableName] = rows.filter(
                (r) => !filters.every((fn) => fn(r))
              );
              resolve({ error: null });
            },
          };
        },
      }),
      then: (resolve: (val: { data: unknown[]; error: null }) => void) =>
        resolve({ data: applyFilters(), error: null }),
    };

    return chain;
  }

  return {
    mockSession,
    tables,
    from: vi.fn((tableName: string) => makeTableQuery(tableName)),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => {
      listeners.forEach((cb) => cb('SIGNED_IN', mockSession));
      return { data: { session: mockSession, user: mockSession.user }, error: null };
    }),
    signUp: vi.fn(async () => {
      listeners.forEach((cb) => cb('SIGNED_IN', mockSession));
      return {
        data: { session: mockSession, user: mockSession.user },
        error: null,
      };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => {
      listeners.forEach((cb) => cb('SIGNED_OUT', null));
      return { error: null };
    }),
    onAuthStateChange: vi.fn((cb: AuthListener) => {
      listeners.push(cb);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners = listeners.filter((item) => item !== cb);
            },
          },
        },
      };
    }),
    resetMocks: () => {
      listeners = [];
      tables.luma_users = [];
      tables.luma_user_settings = [];
      tables.luma_cycles = [];
      tables.luma_daily_logs = [];
      authMock.from.mockClear();
      authMock.getSession.mockClear();
      authMock.signInWithPassword.mockClear();
      authMock.signUp.mockClear();
      authMock.resetPasswordForEmail.mockClear();
      authMock.signOut.mockClear();
      authMock.onAuthStateChange.mockClear();
    },
  };
});

vi.mock('@/src/lib/supabase', () => ({
  SUPABASE_PROJECT_ID: 'hrallhfsbatwxiqbvfeo',
  supabase: {
    from: authMock.from,
    auth: {
      getSession: authMock.getSession,
      signInWithPassword: authMock.signInWithPassword,
      signUp: authMock.signUp,
      resetPasswordForEmail: authMock.resetPasswordForEmail,
      signOut: authMock.signOut,
      onAuthStateChange: authMock.onAuthStateChange,
    },
  },
  formatAuthError: (err: unknown) =>
    err instanceof Error ? err.message : 'Authentication failed.',
}));

describe('Luma end-to-end UI flows', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    authMock.resetMocks();
    await wipeAllLocalData('guest');
    await wipeAllLocalData('user-123');
    document.documentElement.classList.remove('dark');
  });

  it('signs up without email confirmation, stores user & health data in Supabase, and restores it on re-login', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });

    // Switch to Create Account tab and validate mismatched passwords
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'elena@luma.app' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'different123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(authMock.signUp).not.toHaveBeenCalled();

    // Fix confirm password and sign up directly without email confirmation
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authMock.signUp).toHaveBeenCalledWith({
        email: 'elena@luma.app',
        password: 'secret123',
      });
      expect(screen.getByText('Calm, private cycle tracking')).toBeInTheDocument();
    });

    // Complete onboarding
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText('Personalize your tracking')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /skip & finish/i }));

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    // Log a journal note so user data is saved to Supabase
    fireEvent.click(screen.getAllByRole('button', { name: /journal/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Health Journal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/private journal note/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/private journal note/i), {
      target: { value: 'Cloud-synced cycle note for Elena.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save check-in/i }));

    await waitFor(() => {
      expect(authMock.tables.luma_users.length).toBe(1);
      expect(authMock.tables.luma_user_settings.length).toBe(1);
      expect(authMock.tables.luma_daily_logs.length).toBe(1);
    });

    // Sign out from Settings
    fireEvent.click(screen.getAllByRole('button', { name: /settings/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Signed in via Supabase as elena@luma\.app/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0]);
    await waitFor(() => {
      expect(authMock.signOut).toHaveBeenCalled();
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });

    // Wipe local browser cache to prove data comes back from Supabase on re-login
    await wipeAllLocalData('user-123');

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'elena@luma.app' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Skips onboarding because cloud settings had onboardingCompleted = true, and restores note
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /journal/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Cloud-synced cycle note for Elena.')).toBeInTheDocument();
    });
  });

  it('continues without account, completes onboarding, navigates all pages, logs a daily check-in, and switches theme', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue without account/i }));

    await waitFor(() => {
      expect(screen.getByText('Calm, private cycle tracking')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText('Personalize your tracking')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /skip & finish/i }));

    // Redesigned Bento Dashboard renders
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Cycle Rhythm')).toBeInTheDocument();
      expect(screen.getByText('Daily Check-in')).toBeInTheDocument();
    });

    // Toggle Overview wave mode and Right Panel tab
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Periods' }));

    // Navigate to Calendar
    fireEvent.click(screen.getAllByRole('button', { name: /calendar/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Cycle Calendar')).toBeInTheDocument();
    });

    // Navigate to Insights
    fireEvent.click(screen.getAllByRole('button', { name: /insights/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Cycle Insights/i)).toBeInTheDocument();
    });

    // Navigate to Journal & log entry
    fireEvent.click(screen.getAllByRole('button', { name: /journal/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Health Journal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/private journal note/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/private journal note/i), {
      target: { value: 'Feeling rested and calm today.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save check-in/i }));

    await waitFor(() => {
      expect(screen.getByText('Feeling rested and calm today.')).toBeInTheDocument();
    });

    // Navigate to Settings and switch theme to dark
    fireEvent.click(screen.getAllByRole('button', { name: /settings/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Settings & Privacy/i)).toBeInTheDocument();
      expect(screen.getByText(/Currently using Local Guest Mode/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /evening dark/i }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});


