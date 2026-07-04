/**
 * EffectsPanel - Effects and transitions panel for video editor
 * Browse and apply video effects, transitions, and audio effects
 *
 * Features:
 * - Categorized effect library
 * - Drag to clip support
 * - Effect preview
 * - Search functionality
 */

import { memo, useState, useCallback, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Search, X, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { VideoEffectDefinition } from '../effects/types';
import { EFFECT_CATEGORY_DEFINITIONS } from '../effects/registry';
import { CATEGORY_ICONS, EFFECT_ICONS } from './effectIcons';

interface EffectsPanelProps {
  className?: string;
  selectedClipType?: string;
  appliedEffects?: Map<string, string>;
  onEffectDragStart?: (effect: EffectDefinition) => void;
  onEffectApply?: (effect: EffectDefinition) => void;
  onEffectRemove?: (instanceId: string) => void;
}

/** Pure effect definition (../effects) adorned with its renderer-only icon. */
export interface EffectDefinition extends VideoEffectDefinition {
  icon: LucideIcon;
}

// Effect categories — derived from the pure effect registry + renderer icon maps.
const EFFECT_CATEGORIES: Record<string, { name: string; icon: LucideIcon; effects: EffectDefinition[] }> =
  Object.fromEntries(
    EFFECT_CATEGORY_DEFINITIONS.map((c) => [
      c.key,
      {
        name: c.name,
        icon: CATEGORY_ICONS[c.key] ?? Sparkles,
        effects: c.effects.map((e) => ({
          ...e,
          icon: EFFECT_ICONS[e.id] ?? CATEGORY_ICONS[c.key] ?? Sparkles,
        })),
      },
    ])
  );

// Effect item component
const EffectItem = memo(function EffectItem({
  effect,
  onDragStart,
  onApply,
}: {
  effect: EffectDefinition;
  onDragStart?: (effect: EffectDefinition) => void;
  onApply?: (effect: EffectDefinition) => void;
}) {
  const Icon = effect.icon;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/effect', JSON.stringify(effect));
      e.dataTransfer.effectAllowed = 'copy';
      onDragStart?.(effect);
    },
    [effect, onDragStart]
  );

  const handleDoubleClick = useCallback(() => {
    onApply?.(effect);
  }, [effect, onApply]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg cursor-grab',
        'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent hover:border-zinc-700',
        'transition-all group'
      )}
    >
      <div className="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-600 transition-colors">
        <Icon className="w-4 h-4 text-zinc-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{effect.name}</p>
        <p className="text-[10px] text-zinc-500 truncate">{effect.description}</p>
      </div>
    </div>
  );
});

// Category section component
const CategorySection = memo(function CategorySection({
  category,
  effects,
  isExpanded,
  onToggle,
  onEffectDragStart,
  onEffectApply,
}: {
  category: { name: string; icon: typeof Sparkles };
  effects: EffectDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
  onEffectDragStart?: (effect: EffectDefinition) => void;
  onEffectApply?: (effect: EffectDefinition) => void;
}) {
  const Icon = category.icon;

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-white">{category.name}</span>
        <span className="ml-auto text-xs text-zinc-500">{effects.length}</span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1">
          {effects.map((effect) => (
            <EffectItem
              key={effect.id}
              effect={effect}
              onDragStart={onEffectDragStart}
              onApply={onEffectApply}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Main EffectsPanel component
export const EffectsPanel = memo(function EffectsPanel({
  className,
  selectedClipType: _selectedClipType,
  appliedEffects: _appliedEffects,
  onEffectDragStart,
  onEffectApply,
  onEffectRemove: _onEffectRemove,
}: EffectsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['transitions', 'colorCorrection'])
  );

  // Toggle category expansion
  const toggleCategory = useCallback((categoryKey: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  }, []);

  // Filter effects by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return EFFECT_CATEGORIES as Record<string, { name: string; icon: typeof Sparkles; effects: EffectDefinition[] }>;
    }

    const query = searchQuery.toLowerCase();
    const result: Record<string, { name: string; icon: typeof Sparkles; effects: EffectDefinition[] }> = {};

    for (const [key, category] of Object.entries(EFFECT_CATEGORIES)) {
      const filteredEffects = category.effects.filter(
        (effect) =>
          effect.name.toLowerCase().includes(query) ||
          effect.description.toLowerCase().includes(query)
      );

      if (filteredEffects.length > 0) {
        result[key] = {
          ...category,
          effects: filteredEffects as EffectDefinition[],
        };
      }
    }

    return result;
  }, [searchQuery]);

  const hasResults = Object.keys(filteredCategories).length > 0;

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-white">Effects</h3>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search effects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Effects list */}
      <div className="flex-1 overflow-auto">
        {!hasResults ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Sparkles className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 mb-1">No effects found</p>
            <p className="text-xs text-zinc-500">Try a different search term</p>
          </div>
        ) : (
          Object.entries(filteredCategories).map(([key, category]) => (
            <CategorySection
              key={key}
              category={category}
              effects={category.effects as EffectDefinition[]}
              isExpanded={expandedCategories.has(key) || !!searchQuery}
              onToggle={() => toggleCategory(key)}
              onEffectDragStart={onEffectDragStart}
              onEffectApply={onEffectApply}
            />
          ))
        )}
      </div>

      {/* Usage hint */}
      <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-800/50">
        <p className="text-[10px] text-zinc-500 text-center">
          Drag effects to clips or double-click to apply
        </p>
      </div>
    </div>
  );
});

export default EffectsPanel;
