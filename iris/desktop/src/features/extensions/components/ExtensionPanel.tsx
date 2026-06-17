/**
 * Extension Panel — renders an iframe-based webview panel for extensions.
 */
import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface ExtensionPanelProps {
  panelId: string;
  extensionId: string;
  title: string;
  html: string;
  onClose: () => void;
}

export function ExtensionPanel({
  panelId: _panelId,
  extensionId,
  title,
  html,
  onClose,
}: ExtensionPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Write HTML content to iframe
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
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
        </html>
      `);
      doc.close();
    }
  }, [html]);

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
          className="p-1 hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Panel Content */}
      <iframe
        ref={iframeRef}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin"
        title={`Extension Panel: ${title}`}
      />
    </div>
  );
}
