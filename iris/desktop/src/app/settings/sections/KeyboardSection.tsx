import { Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCombo } from '@/shared/lib/shortcuts';
import { pageHistoryShortcutKeys } from '@/shared/hooks/useKeyboardShortcuts';
import { SettingsSection } from '../components/SettingsPrimitives';

/**
 * Shortcuts that work outside the editors (see useKeyboardShortcuts,
 * useAssistantShortcut, LibraryPage). Editor shortcuts live in the editor menus.
 * Every row here must actually fire: the E2E suite presses each one.
 */
export function KeyboardSection() {
  const { t } = useTranslation('settings');
  const rows = [
    { keys: [...formatCombo('Mod+1').split('+').slice(0, -1), '1…0'], action: t('keyboard.goToPage') },
    { keys: pageHistoryShortcutKeys(), action: t('keyboard.backForward') },
    { keys: formatCombo('Mod+,').split('+'), action: t('keyboard.openSettings') },
    { keys: formatCombo('Mod+/').split('+'), action: t('keyboard.toggleAssistant') },
    { keys: ['Esc'], action: t('keyboard.closeModal') },
    { keys: ['←', '→'], action: t('keyboard.previewItems') },
  ];

  return (
    <SettingsSection icon={<Keyboard className="w-5 h-5" />} title={t('sections.keyboard')}>
      <div className="p-4 space-y-3">
        {rows.map(({ keys, action }) => (
          <div key={action} className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">{action}</span>
            <div className="flex items-center gap-1">
              {keys.map((key, i) => (
                <span key={i}>
                  <kbd className="px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                    {key}
                  </kbd>
                  {i < keys.length - 1 && <span className="text-zinc-600 mx-1">+</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-zinc-500 pt-1">{t('keyboard.editorNote')}</p>
      </div>
    </SettingsSection>
  );
}
