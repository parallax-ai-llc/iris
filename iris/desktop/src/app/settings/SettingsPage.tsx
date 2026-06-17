/**
 * SettingsPage - Application settings and preferences
 */

import { memo, useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Folder,
  User,
  Bell,
  LogOut,
  ExternalLink,
  Keyboard,
  Info,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, formatFileSize } from '@/shared/lib/utils';
import { changeLanguage, APP_LANGUAGES, type AppLanguage } from '@/shared/lib/i18n';

import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useToast } from '@/shared/components/ui/useToast';
import { Button } from '@/shared/components/ui/Button';
import { WorkflowApiKeysSection } from './WorkflowApiKeysSection';

// ==================== Types ====================

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

// ==================== Sub-components ====================

const SettingsSection = memo(function SettingsSection({
  icon,
  title,
  children,
}: SettingsSectionProps) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {children}
      </div>
    </section>
  );
});

const SettingsRow = memo(function SettingsRow({
  label,
  description,
  children,
}: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex-1 min-w-0 mr-4">
        <p className="font-medium text-white">{label}</p>
        {description && (
          <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
});

const SettingToggle = memo(function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingToggleProps) {
  return (
    <SettingsRow label={label} description={description}>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
          'focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-zinc-900',
          checked ? 'bg-white/80' : 'bg-zinc-700',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full transition-all shadow-sm',
            checked ? 'left-6 bg-zinc-900' : 'left-1 bg-white'
          )}
        />
      </button>
    </SettingsRow>
  );
});

// ==================== Main Component ====================

