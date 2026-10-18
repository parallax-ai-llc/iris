'use client';

import { useMemo } from 'react';
import { cn } from '@editor/lib/convert/string';
import { ChevronDown, Volume2 } from 'lucide-react';
import { getVoicesForProvider } from '../../../constants/node-definitions';

interface VoiceSelectorProps {
  provider: string | undefined;
  value: string | undefined;
  onChange: (voice: string) => void;
}

export function VoiceSelector({ provider, value, onChange }: VoiceSelectorProps) {
  const voices = useMemo(() => {
    return getVoicesForProvider(provider || 'openai');
  }, [provider]);

  // If current value is not in the new provider's voices, reset to first voice
  const currentVoice = useMemo(() => {
    if (!value) return voices[0]?.value || '';
    const exists = voices.some((v) => v.value === value);
    return exists ? value : voices[0]?.value || '';
  }, [value, voices]);

  // Auto-reset voice when provider changes and current voice is invalid
  useMemo(() => {
    if (value && !voices.some((v) => v.value === value) && voices.length > 0) {
      onChange(voices[0].value);
    }
  }, [provider, voices, value, onChange]);

  const selectedVoice = voices.find((v) => v.value === currentVoice);

  return (
    <div>
      <label className="block text-xs text-iris-fg/50 mb-1 flex items-center gap-1">
        <Volume2 size={12} />
        Voice
      </label>
      <div className="relative">
        <select
          value={currentVoice}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md appearance-none cursor-pointer',
            'bg-iris-fg/5 border border-iris-fg/10',
            'text-iris-fg',
            'focus:outline-none focus:border-iris-tint-400/50',
            'pr-8'
          )}
        >
          {voices.map((voice) => (
            <option key={voice.value} value={voice.value} className="bg-iris-tint-800">
              {voice.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-iris-text-4 pointer-events-none"
        />
      </div>
      {selectedVoice?.description && (
        <p className="text-[10px] text-iris-text-4 mt-1">{selectedVoice.description}</p>
      )}
      {!provider && (
        <p className="text-[10px] text-amber-400/70 mt-1">Select a model first to see available voices</p>
      )}
    </div>
  );
}
