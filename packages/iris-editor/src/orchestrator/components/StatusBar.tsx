'use client';

import { useI18n } from '@editor/hooks/usei18n';
import { useIrisEditorStore } from '@editor/store/iris-editor';

interface StatusBarProps {
  isExecuting: boolean;
  estimatedTokens: number;
  isDirty: boolean;
}

export function StatusBar({ isExecuting, estimatedTokens, isDirty }: StatusBarProps) {
  const { t } = useI18n();
  const { nodes, edges, lastSavedAt } = useIrisEditorStore() as {
    nodes: unknown[];
    edges: unknown[];
    lastSavedAt?: number;
  };

  const dividerColor = 'rgba(255,255,255,0.22)';

  return (
    <div
      className="flex items-center"
      style={{
        height: 36,
        flexShrink: 0,
        padding: '0 16px',
        gap: 14,
        borderTop: '1px solid var(--color-iris-line-1)',
        background: 'rgba(7,7,10,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        fontSize: 11,
        color: 'var(--color-iris-text-4)',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      }}
    >
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: isExecuting
              ? 'var(--color-iris-violet)'
              : isDirty
              ? 'var(--color-iris-warn)'
              : 'var(--color-iris-ok)',
          }}
        />
        <span style={{ color: 'var(--color-iris-text-2)' }}>
          {isExecuting
            ? t('iris.statusBar.running') || 'Running'
            : isDirty
            ? t('iris.statusBar.dirty') || 'Unsaved'
            : t('iris.statusBar.ready') || 'Ready'}
        </span>
        <span>
          · {nodes.length} {t('iris.statusBar.nodes') || 'nodes'} · {edges.length}{' '}
          {t('iris.statusBar.edges') || 'edges'}
        </span>
      </span>

      {estimatedTokens > 0 && (
        <>
          <span style={{ color: dividerColor }}>|</span>
          <span>
            {t('iris.statusBar.estCost') || 'Est. cost'}{' '}
            <span style={{ color: 'var(--color-iris-text-2)' }}>
              ~{estimatedTokens.toLocaleString()} tokens
            </span>
          </span>
        </>
      )}

      <span style={{ flex: 1 }} />

      {lastSavedAt && (
        <>
          <span>
            {t('iris.statusBar.autosaved') || 'Autosaved'} ·{' '}
            {formatRelativeTime(lastSavedAt)}
          </span>
          <span style={{ color: dividerColor }}>|</span>
        </>
      )}
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span className="inline-flex items-center" style={{ gap: 2 }}>
          <span
            style={{
              width: 4,
              height: 8,
              background: 'var(--color-iris-ok)',
              borderRadius: 1,
            }}
          />
          <span
            style={{
              width: 4,
              height: 8,
              background: 'var(--color-iris-ok)',
              borderRadius: 1,
            }}
          />
          <span
            style={{
              width: 4,
              height: 8,
              background: 'var(--color-iris-ok)',
              borderRadius: 1,
              opacity: 0.5,
            }}
          />
        </span>
        Iris API
      </span>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
