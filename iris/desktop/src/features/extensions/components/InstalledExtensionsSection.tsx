/**
 * InstalledExtensionsSection — the run surface for installed extensions.
 *
 * Lists every extension present in the local Electron runtime together with the
 * commands and tools it contributes, and executes one on click via
 * `extensions:executeCommand` / `extensions:executeTool`. Without this, an
 * extension that declares commands but no keybinding (the `iris-ext create`
 * scaffold) registers its contributions with no way to invoke them: the legacy
 * `ToolsPage` is not routed anywhere, so it is not a usable surface.
 *
 * Contributions are merged from two sources, **field by field**:
 *  - `manifest.contributes.*` — declared statically; executing an entry lazily
 *    activates the extension through its `onCommand:`/`onTool:` activation event.
 *  - the runtime store — registered at activation time, including entries added
 *    dynamically by the extension.
 *
 * The runtime payload may omit the human-readable title (the worker only sends
 * the id for some contribution types), so a runtime entry must never blank out a
 * label the manifest already provided — otherwise chips degrade to raw ids like
 * `publisher.ext.command`.
 *
 * Renders nothing when no extension is installed locally, so the marketplace
 * page is unchanged for users without extensions.
 */
import { useCallback, useEffect, useState } from 'react';
import { Play, Loader2, Puzzle, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/lib/toast';
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';
import type { ExtensionRuntimeInfoData } from '@/types/electron';

interface RunnableEntry {
  id: string;
  title: string;
}

/** Status values that mean the extension cannot currently run anything. */
const INERT_STATUSES = new Set(['disabled', 'error']);

/**
 * Merge one entry into the map without letting a missing label overwrite an
 * existing one. Falls back to the id so a chip always has a readable face.
 */
function upsertEntry(
  byId: Map<string, RunnableEntry>,
  id: string,
  title: string | undefined
): void {
  const existing = byId.get(id);
  byId.set(id, { id, title: title || existing?.title || id });
}

export function InstalledExtensionsSection() {
  const { t } = useTranslation('extensions');
  const [installed, setInstalled] = useState<ExtensionRuntimeInfoData[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const registeredCommands = useExtensionRuntimeStore((s) => s.registeredCommands);
  const registeredTools = useExtensionRuntimeStore((s) => s.registeredTools);
  // Status changes arrive over IPC and land here — used to re-read the
  // installed list so activation/uninstall is reflected without a reload.
  const activeExtensions = useExtensionRuntimeStore((s) => s.activeExtensions);

  useEffect(() => {
    const api = window.electronAPI?.extensions;
    if (!api) return;
    let cancelled = false;

    void (async () => {
      try {
        const infos = (await api.getInstalled()) as ExtensionRuntimeInfoData[];
        if (!cancelled) setInstalled(infos);
      } catch {
        if (!cancelled) setInstalled([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeExtensions]);

  const commandsFor = useCallback(
    (info: ExtensionRuntimeInfoData): RunnableEntry[] => {
      const byId = new Map<string, RunnableEntry>();
      for (const c of info.manifest?.contributes?.commands ?? []) {
        upsertEntry(byId, c.command, c.title);
      }
      for (const c of Object.values(registeredCommands)) {
        if (c.extensionId !== info.id) continue;
        upsertEntry(byId, c.id, c.title);
      }
      return [...byId.values()];
    },
    [registeredCommands]
  );

  const toolsFor = useCallback(
    (info: ExtensionRuntimeInfoData): RunnableEntry[] => {
      const byId = new Map<string, RunnableEntry>();
      for (const tool of info.manifest?.contributes?.tools ?? []) {
        upsertEntry(byId, tool.id, tool.name);
      }
      for (const tool of Object.values(registeredTools)) {
        if (tool.extensionId !== info.id) continue;
        upsertEntry(byId, tool.id, tool.name);
      }
      return [...byId.values()];
    },
    [registeredTools]
  );

  const run = useCallback(
    async (kind: 'command' | 'tool', entry: RunnableEntry) => {
      const api = window.electronAPI?.extensions;
      if (!api || runningId) return;

      setRunningId(entry.id);
      try {
        const result =
          kind === 'command'
            ? await api.executeCommand(entry.id)
            : await api.executeTool(entry.id, {});
        if (result.success) {
          toast.success(t('installed.runSuccess', { command: entry.title }));
        } else {
          toast.error(
            t('installed.runError', {
              command: entry.title,
              error: result.error ?? 'unknown',
            })
          );
        }
      } catch (err) {
        toast.error(
          t('installed.runError', {
            command: entry.title,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      } finally {
        setRunningId(null);
      }
    },
    [runningId, t]
  );

  if (installed.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Puzzle className="w-4 h-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-white">{t('installed.title')}</h2>
        <span className="text-xs text-zinc-500">{installed.length}</span>
      </div>

      <div className="space-y-2">
        {installed.map((info) => {
          const commands = commandsFor(info);
          const tools = toolsFor(info);
          const inert = INERT_STATUSES.has(info.status);
          const label = info.manifest?.displayName || info.manifest?.name || info.id;

          const renderChips = (kind: 'command' | 'tool', entries: RunnableEntry[]) => (
            <div className="flex flex-wrap gap-1.5">
              {entries.map((entry) => {
                const isRunning = runningId === entry.id;
                return (
                  <button
                    key={`${kind}:${entry.id}`}
                    onClick={() => void run(kind, entry)}
                    disabled={inert || runningId !== null}
                    title={entry.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700 hover:text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800'
                    )}
                  >
                    {isRunning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : kind === 'command' ? (
                      <Play className="w-3 h-3" />
                    ) : (
                      <Wrench className="w-3 h-3" />
                    )}
                    {entry.title}
                  </button>
                );
              })}
            </div>
          );

          return (
            <div
              key={info.id}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-white truncate">{label}</span>
                <span className="text-[11px] text-zinc-500 truncate">{info.id}</span>
                <span
                  className={cn(
                    'ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium',
                    info.status === 'active'
                      ? 'bg-emerald-900/40 text-emerald-400'
                      : info.status === 'error'
                        ? 'bg-red-900/30 text-red-400'
                        : 'bg-zinc-700/50 text-zinc-400'
                  )}
                >
                  {info.status}
                </span>
              </div>

              {commands.length === 0 && tools.length === 0 ? (
                <p className="text-xs text-zinc-500">{t('installed.noRunnable')}</p>
              ) : (
                <div className="space-y-2">
                  {commands.length > 0 && (
                    <div>
                      <p className="text-[11px] text-zinc-500 mb-1">
                        {t('installed.commands')}
                      </p>
                      {renderChips('command', commands)}
                    </div>
                  )}
                  {tools.length > 0 && (
                    <div>
                      <p className="text-[11px] text-zinc-500 mb-1">
                        {t('installed.tools')}
                      </p>
                      {renderChips('tool', tools)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
