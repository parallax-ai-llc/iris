'use client';

import { Link } from 'lucide-react';

interface ConnectedNodeIndicatorProps {
  nodeName: string;
  outputLabel: string;
}

export function ConnectedNodeIndicator({
  nodeName,
  outputLabel,
}: ConnectedNodeIndicatorProps) {
  return (
    <div className="p-2 rounded-md bg-green-500/10 border border-green-500/30">
      <div className="flex items-center gap-2">
        <Link size={12} className="text-green-400" />
        <span className="text-xs text-green-300">
          {nodeName} / {outputLabel}
        </span>
      </div>
      <p className="text-xs text-white/40 mt-1">
        This input is connected via edge. Remove the edge to change source.
      </p>
    </div>
  );
}
