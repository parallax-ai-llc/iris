/**
 * SettingsPage - application settings, one section per tab.
 *
 * Each section is its own component under `sections/` (plus the BYOK
 * `WorkflowApiKeysSection`); `SettingsTabs` shows one at a time and remembers
 * the last tab used.
 */

import { memo, useMemo } from 'react';
import { Settings, User, Palette, Globe, Bell, Folder, Keyboard, KeyRound, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsTabs, type SettingsTabDef } from './components/SettingsTabs';
import { AccountSection } from './sections/AccountSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LanguageSection } from './sections/LanguageSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { StorageSection } from './sections/StorageSection';
import { KeyboardSection } from './sections/KeyboardSection';
import { AboutSection } from './sections/AboutSection';
import { WorkflowApiKeysSection } from './WorkflowApiKeysSection';

export const SettingsPage = memo(function SettingsPage() {
  const { t } = useTranslation('settings');

  const tabs = useMemo<SettingsTabDef[]>(
    () => [
      { id: 'account', label: t('sections.account'), icon: <User />, render: () => <AccountSection /> },
      { id: 'appearance', label: t('sections.appearance'), icon: <Palette />, render: () => <AppearanceSection /> },
      { id: 'language', label: t('sections.language'), icon: <Globe />, render: () => <LanguageSection /> },
      { id: 'notifications', label: t('sections.notifications'), icon: <Bell />, render: () => <NotificationsSection /> },
      { id: 'storage', label: t('sections.storage'), icon: <Folder />, render: () => <StorageSection /> },
      { id: 'keyboard', label: t('sections.keyboard'), icon: <Keyboard />, render: () => <KeyboardSection /> },
      { id: 'apiKeys', label: t('sections.apiKeys'), icon: <KeyRound />, render: () => <WorkflowApiKeysSection /> },
      { id: 'about', label: t('sections.about'), icon: <Info />, render: () => <AboutSection /> },
    ],
    [t],
  );

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-6 h-6 text-zinc-400" />
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        </div>
        <SettingsTabs tabs={tabs} label={t('tabsLabel')} />
      </div>
    </div>
  );
});

export default SettingsPage;
