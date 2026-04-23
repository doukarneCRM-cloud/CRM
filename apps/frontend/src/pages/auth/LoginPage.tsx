import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { authService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import type { LoginResponse } from '@/types/auth';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    statusCode?: number;
    ttl?: number;
    attemptsRemaining?: number;
  };
}

// ─── Lockout countdown hook ───────────────────────────────────────────────────
function useLockoutTimer(initialTTL: number | null) {
  const [ttl, setTtl] = useState<number | null>(initialTTL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ttl === null || ttl <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTtl((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(intervalRef.current!);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ttl]);

  const start = (seconds: number) => setTtl(seconds);
  const isLocked = ttl !== null && ttl > 0;

  const formatted = ttl
    ? `${Math.floor(ttl / 60)}:${String(ttl % 60).padStart(2, '0')}`
    : null;

  return { isLocked, formatted, start };
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl font-bold text-white shadow-card"
        style={{ background: 'linear-gradient(135deg, #18181B 0%, #27272A 100%)' }}
      >
        A
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold text-primary">Anaqatoki</h1>
        <p className="text-xs text-gray-400 font-medium tracking-wide">CRM Platform</p>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const { isLocked, formatted: lockoutFormatted, start: startLockout } = useLockoutTimer(null);

  useEffect(() => {
    if (!shake) return;
    const timer = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(timer);
  }, [shake]);

  if (isAuthenticated) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || loading) return;

    setError(null);
    setLoading(true);

    try {
      const { data } = await authService.login(email.trim(), password, rememberMe);
      const res = data as LoginResponse;
      setAuth(res.user, res.accessToken, res.refreshToken);
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: ApiErrorBody } };
      const status = axiosErr.response?.status;
      const errBody = axiosErr.response?.data?.error;

      setShake(true);

      if (status === 429 && errBody?.ttl) {
        startLockout(errBody.ttl);
        setError(null);
      } else if (status === 401) {
        const remaining = errBody?.attemptsRemaining;
        setAttemptsRemaining(typeof remaining === 'number' ? remaining : null);
        setError('Invalid email or password.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #F4F4F5 0%, #E4E4E7 35%, #71717A 70%, #18181B 100%)',
      }}
    >
      {/* Decorative blurred orbs */}
      <div
        className="pointer-events-none fixed left-1/4 top-1/4 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: '#18181B' }}
      />
      <div
        className="pointer-events-none fixed bottom-1/4 right-1/4 h-48 w-48 rounded-full opacity-15 blur-3xl"
        style={{ background: '#09090B' }}
      />

      {/* Glass card */}
      <div
        className={cn(
          'glass-modal w-full max-w-[400px] px-8 py-10',
          shake && 'shake',
        )}
      >
        {/* Logo */}
        <div className="mb-8">
          <Logo />
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
          <p className="mt-1 text-sm text-gray-500">Sign in to Anaqatoki</p>
        </div>

        {/* Lockout banner */}
        {isLocked && lockoutFormatted && (
          <div className="mb-5 flex items-center gap-3 rounded-input border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">Account temporarily locked</p>
              <p className="text-xs text-red-500">Try again in {lockoutFormatted}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <CRMInput
            label="Email address"
            type="email"
            placeholder="agent@anaqatoki.ma"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail size={15} />}
            required
            disabled={isLocked}
            autoComplete="email"
          />

          <CRMInput
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock size={15} />}
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-gray-400 transition-colors hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
            required
            disabled={isLocked}
            autoComplete="current-password"
          />

          {/* Remember me */}
          <label className="flex cursor-pointer items-center gap-2.5">
            <div className="relative">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border-2 transition-colors',
                  rememberMe
                    ? 'border-primary bg-primary'
                    : 'border-gray-300 bg-white',
                )}
              >
                {rememberMe && (
                  <svg
                    className="h-2.5 w-2.5 text-white"
                    fill="none"
                    viewBox="0 0 12 12"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-gray-600">Remember me for 30 days</span>
          </label>

          {/* Error message */}
          {error && !isLocked && (
            <div className="flex items-start gap-2 rounded-input border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm text-red-700">{error}</p>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <p className="mt-0.5 text-xs text-red-400">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                  </p>
                )}
              </div>
            </div>
          )}

          <CRMButton
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={isLocked || !email || !password}
            className="mt-1 w-full"
          >
            {isLocked ? `Locked — ${lockoutFormatted}` : 'Sign In'}
          </CRMButton>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Anaqatoki CRM &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
