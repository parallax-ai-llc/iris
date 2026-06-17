/**
 * Settings → Workflow API Keys (BYOK).
 *
 * Workflows run locally on the embedded engine; provider keys come from a base
 * `.env` (`<userData>/iris-flow/.env`) and can be OVERRIDDEN here. Overrides are
 * stored encrypted in the main process (safeStorage) and never round-trip the
 * raw value back to the renderer — we only show set/override status + last 4.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { KeyRound, Check, X, FileCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/shared/components/ui/useToast';
import { Button } from '@/shared/components/ui/Button';
import type { IrisKeyStatus } from '@/types/electron';

export const WorkflowApiKeysSection = memo(function WorkflowApiKeysSection() {
  const toast = useToast();
  const { t } = useTranslation(['settings', 'common']);
  const [statuses, setStatuses] = useState<IrisKeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingVar, setSavingVar] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.iris
      ?.getKeyStatus?.()
      .then((s) => setStatuses(s ?? []))
      .catch(() => setStatuses([]));
  }, []);

  const save = useCallback(
    async (envVar: string) => {
      const value = drafts[envVar] ?? '';
      if (!value.trim()) return;
      setSavingVar(envVar);
      try {
        const next = await window.electronAPI.iris.setKey(envVar, value);
        setStatuses(next);
        setDrafts((d) => ({ ...d, [envVar]: '' }));
        toast.success(t('apiKeys.saved', 'API key saved'));
      } catch {
        toast.error(t('apiKeys.saveFailed', 'Failed to save API key'));
      } finally {
        setSavingVar(null);
      }
    },
    [drafts, toast, t],
  );

  const clearOverride = useCallback(
    async (envVar: string) => {
      setSavingVar(envVar);
      try {
        const next = await window.electronAPI.iris.setKey(envVar, '');
        setStatuses(next);
        setDrafts((d) => ({ ...d, [envVar]: '' }));
        toast.info(t('apiKeys.cleared', 'Override removed'));
      } catch {
        toast.error(t('apiKeys.saveFailed', 'Failed to update API key'));
      } finally {
        setSavingVar(null);
      }
    },
    [toast, t],
  );

  // Desktop-only feature; if the engine bridge is unavailable, render nothing.
  if (!window.electronAPI?.iris?.getKeyStatus) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-zinc-200 mb-1 flex items-center gap-2">
        <KeyRound className="w-5 h-5" />
        {t('apiKeys.title', 'Workflow API Keys (BYOK)')}
      </h2>
      <p className="text-sm text-zinc-500 mb-4">
        {t(
          'apiKeys.description',
          'Keys for local workflow execution. A value set here overrides the .env file.',
        )}{' '}
        <button
          onClick={() => window.electronAPI?.iris?.openEnvFile?.()}
          className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 underline"
        >
          <FileCog className="w-3.5 h-3.5" />
          {t('apiKeys.openEnv', 'Open .env')}
        </button>
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {statuses.map((s) => (
          <div key={s.envVar} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-white">{s.label}</span>
                {s.hasOverride ? (
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                    <Check className="w-3 h-3" />
                    {t('apiKeys.overridden', 'Overridden')} ••••{s.last4}
                  </span>
                ) : s.hasEnv ? (
                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300">
                    {t('apiKeys.fromEnv', 'From .env')} ••••{s.last4}
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                    {t('apiKeys.notSet', 'Not set')}
                  </span>
                )}
              </div>
              {s.hasOverride && (
                <button
                  onClick={() => clearOverride(s.envVar)}
                  disabled={savingVar === s.envVar}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400"
                  title={t('apiKeys.removeOverride', 'Remove override')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={drafts[s.envVar] ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.envVar]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save(s.envVar);
                }}
                placeholder={`${s.envVar}…`}
                className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-white/30"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                variant="secondary"
                size="sm"
                isLoading={savingVar === s.envVar}
                disabled={!(drafts[s.envVar] ?? '').trim()}
                onClick={() => save(s.envVar)}
              >
                {t('common:buttons.save', 'Save')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

export default WorkflowApiKeysSection;
