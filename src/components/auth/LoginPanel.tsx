import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { LumaMark } from '@/src/components/common/LumaMark';

type AuthMode = 'signin' | 'signup' | 'reset';

export const LoginPanel: React.FC = () => {
  const { signIn, signUp, resetPassword, enterGuestMode } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode !== 'reset') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (mode === 'signup' && password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const res = await signIn(trimmedEmail, password);
        if (!res.ok) {
          setError(res.error ?? 'Unable to sign in.');
        }
      } else if (mode === 'signup') {
        const res = await signUp(trimmedEmail, password);
        if (!res.ok) {
          setError(res.error ?? 'Unable to create account.');
        } else if (res.message) {
          setSuccessMessage(res.message);
        }
      } else {
        const res = await resetPassword(trimmedEmail);
        if (!res.ok) {
          setError(res.error ?? 'Unable to send reset link.');
        } else if (res.message) {
          setSuccessMessage(res.message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--luma-canvas)] text-[var(--luma-text)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-4xl rounded-[32px] bg-[var(--luma-surface)] border border-[var(--luma-border)] shadow-[0_24px_60px_-20px_rgba(78,61,174,0.18)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Violet Brand & Privacy Panel */}
        <div className="lg:col-span-5 luma-violet-gradient text-white p-7 sm:p-9 flex flex-col justify-between relative overflow-hidden">
          <svg
            viewBox="0 0 320 140"
            preserveAspectRatio="none"
            className="absolute bottom-0 left-0 right-0 w-full h-36 pointer-events-none"
            aria-hidden="true"
          >
            <path
              d="M0 84 Q 80 30, 160 72 T 320 44 L 320 140 L 0 140 Z"
              fill="rgba(255,255,255,0.1)"
            />
          </svg>

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/18 border border-white/20 flex items-center justify-center">
                <LumaMark size={24} className="text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight">Luma</span>
            </div>

            <h1 className="mt-8 text-2xl sm:text-3xl font-bold tracking-tight text-balance leading-tight">
              Your private cycle &amp; wellness companion
            </h1>
            <p className="mt-3 text-sm text-white/80 leading-relaxed">
              Sign in with your account to automatically save and restore your
              cycle dates, symptoms, and journal notes whenever you log back in.
            </p>
          </div>

          <div className="mt-8 space-y-3 relative z-10">
            <div className="rounded-2xl bg-white/14 border border-white/15 p-3.5 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-[#86EFAC] shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-white/90">
                <span className="font-semibold block">Personal account sync</span>
                Your records are isolated per user ID in Supabase with offline
                IndexedDB caching.
              </div>
            </div>
            <div className="rounded-2xl bg-white/14 border border-white/15 p-3.5 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-[#FF9BB5] shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-white/90">
                <span className="font-semibold block">Transparent cycle insights</span>
                Honest estimates grounded strictly in your recorded history.
              </div>
            </div>
          </div>
        </div>

        {/* Right Authentication Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-center">
          {/* Segmented Mode Switch */}
          {mode !== 'reset' ? (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 p-1 rounded-2xl bg-[var(--luma-subtle)] mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => switchMode('signin')}
                className={`min-h-[42px] rounded-xl text-sm font-semibold transition-all ${
                  mode === 'signin'
                    ? 'bg-[var(--luma-plum)] text-white shadow-sm'
                    : 'text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => switchMode('signup')}
                className={`min-h-[42px] rounded-xl text-sm font-semibold transition-all ${
                  mode === 'signup'
                    ? 'bg-[var(--luma-plum)] text-white shadow-sm'
                    : 'text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                }`}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-xs font-semibold text-[var(--luma-plum)] hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          )}

          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--luma-text)] tracking-tight">
              {mode === 'signin'
                ? 'Welcome back'
                : mode === 'signup'
                ? 'Create your Luma account'
                : 'Reset your password'}
            </h2>
            <p className="mt-1 text-sm text-[var(--luma-muted)]">
              {mode === 'signin'
                ? 'Enter your email and password to load your saved Luma data.'
                : mode === 'signup'
                ? 'Register with your email and password for instant access and cloud sync.'
                : 'Enter your email address and we will send you a reset link.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--luma-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[46px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] pl-10 pr-4 py-2.5 text-sm text-[var(--luma-text)] focus:border-[var(--luma-plum)] focus:bg-[var(--luma-surface)] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-semibold text-[var(--luma-text)]"
                  >
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs font-semibold text-[var(--luma-plum)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--luma-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      mode === 'signin' ? 'current-password' : 'new-password'
                    }
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'signup' ? 'At least 6 characters' : 'Enter password'
                    }
                    className="w-full min-h-[46px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] pl-10 pr-11 py-2.5 text-sm text-[var(--luma-text)] focus:border-[var(--luma-plum)] focus:bg-[var(--luma-surface)] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-[var(--luma-muted)] hover:text-[var(--luma-text)]"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--luma-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full min-h-[46px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] pl-10 pr-4 py-2.5 text-sm text-[var(--luma-text)] focus:border-[var(--luma-plum)] focus:bg-[var(--luma-surface)] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-4 py-3 text-xs sm:text-sm text-[#B82851] dark:text-[#FFA6BE]"
              >
                {error}
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="rounded-2xl border border-[#B4E7C9] dark:border-[#2C5B42] bg-[#E7F8EE] dark:bg-[#1A3527] px-4 py-3 text-xs sm:text-sm text-[#15803D] dark:text-[#6EE7B7] flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50 shadow-[0_12px_26px_-10px_rgba(88,71,184,0.5)]"
            >
              <span>
                {submitting
                  ? 'Please wait...'
                  : mode === 'signin'
                  ? 'Sign In'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Send Reset Link'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[var(--luma-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-[var(--luma-muted)]">
              Prefer zero-account local tracking?
            </span>
            <button
              type="button"
              onClick={enterGuestMode}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-xs font-semibold text-[var(--luma-text)] whitespace-nowrap"
            >
              Continue without account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
