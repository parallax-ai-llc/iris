'use client';

import { useI18n } from '@editor/hooks/usei18n';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import type { RunCostEstimate } from '@editor/lib/run-cost-estimate';
import { formatRunCostDetail, hasRunCost } from './run-cost-text';

interface StatusBarProps {
  isExecuting: boolean;
  costEstimate: RunCostEstimate;
  isDirty: boolean;
}

export function StatusBar({ isExecuting, costEstimate, isDirty }: StatusBarProps) {
  const { t } = useI18n();
  const { nodes, edges, lastSavedAt } = useIrisEditorStore() as {
    nodes: unknown[];
    edges: unknown[];
    lastSavedAt?: number;
  };

  const dividerColor = 'var(--color-iris-text-5, var(--color-iris-line-3))';

  // Floating status line, bottom-left of the canvas (desktop only).
  return (
    <div
      className="hidden md:flex absolute items-center pointer-events-none"
      style={{
        left: 16,
        bottom: 18,
        height: 32,
        padding: '0 12px',
        gap: 10,
        borderRadius: 10,
        zIndex: 15,
        fontSize: 10.5,
        color: 'var(--color-iris-text-4)',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        maxWidth: 'calc(50% - 220px)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            flexShrink: 0,
            background: isExecuting
              ? 'var(--color-iris-text-1)'
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

      {hasRunCost(costEstimate) && (
        <>
          <span style={{ color: dividerColor }}>|</span>
          <span className="truncate" style={{ color: 'var(--color-iris-text-3)' }}>
            {formatRunCostDetail(costEstimate, t)}
          </span>
        </>
      )}

      {lastSavedAt && (
        <>
          <span style={{ color: dividerColor }}>|</span>
          <span>
            {t('iris.statusBar.autosaved') || 'Autosaved'} · {formatRelativeTime(lastSavedAt)}
          </span>
        </>
      )}
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
