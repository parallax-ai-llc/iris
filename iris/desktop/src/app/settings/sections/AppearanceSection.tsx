import { useRef, type KeyboardEvent } from 'react';
import { Palette, Moon, Sun, Monitor, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { THEME_PREFERENCES, type ThemePreference } from '@/shared/lib/theme';
import { useThemeStore } from '@/shared/stores/theme.store';
import { SettingsSection } from '../components/SettingsPrimitives';
import { nextTabIndex } from '../settingsTabs';

const ICONS: Record<ThemePreference, typeof Moon> = { dark: Moon, light: Sun, system: Monitor };

/** Theme picker: Dark / Light / System. Editors keep their dark canvas whatever is chosen. */
export function AppearanceSection() {
  const { t } = useTranslation('settings');
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const refs = useRef<Partial<Record<ThemePreference, HTMLButtonElement | null>>>({});

  // Radio group: arrows move the checked option (same rule as the tablist).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextTabIndex(e.key, THEME_PREFERENCES.indexOf(preference), THEME_PREFERENCES.length);
    if (next === null) return;
    e.preventDefault();
    const value = THEME_PREFERENCES[next];
    void setPreference(value);
    refs.current[value]?.focus();
  };

  return (
    <SettingsSection
      icon={<Palette className="w-5 h-5" />}
      title={t('sections.appearance')}
      description={t('appearance.themeDesc')}
    >
      <div className="p-4">
        <p id="settings-theme-label" className="font-medium text-white mb-3">
          {t('appearance.theme')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('appearance.theme')}
          className="grid grid-cols-3 gap-3"
        >
          {THEME_PREFERENCES.map((value) => {
            const Icon = ICONS[value];
            const checked = preference === value;
            return (
              <button
                key={value}
                ref={(el) => {
                  refs.current[value] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => void setPreference(value)}
                onKeyDown={onKeyDown}
                className={cn(
                  'relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--iris-violet)]',
                  checked
                    ? 'border-[var(--iris-violet)] bg-[var(--surf-3)]'
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-[var(--surf-2)]',
                )}
              >
                <ThemeSwatch value={value} />
                <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                  <Icon className="w-4 h-4" aria-hidden />
                  {t(`appearance.${value}`)}
                </span>
                {checked && (
                  <Check className="absolute top-2 right-2 w-4 h-4 text-[var(--iris-violet)]" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 mt-3">{t('appearance.editorsNote')}</p>
      </div>
    </SettingsSection>
  );
}

/** Fixed-colour preview of each theme (literal colours: it must look the same in both themes). */
function ThemeSwatch({ value }: { value: ThemePreference }) {
  const dark = <span className="flex-1 h-full bg-[#101019]" />;
  const light = <span className="flex-1 h-full bg-[#f4f4f5]" />;
  return (
    <span className="flex w-full h-10 rounded-md overflow-hidden border border-black/10" aria-hidden>
      {value === 'dark' && dark}
      {value === 'light' && light}
      {value === 'system' && (
        <>
          {light}
          {dark}
        </>
      )}
    </span>
  );
}
