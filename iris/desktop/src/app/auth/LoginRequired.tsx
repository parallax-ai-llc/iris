import { Lock, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/shared/stores/ui.store';

interface LoginRequiredProps {
  /** Optional override for the heading (defaults to the generic prompt). */
  title?: string;
  /** Optional override for the body copy. */
  description?: string;
}

/**
 * Login-required empty state shown in place of a cloud-only page's content when
 * the user is browsing without an account. Opens the login overlay on demand —
 * the app stays usable; this only gates features that genuinely need the cloud.
 */
export function LoginRequired({ title, description }: LoginRequiredProps) {
  const { t } = useTranslation('common');
  const openLogin = useUIStore((state) => state.openLogin);

  return (
    <div
      className="iris-card flex flex-col items-center justify-center text-center"
      style={{ padding: 48, margin: 'auto', maxWidth: 460 }}
    >
      <Lock size={48} className="mb-4" style={{ color: 'var(--text-4)' }} />
      <h2 className="t-display" style={{ fontSize: 22, marginBottom: 8 }}>
        {title ?? t('auth.loginRequiredTitle')}
      </h2>
      <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
        {description ?? t('auth.loginRequiredDesc')}
      </p>
      <button onClick={openLogin} className="dt-tpl-cta" style={{ maxWidth: 220 }}>
        <LogIn size={16} />
        {t('buttons.login')}
      </button>
    </div>
  );
}
