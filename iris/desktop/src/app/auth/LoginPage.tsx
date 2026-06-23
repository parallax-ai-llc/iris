import { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { IrisLogo } from '@/shared/components/common/IrisLogo';
import { TitleBar } from '@/app/layout/TitleBar';
import type { StoredUser } from '@/features/auth/lib/token-storage';

// OAuth timeout: if no callback within 2 minutes, allow user to retry
const OAUTH_TIMEOUT_MS = 2 * 60 * 1000;

// Simple SVG icons for social login
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

interface LoginPageProps {
  /** When provided, the page renders as a dismissable overlay with a close
   *  button and auto-closes once the user is authenticated. */
  onClose?: () => void;
}

export function LoginPage({ onClose }: LoginPageProps = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const { login, loginWithOAuth, isLoading, error, isAuthenticated } = useAuthStore();
  const { t } = useTranslation('common');
  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oauthCallbackReceivedRef = useRef(false);

  // Dismiss the overlay automatically once login succeeds.
  useEffect(() => {
    if (isAuthenticated) onClose?.();
  }, [isAuthenticated, onClose]);

  // Cancel ongoing OAuth loading state
  const cancelOAuthLoading = useCallback(() => {
    setOauthLoading(null);
    if (oauthTimeoutRef.current) {
      clearTimeout(oauthTimeoutRef.current);
      oauthTimeoutRef.current = null;
    }
  }, []);

  // Listen for OAuth callback from main process
  useEffect(() => {
    const handleOAuthCallback = async (data: {
      accessToken: string;
      refreshToken: string;
      user: StoredUser;
    }) => {
      oauthCallbackReceivedRef.current = true;
      cancelOAuthLoading();
      setOauthError(null);

      // Save tokens and user data
      await loginWithOAuth(data.accessToken, data.refreshToken, data.user);
    };

    const handleOAuthError = (data: { error: string }) => {
      oauthCallbackReceivedRef.current = true;
      cancelOAuthLoading();
      setOauthError(data.error);
    };

    // Set up listeners (only in Electron environment)
    if (window.electronAPI?.auth) {
      window.electronAPI.auth.onOAuthCallback(handleOAuthCallback);
      window.electronAPI.auth.onOAuthError(handleOAuthError);
    }

    // Cleanup listeners on unmount
    return () => {
      window.electronAPI?.auth?.removeOAuthListeners();
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
      }
    };
  }, [loginWithOAuth, cancelOAuthLoading]);

  // When app regains focus while OAuth is loading, reset after a short delay
  // (user may have closed the browser or cancelled OAuth)
  useEffect(() => {
    if (!oauthLoading) return;

    const handleFocus = () => {
      // Give a short grace period for the callback to arrive after focus
      setTimeout(() => {
        if (!oauthCallbackReceivedRef.current) {
          cancelOAuthLoading();
        }
      }, 3000);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [oauthLoading, cancelOAuthLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOauthError(null);
    await login(email, password);
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    setOauthError(null);
    oauthCallbackReceivedRef.current = false;

    // Auto-reset after timeout (e.g. browser closed without completing OAuth)
    if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    oauthTimeoutRef.current = setTimeout(() => {
      if (!oauthCallbackReceivedRef.current) {
        setOauthLoading(null);
      }
    }, OAUTH_TIMEOUT_MS);

    try {
      // Open system browser for OAuth (only in Electron environment)
      if (window.electronAPI?.auth?.openOAuth) {
        await window.electronAPI.auth.openOAuth(provider);
      } else {
        cancelOAuthLoading();
        setOauthError('OAuth is only available in the desktop app');
      }
    } catch {
      cancelOAuthLoading();
      setOauthError('Failed to open authentication window');
    }
  };

  const displayError = oauthError || error;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <TitleBar hideNav />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-12 right-4 z-10 p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors no-drag"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <IrisLogo variant="white" size="xl" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Iris</h1>
          <p className="text-zinc-500">Sign in to continue</p>
        </div>

        {/* Social Login Buttons */}
        <div className="space-y-3 mb-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              disabled={isLoading || oauthLoading !== null}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-medium transition-all',
                'bg-white text-zinc-900',
                'hover:bg-zinc-100',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-3'
              )}
            >
              {oauthLoading === 'google' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              {oauthLoading === 'google' ? 'Waiting for login...' : 'Continue with Google'}
            </button>
            {oauthLoading === 'google' && (
              <button
                type="button"
                onClick={cancelOAuthLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => handleSocialLogin('apple')}
              disabled={isLoading || oauthLoading !== null}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-medium transition-all',
                'bg-zinc-900 text-white border border-zinc-700',
                'hover:bg-zinc-800',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-3'
              )}
            >
              {oauthLoading === 'apple' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <AppleIcon />
              )}
              {oauthLoading === 'apple' ? 'Waiting for login...' : 'Continue with Apple'}
            </button>
            {oauthLoading === 'apple' && (
              <button
                type="button"
                onClick={cancelOAuthLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-zinc-950 text-zinc-500">or continue with email</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isLoading || oauthLoading !== null}
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600',
                'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading || oauthLoading !== null}
                className={cn(
                  'w-full px-4 py-3 rounded-xl pr-12',
                  'bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {displayError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {displayError}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || oauthLoading !== null || !email || !password}
            className={cn(
              'w-full py-3 rounded-xl font-medium transition-colors',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'hover:from-white hover:to-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-neutral-900 flex items-center justify-center gap-2'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-zinc-600 text-sm mt-8">
          Don't have an account?{' '}
          <a
            href="https://parallax.kr/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 hover:text-white"
          >
            Sign up
          </a>
        </p>

        {/* Proceed without an account — the app is fully usable for local tools. */}
        {onClose && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || oauthLoading !== null}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('auth.continueWithout')}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
