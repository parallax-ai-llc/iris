'use client';

import { cn } from '@editor/lib/convert/string';
import { ConfigFieldDefinition } from '../../../../constants/node-definitions';
import { ChevronDown } from 'lucide-react';
import { HeadersEditor } from './HeadersEditor';
import { NodeMultiSelectField } from './NodeMultiSelectField';

export function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
      return (
        <div>
          <label className="block text-xs text-iris-fg/50 mb-1">{field.label}</label>
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md',
              'bg-iris-fg/5 border border-iris-fg/10',
              'text-iris-fg placeholder-iris-fg/40',
              'focus:outline-none focus:border-iris-tint-400/50'
            )}
          />
          {field.description && (
            <p className="text-xs text-iris-text-4 mt-1">{field.description}</p>
          )}
        </div>
      );

    case 'textarea':
      return (
        <div>
          <label className="block text-xs text-iris-fg/50 mb-1">{field.label}</label>
          <textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md resize-none',
              'bg-iris-fg/5 border border-iris-fg/10',
              'text-iris-fg placeholder-iris-fg/40',
              'focus:outline-none focus:border-iris-tint-400/50'
            )}
          />
          {field.description && (
            <p className="text-xs text-iris-text-4 mt-1">{field.description}</p>
          )}
        </div>
      );

    case 'number':
      return (
        <div>
          <label className="block text-xs text-iris-fg/50 mb-1">{field.label}</label>
          <input
            type="number"
            value={(value as number) ?? field.defaultValue ?? ''}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md',
              'bg-iris-fg/5 border border-iris-fg/10',
              'text-iris-fg',
              'focus:outline-none focus:border-iris-tint-400/50'
            )}
          />
        </div>
      );

    case 'select':
      return (
        <div>
          <label className="block text-xs text-iris-fg/50 mb-1">{field.label}</label>
          <div className="relative">
            <select
              value={String(value ?? field.defaultValue ?? '')}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md appearance-none cursor-pointer',
                'bg-iris-fg/5 border border-iris-fg/10',
                'text-iris-fg',
                'focus:outline-none focus:border-iris-tint-400/50',
                'pr-8'
              )}
            >
              <option value="" className="bg-iris-tint-800">
                Select...
              </option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-iris-tint-800">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-iris-text-4 pointer-events-none"
            />
          </div>
        </div>
      );

    case 'slider': {
      const numValue = (value as number) ?? field.defaultValue ?? field.min ?? 0;
      return (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-iris-fg/50">{field.label}</label>
            <span className="text-xs text-iris-fg/70">{numValue}</span>
          </div>
          <input
            type="range"
            value={numValue}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step || 0.1}
            className="w-full accent-iris-tint-400"
          />
        </div>
      );
    }

    case 'headers':
      return (
        <HeadersEditor
          label={field.label}
          description={field.description}
          value={value}
          onChange={onChange}
        />
      );

    case 'node-multi-select':
      return (
        <NodeMultiSelectField
          field={field}
          value={value}
          onChange={onChange}
        />
      );

    case 'toggle': {
      const isOn = value === true;
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-iris-fg/70">{field.label}</label>
          <button
            onClick={() => onChange(!isOn)}
            className={cn(
              'relative w-10 h-5 rounded-full transition-colors',
              isOn ? 'bg-iris-tint-400' : 'bg-iris-fg/20'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                isOn ? 'left-5' : 'left-0.5'
              )}
            />
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
