/**
 * SubtitleControls - Control bar for subtitle operations
 * Add cue, import/export, AI generate, language selection
 */

import { memo, useState, useCallback } from 'react';
import {
  Plus,
  Upload,
  Download,
  Sparkles,
  Languages,
  ChevronDown,
  Loader2,
  Trash2,
  Save,
  FileText,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  SUBTITLE_LANGUAGES,
  SubtitleFormat,
  Subtitle,
} from '@/shared/api/subtitle.api';

interface SubtitleControlsProps {
  subtitle: Subtitle | null;
  videoDuration: number;
  isGenerating: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onAddCue: (startTime: number) => void;
  onImport: () => void;
  onExport: (format: SubtitleFormat) => void;
  onGenerate: (language: string) => void;
  onTranslate: (targetLanguage: string) => void;
  onSave: () => void;
  onClearAll: () => void;
  currentTime: number;
}

// Language dropdown component
const LanguageDropdown = memo(function LanguageDropdown({
  selectedLanguage,
  onSelect,
  disabled,
  label,
}: {
  selectedLanguage: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLang = SUBTITLE_LANGUAGES.find((l) => l.code === selectedLanguage);

  return (
    <div className="relative">
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
          'bg-zinc-800 border border-zinc-700 text-zinc-300',
          'hover:bg-zinc-700 hover:text-white transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <Languages className="w-4 h-4" />
        <span>{selectedLang?.label || label}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto min-w-[200px]">
            {SUBTITLE_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm transition-colors',
                  lang.code === selectedLanguage
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                )}
                onClick={() => {
                  onSelect(lang.code);
                  setIsOpen(false);
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// Export format dropdown
const ExportDropdown = memo(function ExportDropdown({
  onExport,
  disabled,
}: {
  onExport: (format: SubtitleFormat) => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
          'bg-zinc-800 border border-zinc-700 text-zinc-300',
          'hover:bg-zinc-700 hover:text-white transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[140px]">
            <button
              className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex items-center gap-2"
              onClick={() => {
                onExport('srt');
                setIsOpen(false);
              }}
            >
              <FileText className="w-4 h-4" />
              Export as SRT
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex items-center gap-2"
              onClick={() => {
                onExport('vtt');
                setIsOpen(false);
              }}
            >
              <FileText className="w-4 h-4" />
              Export as VTT
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export const SubtitleControls = memo(function SubtitleControls({
  subtitle,
  videoDuration,
  isGenerating,
  isSaving,
  hasUnsavedChanges,
  onAddCue,
  onImport,
  onExport,
  onGenerate,
  onTranslate,
  onSave,
  onClearAll,
  currentTime,
}: SubtitleControlsProps) {
  const [generateLanguage, setGenerateLanguage] = useState('en');
  const [translateLanguage, setTranslateLanguage] = useState('ko');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleAddCue = useCallback(() => {
    // Add cue at current time or at the end
    const startTime = Math.min(currentTime, videoDuration - 2);
    onAddCue(Math.max(0, startTime));
  }, [currentTime, videoDuration, onAddCue]);

  const handleGenerate = useCallback(() => {
    onGenerate(generateLanguage);
  }, [generateLanguage, onGenerate]);

  const handleTranslate = useCallback(() => {
    onTranslate(translateLanguage);
  }, [translateLanguage, onTranslate]);

  const handleClearConfirm = useCallback(() => {
    onClearAll();
    setShowConfirmClear(false);
  }, [onClearAll]);

  const hasCues = subtitle && subtitle.cues && subtitle.cues.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
      {/* Left section - Primary actions */}
      <div className="flex items-center gap-2">
        {/* Add cue */}
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
            'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white transition-colors'
          )}
          onClick={handleAddCue}
          title="Add cue at current time"
        >
          <Plus className="w-4 h-4" />
          Add Cue
        </button>

        {/* Import */}
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
            'bg-zinc-800 border border-zinc-700 text-zinc-300',
            'hover:bg-zinc-700 hover:text-white transition-colors'
          )}
          onClick={onImport}
          title="Import SRT/VTT file"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>

        {/* Export */}
        <ExportDropdown
          onExport={onExport}
          disabled={!hasCues}
        />
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-zinc-700" />

      {/* AI Generate section */}
      <div className="flex items-center gap-2">
        <LanguageDropdown
          selectedLanguage={generateLanguage}
          onSelect={setGenerateLanguage}
          disabled={isGenerating}
          label="Source language"
        />

        <button
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900',
            'hover:from-white hover:to-white transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          onClick={handleGenerate}
          disabled={isGenerating}
          title="Generate subtitles using AI (Whisper)"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGenerating ? 'Generating...' : 'AI Generate'}
        </button>
      </div>

      {/* Translate section (only if we have cues) */}
      {hasCues && (
        <>
          <div className="w-px h-8 bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Translate to:</span>
            <LanguageDropdown
              selectedLanguage={translateLanguage}
              onSelect={setTranslateLanguage}
              disabled={isGenerating}
              label="Target language"
            />
            <button
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                'bg-zinc-800 border border-zinc-700 text-zinc-300',
                'hover:bg-zinc-700 hover:text-white transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              onClick={handleTranslate}
              disabled={isGenerating || !hasCues}
              title="Translate to another language"
            >
              <Languages className="w-4 h-4" />
              Translate
            </button>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section - Save & Clear */}
      <div className="flex items-center gap-2">
        {/* Unsaved indicator */}
        {hasUnsavedChanges && (
          <span className="text-xs text-amber-400 mr-2">
            Unsaved changes
          </span>
        )}

        {/* Save button */}
        {hasUnsavedChanges && (
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        )}

        {/* Clear all button */}
        {hasCues && (
          <div className="relative">
            <button
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                'bg-zinc-800 border border-zinc-700 text-zinc-400',
                'hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-400',
                'transition-colors'
              )}
              onClick={() => setShowConfirmClear(true)}
              title="Clear all cues"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>

            {/* Confirm dialog */}
            {showConfirmClear && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowConfirmClear(false)}
                />
                <div className="absolute top-full right-0 mt-2 p-4 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[240px]">
                  <p className="text-sm text-zinc-300 mb-3">
                    Delete all {subtitle?.cues?.length || 0} cues?
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      className="px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-white transition-colors"
                      onClick={() => setShowConfirmClear(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1.5 rounded text-sm bg-red-600 text-white hover:bg-red-500 transition-colors"
                      onClick={handleClearConfirm}
                    >
                      Delete All
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cue count */}
      <div className="text-xs text-zinc-500">
        {subtitle?.cues?.length || 0} cues
      </div>
    </div>
  );
});

export default SubtitleControls;
