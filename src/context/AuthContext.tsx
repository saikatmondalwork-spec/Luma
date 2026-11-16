import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { formatAuthError, supabase } from '@/src/lib/supabase';

const GUEST_MODE_KEY = 'luma_local_guest_mode';

interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  authLoading: boolean;
  guestMode: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  resetPassword: (email: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [guestMode, setGuestMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(GUEST_MODE_KEY) === 'true';
  });

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      if (nextSession) {
        setGuestMode(false);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(GUEST_MODE_KEY);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          return { ok: false, error: formatAuthError(error) };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: formatAuthError(err) };
      }
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const trimmedEmail = email.trim();
      try {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) {
          return { ok: false, error: formatAuthError(error) };
        }
        if (data.session) {
          return { ok: true, message: 'Account created and signed in.' };
        }

        // If Supabase returned user without session, attempt immediate password sign-in
        const signInRes = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!signInRes.error && signInRes.data.session) {
          return { ok: true, message: 'Account created and signed in.' };
        }

        return {
          ok: false,
          error:
            'Account was created, but your Supabase project still has "Confirm email" enabled. Turn OFF Authentication → Providers → Email → Confirm email in your Supabase Dashboard to skip confirmation emails.',
        };
      } catch (err) {
        return { ok: false, error: formatAuthError(err) };
      }
    },
    []
  );

  const resetPassword = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      try {
        const redirectTo =
          typeof window !== 'undefined' ? window.location.origin : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          redirectTo ? { redirectTo } : undefined
        );
        if (error) {
          return { ok: false, error: formatAuthError(error) };
        }
        return {
          ok: true,
          message:
            'If an account exists for that email, a password reset link has been sent.',
        };
      } catch (err) {
        return { ok: false, error: formatAuthError(err) };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setGuestMode(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(GUEST_MODE_KEY);
    }
  }, []);

  const enterGuestMode = useCallback(() => {
    setGuestMode(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GUEST_MODE_KEY, 'true');
    }
  }, []);

  const exitGuestMode = useCallback(() => {
    setGuestMode(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(GUEST_MODE_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        authLoading,
        guestMode,
        signIn,
        signUp,
        resetPassword,
        signOut,
        enterGuestMode,
        exitGuestMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