export const SettingsPage = memo(function SettingsPage() {
  const { user, logout } = useAuthStore();
  const toast = useToast();
  const { t, i18n } = useTranslation(['settings', 'common']);

  // Local settings state
  const [defaultSavePath, setDefaultSavePath] = useState('');
  const [notifications, setNotifications] = useState({
    generationComplete: true,
    workflowErrors: true,
    updates: true,
  });
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  /** Calculate localStorage size on demand (expensive for large storage) */
  const calculateCacheSize = useCallback(() => {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      setCacheSize(totalSize * 2);
    } catch {
      // Ignore cache size estimation errors
      setCacheSize(0);
    }
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI?.app?.getVersion) {
        try {
          const version = await window.electronAPI.app.getVersion();
          setAppVersion(version);
        } catch {
          // Use default version
        }
      }

      const savedPath = await window.electronAPI?.storage?.get<string>('defaultSavePath');
      if (savedPath) {
        setDefaultSavePath(savedPath);
      } else {
        const systemDefaultPath = await (window.electronAPI?.files as { getDefaultSavePath?: () => Promise<string> })?.getDefaultSavePath?.();
        if (systemDefaultPath) {
          setDefaultSavePath(systemDefaultPath);
          await window.electronAPI?.storage?.set('defaultSavePath', systemDefaultPath);
        }
      }

      const savedNotifications = await window.electronAPI?.storage?.get<typeof notifications>('notifications');
      if (savedNotifications) setNotifications(savedNotifications);
    };
    loadSettings();
  }, []);

  // Handlers
  const handleSelectSavePath = useCallback(async () => {
    if (!window.electronAPI?.files?.selectDirectory) {
      toast.error(t('storage.desktopOnly'));
      return;
    }
    const path = await window.electronAPI.files.selectDirectory();
    if (path) {
      setDefaultSavePath(path);
      await window.electronAPI.storage?.set('defaultSavePath', path);
      toast.success(t('storage.saveLocationUpdated'));
    }
  }, [toast, t]);

  const handleNotificationChange = useCallback(
    async (key: keyof typeof notifications, value: boolean) => {
      const updated = { ...notifications, [key]: value };
      setNotifications(updated);
      await window.electronAPI?.storage?.set('notifications', updated);
    },
    [notifications]
  );

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      // Simulate update check
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.info(t('about.latestVersion'));
    } catch {
      toast.error(t('about.updateCheckFailed'));
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [toast, t]);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.info(t('common:status.loggedOut'));
  }, [logout, toast, t]);

  const handleOpenExternal = useCallback((url: string) => {
    // Open URL in system browser
    window.open(url, '_blank');
  }, []);

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-6 h-6 text-zinc-400" />
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        </div>

        {/* Account Section */}
        <SettingsSection icon={<User className="w-5 h-5" />} title={t('sections.account')}>
          {user ? (
            <div className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-200 via-white to-slate-200 flex items-center justify-center flex-shrink-0">
                  {user.profileImageThumbnail ? (
                    <img
                      src={user.profileImageThumbnail}
                      alt={user.name || 'User'}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-medium text-white">
                      {(user.name || user.email)?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-lg">
                    {user.name || 'User'}
                  </p>
                  <p className="text-sm text-zinc-500">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  leftIcon={<LogOut className="w-4 h-4" />}
                  className="text-zinc-400 hover:text-red-400"
                >
                  {t('common:buttons.logout')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-zinc-500">{t('account.notLoggedIn')}</p>
            </div>
          )}
        </SettingsSection>

        {/* Storage Section */}
        <SettingsSection icon={<Folder className="w-5 h-5" />} title={t('sections.storage')}>
          <SettingsRow
            label={t('storage.defaultSaveLocation')}
            description={defaultSavePath || t('storage.noFolderSelected')}
          >
            <Button variant="secondary" size="sm" onClick={handleSelectSavePath}>
              {t('common:buttons.choose')}
            </Button>
          </SettingsRow>
          <SettingsRow
            label={t('storage.cacheSize')}
            description={t('storage.cacheSizeDescription')}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-400">
                {cacheSize !== null ? formatFileSize(cacheSize) : (
                  <button
                    onClick={calculateCacheSize}
                    className="text-zinc-500 hover:text-zinc-300 underline transition-colors"
                  >
                    {t('storage.calculate', 'Calculate')}
                  </button>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                isLoading={isClearingCache}
                onClick={async () => {
                  setIsClearingCache(true);
                  try {
                    // Clear localStorage cache (excluding auth tokens)
                    const keysToRemove: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && !key.includes('auth') && !key.includes('token')) {
                        keysToRemove.push(key);
                      }
                    }
                    keysToRemove.forEach(key => localStorage.removeItem(key));

                    // Clear electron storage (settings are preserved)
                    // await window.electronAPI?.storage?.clear();

                    setCacheSize(0);
                    toast.success(t('storage.cacheCleared'));
                  } catch {
                    toast.error(t('storage.cacheClearFailed'));
                  } finally {
                    setIsClearingCache(false);
                  }
                }}
              >
                {t('common:buttons.clear')}
              </Button>
            </div>
          </SettingsRow>
        </SettingsSection>

        {/* Workflow API Keys (BYOK) — local engine */}
        <WorkflowApiKeysSection />

        {/* Notifications Section */}
        <SettingsSection icon={<Bell className="w-5 h-5" />} title={t('sections.notifications')}>
          <SettingToggle
            label={t('notifications.generationComplete')}
            description={t('notifications.generationCompleteDesc')}
            checked={notifications.generationComplete}
            onChange={(v) => handleNotificationChange('generationComplete', v)}
          />
          <SettingToggle
            label={t('notifications.workflowErrors')}
            description={t('notifications.workflowErrorsDesc')}
            checked={notifications.workflowErrors}
            onChange={(v) => handleNotificationChange('workflowErrors', v)}
          />
          <SettingToggle
            label={t('notifications.updates')}
            description={t('notifications.updatesDesc')}
            checked={notifications.updates}
            onChange={(v) => handleNotificationChange('updates', v)}
          />
        </SettingsSection>

        {/* Keyboard Shortcuts */}
        <SettingsSection icon={<Keyboard className="w-5 h-5" />} title={t('sections.keyboard')}>
          <div className="p-4 space-y-3">
            {[
              { keys: ['Ctrl', 'N'], action: t('keyboard.newGeneration') },
              { keys: ['Ctrl', 'S'], action: t('keyboard.saveDownload') },
              { keys: ['Ctrl', ','], action: t('keyboard.openSettings') },
              { keys: ['Esc'], action: t('keyboard.closeModal') },
              { keys: ['←', '→'], action: t('keyboard.navigateGallery') },
            ].map(({ keys, action }) => (
              <div key={action} className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">{action}</span>
                <div className="flex items-center gap-1">
                  {keys.map((key, i) => (
                    <span key={i}>
                      <kbd className="px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                        {key}
                      </kbd>
                      {i < keys.length - 1 && (
                        <span className="text-zinc-600 mx-1">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        {/* About Section */}
        <SettingsSection icon={<Info className="w-5 h-5" />} title={t('sections.about')}>
          <SettingsRow label={t('about.irisDesktop')} description={t('about.version', { version: appVersion })}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckUpdates}
              isLoading={isCheckingUpdates}
              leftIcon={!isCheckingUpdates ? <RefreshCw className="w-4 h-4" /> : undefined}
            >
              {t('about.checkUpdates')}
            </Button>
          </SettingsRow>
          <SettingsRow label={t('about.documentation')} description={t('about.documentationDesc')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenExternal('https://parallax.kr/iris/guide')}
              rightIcon={<ExternalLink className="w-4 h-4" />}
            >
              {t('common:buttons.open')}
            </Button>
          </SettingsRow>
          <SettingsRow label={t('about.privacyPolicy')} description={t('about.privacyPolicyDesc')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenExternal('https://parallax.kr/en/pp')}
              rightIcon={<ExternalLink className="w-4 h-4" />}
            >
              {t('common:buttons.open')}
            </Button>
          </SettingsRow>
          <SettingsRow label={t('about.termsOfService')} description={t('about.termsDesc')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenExternal('https://parallax.kr/en/tos')}
              rightIcon={<ExternalLink className="w-4 h-4" />}
            >
              {t('common:buttons.open')}
            </Button>
          </SettingsRow>
        </SettingsSection>

        {/* Language Section */}
        <SettingsSection icon={<Globe className="w-5 h-5" />} title={t('sections.language')}>
          <SettingsRow
            label={t('common:language.select')}
            description={t('common:language.' + i18n.language as 'common:language.en')}
          >
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value as AppLanguage)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              {APP_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {t(`common:language.${code}` as 'common:language.en')}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsSection>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-600 py-4">
          <p>{t('footer.madeBy')}</p>
          <p className="mt-1">{t('footer.copyright')}</p>
        </div>
      </div>
    </div>
  );
});

export default SettingsPage;
