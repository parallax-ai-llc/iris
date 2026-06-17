import { memo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExtensionSortOption } from '@/shared/api/extension.types';

interface SortDropdownProps {
  value: ExtensionSortOption;
  onChange: (sort: ExtensionSortOption) => void;
}

const SORT_OPTIONS: { value: ExtensionSortOption; labelKey: string }[] = [
  { value: 'popular', labelKey: 'sort.popular' },
  { value: 'rating', labelKey: 'sort.rating' },
  { value: 'recent', labelKey: 'sort.newest' },
  { value: 'name', labelKey: 'sort.name' },
];

export const SortDropdown = memo(function SortDropdown({
  value,
  onChange,
}: SortDropdownProps) {
  const { t } = useTranslation('extensions');

  return (
    <div className="relative flex items-center gap-1.5">
      <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ExtensionSortOption)}
        className="bg-transparent text-sm text-zinc-400 border-none outline-none cursor-pointer appearance-none pr-4 hover:text-zinc-300"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-800 text-zinc-300">
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
});
