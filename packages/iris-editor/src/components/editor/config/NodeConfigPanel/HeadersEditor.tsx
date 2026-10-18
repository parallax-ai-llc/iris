'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { useI18n } from '@editor/hooks/usei18n';
import type { HeaderEntry } from '../../../../constants/node-definitions';

// Common header names used for the key-field autocomplete.
const COMMON_HEADER_NAMES = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Auth-Token',
  'X-Forwarded-For',
  'X-Requested-With',
];

interface HeaderPreset {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  key: string;
  value: string;
}

// Presets the user can one-click insert. Values are intentionally partial
// (e.g. "Bearer ") so the user just fills in the token after inserting.
const HEADER_PRESETS: HeaderPreset[] = [
  {
    id: 'auth-bearer',
    labelKey: 'iris.headersEditor.presets.authBearer',
    fallbackLabel: 'Authorization: Bearer …',
    key: 'Authorization',
    value: 'Bearer ',
  },
  {
    id: 'auth-basic',
    labelKey: 'iris.headersEditor.presets.authBasic',
    fallbackLabel: 'Authorization: Basic …',
    key: 'Authorization',
    value: 'Basic ',
  },
  {
    id: 'content-json',
    labelKey: 'iris.headersEditor.presets.contentJson',
    fallbackLabel: 'Content-Type: application/json',
    key: 'Content-Type',
    value: 'application/json',
  },
  {
    id: 'content-form',
    labelKey: 'iris.headersEditor.presets.contentForm',
    fallbackLabel: 'Content-Type: application/x-www-form-urlencoded',
    key: 'Content-Type',
    value: 'application/x-www-form-urlencoded',
  },
  {
    id: 'content-multipart',
    labelKey: 'iris.headersEditor.presets.contentMultipart',
    fallbackLabel: 'Content-Type: multipart/form-data',
    key: 'Content-Type',
    value: 'multipart/form-data',
  },
  {
    id: 'accept-json',
    labelKey: 'iris.headersEditor.presets.acceptJson',
    fallbackLabel: 'Accept: application/json',
    key: 'Accept',
    value: 'application/json',
  },
  {
    id: 'x-api-key',
    labelKey: 'iris.headersEditor.presets.apiKey',
    fallbackLabel: 'X-API-Key: …',
    key: 'X-API-Key',
    value: '',
  },
  {
    id: 'user-agent',
    labelKey: 'iris.headersEditor.presets.userAgent',
    fallbackLabel: 'User-Agent: …',
    key: 'User-Agent',
    value: '',
  },
  {
    id: 'cache-no-cache',
    labelKey: 'iris.headersEditor.presets.cacheNoCache',
    fallbackLabel: 'Cache-Control: no-cache',
    key: 'Cache-Control',
    value: 'no-cache',
  },
];

// Accept the legacy `Record<string,string>` shape and convert to entries.
// Falsy/unknown shapes become an empty list.
function normalizeToEntries(value: unknown): HeaderEntry[] {
  if (Array.isArray(value)) {
    return value
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        key: typeof e.key === 'string' ? e.key : '',
        value: typeof e.value === 'string' ? e.value : '',
        enabled: e.enabled !== false,
      }));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, v]) => ({
      key,
      value: typeof v === 'string' ? v : v == null ? '' : String(v),
      enabled: true,
    }));
  }
  return [];
}

const datalistId = 'iris-http-header-names';

export function HeadersEditor({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: unknown;
  onChange: (value: HeaderEntry[]) => void;
}) {
  const { t } = useI18n();
  const [presetOpen, setPresetOpen] = useState(false);
  const presetBtnRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => normalizeToEntries(value), [value]);

  useEffect(() => {
    if (!presetOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!presetBtnRef.current?.contains(e.target as Node)) {
        setPresetOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [presetOpen]);

  const emit = (next: HeaderEntry[]) => onChange(next);

  const updateRow = (index: number, patch: Partial<HeaderEntry>) => {
    const next = entries.map((row, i) => (i === index ? { ...row, ...patch } : row));
    emit(next);
  };

  const removeRow = (index: number) => {
    emit(entries.filter((_, i) => i !== index));
  };

  const addRow = (entry?: HeaderEntry) => {
    emit([...entries, { key: '', value: '', enabled: true, ...(entry ?? {}) }]);
  };

  const addPreset = (preset: HeaderPreset) => {
    addRow({ key: preset.key, value: preset.value, enabled: true });
    setPresetOpen(false);
  };

  const presetLabel = (p: HeaderPreset) => {
    const translated = t(p.labelKey);
    return translated && translated !== p.labelKey ? translated : p.fallbackLabel;
  };

  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{label}</label>

      <datalist id={datalistId}>
        {COMMON_HEADER_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="space-y-1.5">
        {entries.map((row, index) => {
          const enabled = row.enabled !== false;
          return (
            <div key={index} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => updateRow(index, { enabled: e.target.checked })}
                title={enabled ? t('iris.headersEditor.disable') || 'Disable' : t('iris.headersEditor.enable') || 'Enable'}
                className="w-3.5 h-3.5 accent-slate-400 cursor-pointer flex-shrink-0"
              />
              <input
                type="text"
                list={datalistId}
                value={row.key}
                onChange={(e) => updateRow(index, { key: e.target.value })}
                placeholder={t('iris.headersEditor.keyPlaceholder') || 'Header name'}
                className={cn(
                  'flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md',
                  'bg-white/5 border border-white/10',
                  'text-white placeholder-white/40',
                  'focus:outline-none focus:border-slate-400/50',
                  !enabled && 'opacity-50',
                )}
              />
              <input
                type="text"
                value={row.value}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                placeholder={t('iris.headersEditor.valuePlaceholder') || 'Value'}
                className={cn(
                  'flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md',
                  'bg-white/5 border border-white/10',
                  'text-white placeholder-white/40',
                  'focus:outline-none focus:border-slate-400/50',
                  !enabled && 'opacity-50',
                )}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                title={t('iris.headersEditor.removeRow') || 'Remove header'}
                className="flex-shrink-0 p-1.5 rounded-md text-white/40 hover:text-rose-300 hover:bg-white/5 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {entries.length === 0 && (
          <p className="text-xs text-white/40 py-1.5">
            {t('iris.headersEditor.empty') || 'No headers configured.'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => addRow()}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md',
            'bg-white/5 border border-white/10 text-white/80',
            'hover:bg-white/10 transition-colors',
          )}
        >
          <Plus size={12} />
          {t('iris.headersEditor.addHeader') || 'Add header'}
        </button>

        <div ref={presetBtnRef} className="relative">
          <button
            type="button"
            onClick={() => setPresetOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md',
              'bg-white/5 border border-white/10 text-white/80',
              'hover:bg-white/10 transition-colors',
            )}
          >
            {t('iris.headersEditor.addPreset') || 'Common presets'}
            <ChevronDown size={11} className={cn('transition-transform', presetOpen && 'rotate-180')} />
          </button>

          {presetOpen && (
            <div
              className={cn(
                'absolute z-10 mt-1 left-0 min-w-[260px] py-1 rounded-md',
                'bg-slate-900 border border-white/10 shadow-lg',
              )}
            >
              {HEADER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => addPreset(preset)}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 transition-colors"
                >
                  {presetLabel(preset)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {description && <p className="text-xs text-white/40 mt-1.5">{description}</p>}
    </div>
  );
}
