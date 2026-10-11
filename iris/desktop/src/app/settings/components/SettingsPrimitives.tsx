/**
 * Building blocks shared by the Settings sections: a titled card, a labelled
 * row and an on/off switch row.
 */

import { memo, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  /** Optional line under the title. */
  description?: ReactNode;
  children: ReactNode;
}

export const SettingsSection = memo(function SettingsSection({
  icon,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="mb-8">
      <h2 className={cn('text-lg font-semibold text-zinc-200 flex items-center gap-2', description ? 'mb-1' : 'mb-4')}>
        {icon}
        {title}
      </h2>
      {description && <p className="text-sm text-zinc-500 mb-4">{description}</p>}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {children}
      </div>
    </section>
  );
});

interface SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

export const SettingsRow = memo(function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex-1 min-w-0 mr-4">
        <p className="font-medium text-white">{label}</p>
        {description && <p className="text-sm text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
});

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const SettingToggle = memo(function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingToggleProps) {
  return (
    <SettingsRow label={label} description={description}>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
          'focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-zinc-900',
          checked ? 'bg-white/80' : 'bg-zinc-700',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full transition-all shadow-sm',
            checked ? 'left-6 bg-zinc-900' : 'left-1 bg-white',
          )}
        />
      </button>
    </SettingsRow>
  );
});
