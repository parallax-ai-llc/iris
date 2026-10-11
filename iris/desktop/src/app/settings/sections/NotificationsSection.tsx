import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsSection, SettingToggle } from '../components/SettingsPrimitives';

interface NotificationPrefs {
  generationComplete: boolean;
  workflowErrors: boolean;
  updates: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { generationComplete: true, workflowErrors: true, updates: true };

export function NotificationsSection() {
  const { t } = useTranslation('settings');
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.storage
      ?.get<NotificationPrefs>('notifications')
      .then((saved) => {
        if (saved && !cancelled) setPrefs(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      const updated = { ...prefs, [key]: value };
      setPrefs(updated);
      await window.electronAPI?.storage?.set('notifications', updated);
    },
    [prefs],
  );

  return (
    <SettingsSection icon={<Bell className="w-5 h-5" />} title={t('sections.notifications')}>
      <SettingToggle
        label={t('notifications.generationComplete')}
        description={t('notifications.generationCompleteDesc')}
        checked={prefs.generationComplete}
        onChange={(v) => change('generationComplete', v)}
      />
      <SettingToggle
        label={t('notifications.workflowErrors')}
        description={t('notifications.workflowErrorsDesc')}
        checked={prefs.workflowErrors}
        onChange={(v) => change('workflowErrors', v)}
      />
      <SettingToggle
        label={t('notifications.updates')}
        description={t('notifications.updatesDesc')}
        checked={prefs.updates}
        onChange={(v) => change('updates', v)}
      />
    </SettingsSection>
  );
}
