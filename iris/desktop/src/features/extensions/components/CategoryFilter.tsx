import { memo } from 'react';
import { Brain, Workflow, Plug, Grid3X3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';

interface CategoryFilterProps {
  activeType: string;
  onTypeChange: (type: string) => void;
}

const TYPE_ITEMS = [
  { id: 'all', icon: Grid3X3, labelKey: 'categories.all' },
  { id: 'ai_tool', icon: Brain, labelKey: 'categories.ai_tools' },
  { id: 'workflow_template', icon: Workflow, labelKey: 'categories.workflows' },
  { id: 'integration', icon: Plug, labelKey: 'categories.integrations' },
];

export const CategoryFilter = memo(function CategoryFilter({
  activeType,
  onTypeChange,
}: CategoryFilterProps) {
  const { t } = useTranslation('extensions');

  return (
    <div className="flex gap-1.5 flex-wrap">
      {TYPE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeType === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onTypeChange(item.id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
            )}
          >
            <Icon className="w-4 h-4" />
            {t(item.labelKey)}
          </button>
        );
      })}
    </div>
  );
});
