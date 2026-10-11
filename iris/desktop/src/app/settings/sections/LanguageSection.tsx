import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, APP_LANGUAGES, type AppLanguage } from '@/shared/lib/i18n';
import { SettingsRow, SettingsSection } from '../components/SettingsPrimitives';

export function LanguageSection() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  return (
    <SettingsSection icon={<Globe className="w-5 h-5" />} title={t('sections.language')}>
      <SettingsRow
        label={t('common:language.select')}
        description={t(('common:language.' + i18n.language) as 'common:language.en')}
      >
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value as AppLanguage)}
          aria-label={t('common:language.select')}
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
  );
}
