/**
 * ExtensionRuntimeHost — single mount point for the extension runtime UI.
 *
 * Rendered once at the app root (above every page, including the full-screen
 * editors). Wires the IPC listeners (useExtensionRuntime) and the Main →
 * Renderer API request receivers (useExtensionApiBridge), and renders the
 * permission dialog, extension panels, the extension status bar, and the
 * iris.window.showInputBox modal.
 */
import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useExtensionRuntime } from '@/features/extensions/hooks/useExtensionRuntime';
import { useExtensionApiBridge, type InputBoxRequest } from '@/features/extensions/hooks/useExtensionApiBridge';
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';
import { ExtensionPermissionDialog } from './ExtensionPermissionDialog';
import { ExtensionPanel } from './ExtensionPanel';
import { ExtensionStatusBar } from './ExtensionStatusBar';

/** Width of the docked panel rail. Mirrors --ext-panel-width consumers. */
const PANEL_DOCK_WIDTH = '320px';

export function ExtensionRuntimeHost() {
  const { pendingPermission, approvePermissions, denyPermissions } = useExtensionRuntime();
  const { inputBoxRequest, submitInputBox, cancelInputBox } = useExtensionApiBridge();
  const registeredPanels = useExtensionRuntimeStore((s) => s.registeredPanels);
  const unregisterPanel = useExtensionRuntimeStore((s) => s.unregisterPanel);
  const statusBarItems = useExtensionRuntimeStore((s) => s.registeredStatusBarItems);

  // Panels contributed with inline HTML (iris.window.createPanel).
  const panels = Object.values(registeredPanels).filter((p) => p.html);
  const hasStatusBarItems = Object.keys(statusBarItems).length > 0;
  const hasPanels = panels.length > 0;

  // Reserve real layout room for the dock instead of floating over the app.
  // Every shell consumes --ext-panel-width: `.dt-shell-body` for the standard
  // AppLayout, `.ext-dock-inset` for full-screen surfaces (FullScreenLayout),
  // so content shrinks and nothing gets covered or click-blocked. Cleared when
  // the last panel closes so an app with no panels is completely unaffected.
  useEffect(() => {
    const root = document.documentElement;
    if (hasPanels) {
      root.style.setProperty('--ext-panel-width', PANEL_DOCK_WIDTH);
    } else {
      root.style.removeProperty('--ext-panel-width');
    }
    return () => {
      root.style.removeProperty('--ext-panel-width');
    };
  }, [hasPanels]);

  /**
   * Close a panel — the single close call site.
   *
   * Clearing the runtime store alone is not enough: the main process keeps
   * panels in the `extensions:getContributions` snapshot, so a closed panel
   * would come back on the next reload. `dismissPanel` drops it there too.
   * A `success: false` reply just means the id was already gone — not an
   * error, and nothing to surface to the user.
   */
  const handleClosePanel = useCallback(
    (panelId: string) => {
      unregisterPanel(panelId);
      void window.electronAPI?.extensions?.dismissPanel?.(panelId)?.catch(() => {
        // Snapshot cleanup is best effort — the panel is already closed here.
      });
    },
    [unregisterPanel]
  );

  return (
    <>
      {/* Permission approval dialog */}
      {pendingPermission && (
        <ExtensionPermissionDialog
          extensionId={pendingPermission.extensionId}
          extensionName={
            pendingPermission.manifest.displayName || pendingPermission.manifest.name
          }
          publisher={pendingPermission.manifest.publisher}
          requiredPermissions={pendingPermission.requiredPermissions}
          onApprove={(permissions) => void approvePermissions(permissions)}
          onDeny={denyPermissions}
        />
      )}

      {/* iris.window.showInputBox modal */}
      {inputBoxRequest && (
        <ExtensionInputBoxModal
          request={inputBoxRequest}
          onSubmit={submitInputBox}
          onCancel={cancelInputBox}
        />
      )}

      {/* Extension panels (iris.window.createPanel) — docked right rail.
          `.ext-panel-dock` occupies exactly the strip reserved via
          --ext-panel-width, so it never sits on top of app UI (see
          globals.css). Panels are opaque and fill the rail. */}
      {hasPanels && (
        <div className="ext-panel-dock shadow-2xl">
          {panels.map((panel) => (
            <div key={panel.id} className="flex-1 min-h-0">
              <ExtensionPanel
                panelId={panel.id}
                extensionId={panel.extensionId}
                title={panel.title}
                html={panel.html ?? ''}
                onClose={() => handleClosePanel(panel.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Extension status bar items — bottom-right strip, shifted clear of
          the panel dock when one is open. */}
      {hasStatusBarItems && (
        <div
          className="fixed bottom-1 z-40 flex items-center rounded-md bg-zinc-900/90 border border-zinc-800 px-1"
          style={{ right: 'calc(0.5rem + var(--ext-panel-width, 0px))' }}
        >
          <ExtensionStatusBar />
        </div>
      )}
    </>
  );
}

// ─── Input box modal (iris.window.showInputBox) ───

interface ExtensionInputBoxModalProps {
  request: InputBoxRequest;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function ExtensionInputBoxModal({ request, onSubmit, onCancel }: ExtensionInputBoxModalProps) {
  const { t } = useTranslation('extensions');
  const [value, setValue] = useState(request.value ?? '');

  // Reset the field when a new request replaces the current one.
  useEffect(() => {
    setValue(request.value ?? '');
  }, [request.requestId, request.value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-4"
      >
        <div className="text-xs text-zinc-500 mb-1">{request.extensionId}</div>
        <label className="block text-sm text-zinc-200 mb-3">{request.prompt}</label>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={request.placeholder}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            {t('runtime.inputCancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            {t('runtime.inputSubmit')}
          </button>
        </div>
      </form>
    </div>
  );
}
