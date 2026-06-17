/**
 * DefaultOptions - Empty state hint for Options Bar
 */

import { memo } from 'react';
import { Info } from 'lucide-react';

export const DefaultOptions = memo(function DefaultOptions() {
  return (
    <div className="flex items-center gap-2 text-zinc-500">
      <Info className="w-3.5 h-3.5" />
      <span className="text-[11px]">Select a tool to see options</span>
    </div>
  );
});
