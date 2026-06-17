'use client';

import { cn } from '@editor/lib/convert/string';
import { Globe } from 'lucide-react';
import { PortType } from '../../../../constants/node-definitions';

interface UrlInputContentProps {
  inputType: PortType;
  value: string;
  onChange: (value: string) => void;
}

export function UrlInputContent({
  inputType,
  value,
  onChange,
}: UrlInputContentProps) {
  const mediaTypeLabel = inputType === 'video' 
    ? 'a video' 
    : inputType === 'image' 
      ? 'an image' 
      : 'an audio';

  return (
    <div className="space-y-2">
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${inputType} URL (https://...)...`}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-md',
          'bg-white/5 border border-white/10',
          'text-white placeholder-white/40',
          'focus:outline-none focus:border-slate-400/50'
        )}
      />
      {value && value.startsWith('http') && (
        <div className="p-2 rounded-md bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2">
            <Globe size={12} className="text-green-400" />
            <span className="text-xs text-green-300 truncate">
              {value}
            </span>
          </div>
        </div>
      )}
      <p className="text-xs text-white/40">
        Enter a public URL to {mediaTypeLabel} file
      </p>
    </div>
  );
}
