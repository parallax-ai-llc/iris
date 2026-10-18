'use client';

// Renderer for ConfigField type `node-multi-select`. Lets the user pick
// other nodes in the same workflow as agent tools.
//
// Used by `GEN_TEXT_TO_TEXT` (mode='agent') for its `tools` field, but the
// component is type-agnostic — anything that wants a multi-select over
// the workflow's tool-eligible nodes can use it.
//
// Filter rules:
//   • only nodes whose definition has `canBeTool: true`
//   • exclude the currently selected node (self) so an agent can't tool-call itself
//
// Value shape: `string[]` of workflow-local node IDs.

import { useMemo } from 'react';
import { cn } from '@editor/lib/convert/string';
import { Check } from 'lucide-react';
import { NODE_DEFINITIONS as SHARED_NODE_DEFINITIONS } from 'iris-nodes';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import {
  CATEGORY_ICONS,
  type ConfigFieldDefinition,
} from '../../../../constants/node-definitions';
import { useI18n } from '@editor/hooks/usei18n';

interface NodeMultiSelectFieldProps {
  field: ConfigFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function NodeMultiSelectField({
  field,
  value,
  onChange,
}: NodeMultiSelectFieldProps) {
  const { t } = useI18n();
  const { nodes, selectedNodeId } = useIrisEditorStore();

  const selectedIds = useMemo<string[]>(
    () => (Array.isArray(value) ? (value as string[]) : []),
    [value],
  );

  // Candidate list: tool-eligible nodes in this workflow, excluding self.
  const candidates = useMemo(() => {
    return nodes
      .filter((n) => n.id !== selectedNodeId)
      .map((n) => {
        const def = SHARED_NODE_DEFINITIONS[n.data.type];
        if (!def?.canBeTool) return null;
        return {
          id: n.id,
          label: n.data.label || def.label,
          typeLabel: def.label,
          category: def.category,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [nodes, selectedNodeId]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  // Prune stale ids (nodes that were deleted or whose type lost canBeTool).
  // We do this purely on render — the actual store value updates only when
  // the user next interacts. Surfacing stale ids in the chip list would be
  // misleading, so we filter them out of the display below.
  const knownIds = useMemo(() => new Set(candidates.map((c) => c.id)), [candidates]);
  const liveSelectedIds = useMemo(
    () => selectedIds.filter((id) => knownIds.has(id)),
    [selectedIds, knownIds],
  );

  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{field.label}</label>

      {candidates.length === 0 ? (
        <div
          className={cn(
            'px-3 py-3 text-xs rounded-md text-center',
            'bg-white/5 border border-dashed border-white/10',
            'text-white/40',
          )}
        >
          {t('iris.nodeConfig.noToolEligibleNodes') ||
            'No tool-eligible nodes in this workflow. Add a node that supports being used as a tool (e.g. HTTP Request, Sub-Workflow, Regex, Date, JSON Path).'}
        </div>
      ) : (
        <div
          className={cn(
            'rounded-md overflow-hidden',
            'bg-white/5 border border-white/10',
          )}
        >
          <ul className="max-h-56 overflow-y-auto divide-y divide-white/5">
            {candidates.map((c) => {
              const checked = selectedIds.includes(c.id);
              const CategoryIcon = CATEGORY_ICONS[c.category];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left',
                      'transition-colors',
                      checked ? 'bg-slate-400/10' : 'hover:bg-white/5',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center flex-shrink-0',
                        'w-4 h-4 rounded border',
                        checked
                          ? 'bg-slate-400 border-slate-400 text-slate-900'
                          : 'border-white/20',
                      )}
                    >
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    {CategoryIcon && (
                      <CategoryIcon
                        size={12}
                        className="flex-shrink-0 text-white/40"
                      />
                    )}
                    <span className="flex-1 min-w-0 truncate text-xs text-white/80">
                      {c.label}
                    </span>
                    <span
                      className="text-[10px] text-white/40 flex-shrink-0"
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      }}
                    >
                      {c.typeLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {liveSelectedIds.length > 0 && (
        <p className="text-[11px] text-white/50 mt-1.5">
          {liveSelectedIds.length}{' '}
          {liveSelectedIds.length === 1 ? 'tool selected' : 'tools selected'}
        </p>
      )}

      {field.description && (
        <p className="text-xs text-white/40 mt-1">{field.description}</p>
      )}
    </div>
  );
}
