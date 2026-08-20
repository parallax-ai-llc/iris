/**
 * Extension Panel — renders a sandboxed iframe webview panel for extensions.
 *
 * SECURITY — the panel document is untrusted extension-authored HTML.
 *
 *  - It is delivered via `srcdoc`, NOT `contentDocument.write()`. A document
 *    written into a same-origin about:blank inherits the renderer's origin,
 *    which would hand panel scripts `parent.electronAPI.*` (file dialogs,
 *    storage, extension install IPC) and let a `ui:panel`-only extension
 *    bypass the whole permission model.
 *  - The sandbox intentionally omits `allow-same-origin`: combining it with
 *    `allow-scripts` re-enables same-origin access and voids the sandbox.
 *    With only `allow-scripts` the frame gets an opaque origin — scripts and
 *    inline handlers still run, but `parent`/`top` property access is blocked
 *    by the origin check. `postMessage` still works (cross-origin by design),
 *    which is what the example panels use.
 *  - An inline CSP blocks every remote fetch/subresource, so a panel cannot
 *    exfiltrate data over the network without the `network` permission.
 *  - No `allow-top-navigation`, `allow-popups`, `allow-modals`, or
 *    `allow-forms`: a panel cannot navigate the app away or spawn windows.
 */
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExtensionPanelProps {
  panelId: string;
  extensionId: string;
  title: string;
  html: string;
  onClose: () => void;
}

/**
 * Panel CSP: inline script/style are required (panels are inline-handler
 * driven), but nothing may be loaded from — or sent to — the network.
 */
const PANEL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

function buildPanelDocument(html: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${PANEL_CSP}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e4e4e7;
        background: transparent;
        font-size: 13px;
        line-height: 1.5;
      }
      a { color: #60a5fa; }
      button {
        cursor: pointer;
        border: none;
        background: #3f3f46;
        color: #e4e4e7;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 13px;
      }
      button:hover { background: #52525b; }
      input, select, textarea {
        background: #27272a;
        border: 1px solid #3f3f46;
        color: #e4e4e7;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 13px;
        width: 100%;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

export function ExtensionPanel({
  panelId: _panelId,
  extensionId,
  title,
  html,
  onClose,
}: ExtensionPanelProps) {
  const { t } = useTranslation('extensions');
  const srcDoc = useMemo(() => buildPanelDocument(html), [html]);

  return (
    <div className="flex flex-col h-full border-l border-zinc-800 bg-zinc-900">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-zinc-500 truncate">{extensionId}</span>
          <span className="text-sm text-zinc-300 font-medium truncate">{title}</span>
        </div>
        <button
          onClick={onClose}
          aria-label={t('runtime.closePanel')}
          title={t('runtime.closePanel')}
          className="p-1 hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Panel Content — opaque-origin sandbox, see the security note above.
          NEVER add allow-same-origin here: with allow-scripts it voids the
          sandbox and exposes parent.electronAPI to untrusted panel HTML.

          `allow="clipboard-write"` delegates only that one Permissions Policy
          feature. Without it the frame's policy for clipboard-write evaluates
          to false and every panel "copy" button fails with NotAllowedError.
          Verified in Chromium: with the attribute the frame reports
          allowsFeature('clipboard-write') === true while document.origin
          stays "null" — the sandbox is not weakened. */}
      <iframe
        srcDoc={srcDoc}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts"
        allow="clipboard-write"
        title={`Extension Panel: ${title}`}
      />
    </div>
  );
}
