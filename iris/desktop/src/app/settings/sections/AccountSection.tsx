import { useCallback } from 'react';
import { User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useToast } from '@/shared/components/ui/useToast';
import { Button } from '@/shared/components/ui/Button';
import { SettingsSection } from '../components/SettingsPrimitives';

export function AccountSection() {
  const { user, logout } = useAuthStore();
  const toast = useToast();
  const { t } = useTranslation(['settings', 'common']);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.info(t('common:status.loggedOut'));
  }, [logout, toast, t]);

  return (
    <SettingsSection icon={<User className="w-5 h-5" />} title={t('sections.account')}>
      {user ? (
        <div className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
              {user.profileImageThumbnail ? (
                <img
                  src={user.profileImageThumbnail}
                  alt={user.name || 'User'}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-xl font-medium text-white">{(user.name || user.email)?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white text-lg">{user.name || 'User'}</p>
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
  );
}
