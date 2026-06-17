/**
 * SubtitleEditor - Main subtitle editor component
 * Combines timeline, cue list, controls, and integrates with video player
 */

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Subtitles,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { VideoPlayer } from '../VideoPlayer';
import { SubtitleTimeline } from './SubtitleTimeline';
import { SubtitleCueEditor } from './SubtitleCueEditor';
import { SubtitleControls } from './SubtitleControls';
import {
  Subtitle,
  SubtitleCue,
  SubtitleFormat,
  createSubtitle,
  getSubtitle,
  listSubtitles,
  bulkUpdateCues,
  importSubtitleFromFile,
  exportSubtitleToFile,
  generateSubtitles,
  translateSubtitle,
  UpsertCueData,
} from '@/shared/api/subtitle.api';
import type { IrisAsset } from '@/shared/api/types';
import { ConfirmDialog } from '@/shared/components/ui/Modal';

interface SubtitleEditorProps {
  video: IrisAsset;
  videoUrl: string;
  onClose: () => void;
}

// Generate unique ID for new cues
function generateCueId(): string {
  return `cue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const SubtitleEditor = memo(function SubtitleEditor({
  video,
  videoUrl,
  onClose,
}: SubtitleEditorProps) {
  // Video state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Subtitle state
  const [subtitle, setSubtitle] = useState<Subtitle | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Layout state
  const [timelineHeight] = useState(160);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Get currently active cue based on playback time
  const activeCue = useMemo(() => {
    return cues.find(
      (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
    );
  }, [cues, currentTime]);

  // Load or create subtitle on mount
  useEffect(() => {
    const initSubtitle = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check for existing subtitles for this video
        const response = await listSubtitles(video.id);
        
        if (response && response.subtitles.length > 0) {
          // Load first existing subtitle
          const existing = await getSubtitle(response.subtitles[0].id);
          if (existing) {
            setSubtitle(existing);
            setCues(existing.cues || []);
          }
        } else {
          // Create new subtitle track
          const newSubtitle = await createSubtitle({
            assetId: video.id,
            name: `${video.name} - Subtitles`,
            language: 'en',
            format: 'srt',
          });
          if (newSubtitle) {
            setSubtitle(newSubtitle);
            setCues([]);
          } else {
            throw new Error('Failed to create subtitle track');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subtitles');
      } finally {
        setIsLoading(false);
      }
    };

    initSubtitle();
  }, [video.id, video.name]);

  // Handle video time updates
  const handleTimeUpdate = useCallback((time: number, duration: number) => {
    setCurrentTime(time);
    if (duration && duration !== videoDuration) {
      setVideoDuration(duration);
    }
  }, [videoDuration]);

  // Seek video to specific time
  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Add new cue
  const handleAddCue = useCallback((startTime: number) => {
    const newCue: SubtitleCue = {
      id: generateCueId(),
      subtitleId: subtitle?.id || '',
      index: cues.length + 1,
      startTime,
      endTime: Math.min(startTime + 2, videoDuration),
      text: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCues((prev) => {
      const updated = [...prev, newCue].sort((a, b) => a.startTime - b.startTime);
      // Reindex
      return updated.map((cue, i) => ({ ...cue, index: i + 1 }));
    });
    setSelectedCueId(newCue.id);
    setHasUnsavedChanges(true);
    
    // Seek to the new cue
    handleSeek(startTime);
  }, [subtitle?.id, cues.length, videoDuration, handleSeek]);

  // Update cue
  const handleUpdateCue = useCallback((update: Partial<SubtitleCue> & { id: string }) => {
    setCues((prev) => {
      const updated = prev.map((cue) =>
        cue.id === update.id
          ? { ...cue, ...update, updatedAt: new Date().toISOString() }
          : cue
      );
      // Re-sort and reindex if times changed
      if (update.startTime !== undefined || update.endTime !== undefined) {
        return updated
          .sort((a, b) => a.startTime - b.startTime)
          .map((cue, i) => ({ ...cue, index: i + 1 }));
      }
      return updated;
    });
    setHasUnsavedChanges(true);
  }, []);

  // Delete cue
  const handleDeleteCue = useCallback((id: string) => {
    setCues((prev) => {
      const filtered = prev.filter((cue) => cue.id !== id);
      // Reindex
      return filtered.map((cue, i) => ({ ...cue, index: i + 1 }));
    });
    if (selectedCueId === id) {
      setSelectedCueId(null);
    }
    setHasUnsavedChanges(true);
  }, [selectedCueId]);

  // Select cue
  const handleSelectCue = useCallback((cue: SubtitleCue) => {
    setSelectedCueId(cue.id);
  }, []);

  // Clear all cues
  const handleClearAll = useCallback(() => {
    setCues([]);
    setSelectedCueId(null);
    setHasUnsavedChanges(true);
  }, []);

  // Show success message temporarily
  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  // Save changes to backend
  const handleSave = useCallback(async () => {
    if (!subtitle) return;

    setIsSaving(true);
    setError(null);

    try {
      const cueData: UpsertCueData[] = cues.map((cue) => ({
        index: cue.index,
        startTime: cue.startTime,
        endTime: cue.endTime,
        text: cue.text,
      }));

      const result = await bulkUpdateCues(subtitle.id, {
        cues: cueData,
        replaceAll: true,
      });

      if (result) {
        // Update local cues with server-generated IDs
        setCues(result);
        setHasUnsavedChanges(false);
        showSuccess('Subtitles saved successfully');
      } else {
        throw new Error('Failed to save subtitles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subtitles');
    } finally {
      setIsSaving(false);
    }
  }, [subtitle, cues, showSuccess]);

  // Import from file
  const handleImport = useCallback(async () => {
    if (!subtitle) return;

    try {
      const imported = await importSubtitleFromFile(video.id, subtitle.language);
      if (imported) {
        // Fetch the full subtitle with cues
        const fullSubtitle = await getSubtitle(imported.id);
        if (fullSubtitle) {
          setSubtitle(fullSubtitle);
          setCues(fullSubtitle.cues || []);
          setHasUnsavedChanges(false);
          showSuccess('Subtitle file imported successfully');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import subtitle');
    }
  }, [video.id, subtitle, showSuccess]);

  // Export to file
  const handleExport = useCallback(async (format: SubtitleFormat) => {
    if (!subtitle) return;

    // Save first if there are unsaved changes
    if (hasUnsavedChanges) {
      await handleSave();
    }

    try {
      const success = await exportSubtitleToFile(subtitle, format);
      if (success) {
        showSuccess(`Exported as ${format.toUpperCase()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export subtitle');
    }
  }, [subtitle, hasUnsavedChanges, handleSave, showSuccess]);

  // AI generate subtitles
  const handleGenerate = useCallback(async (language: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      const generated = await generateSubtitles({
        assetId: video.id,
        language,
        name: `${video.name} - AI Generated`,
      });

      if (generated) {
        // Fetch full subtitle with cues
        const fullSubtitle = await getSubtitle(generated.id);
        if (fullSubtitle) {
          setSubtitle(fullSubtitle);
          setCues(fullSubtitle.cues || []);
          setHasUnsavedChanges(false);
          showSuccess('Subtitles generated successfully!');
        }
      } else {
        throw new Error('Failed to generate subtitles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate subtitles');
    } finally {
      setIsGenerating(false);
    }
  }, [video.id, video.name, showSuccess]);

  // Translate subtitles
  const handleTranslate = useCallback(async (targetLanguage: string) => {
    if (!subtitle) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Save current changes first
      if (hasUnsavedChanges) {
        await handleSave();
      }

      const translated = await translateSubtitle(subtitle.id, {
        targetLanguage,
        name: `${video.name} - ${targetLanguage.toUpperCase()}`,
      });

      if (translated) {
        const fullSubtitle = await getSubtitle(translated.id);
        if (fullSubtitle) {
          setSubtitle(fullSubtitle);
          setCues(fullSubtitle.cues || []);
          setHasUnsavedChanges(false);
          showSuccess('Translation complete!');
        }
      } else {
        throw new Error('Failed to translate subtitles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to translate subtitles');
    } finally {
      setIsGenerating(false);
    }
  }, [subtitle, hasUnsavedChanges, handleSave, video.name, showSuccess]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        if (e.key !== 'Escape') return;
      }

      switch (e.key) {
        case ' ':
          // Space: play/pause
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (videoRef.current) {
              if (videoRef.current.paused) {
                videoRef.current.play();
              } else {
                videoRef.current.pause();
              }
            }
          }
          break;
        case 'ArrowLeft':
          // Left: seek back 2 seconds
          e.preventDefault();
          handleSeek(Math.max(0, currentTime - 2));
          break;
        case 'ArrowRight':
          // Right: seek forward 2 seconds
          e.preventDefault();
          handleSeek(Math.min(videoDuration, currentTime + 2));
          break;
        case 'ArrowUp':
          // Up: select previous cue
          e.preventDefault();
          if (cues.length > 0) {
            const currentIndex = cues.findIndex((c) => c.id === selectedCueId);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : cues.length - 1;
            setSelectedCueId(cues[prevIndex].id);
            handleSeek(cues[prevIndex].startTime);
          }
          break;
        case 'ArrowDown':
          // Down: select next cue
          e.preventDefault();
          if (cues.length > 0) {
            const currentIndex = cues.findIndex((c) => c.id === selectedCueId);
            const nextIndex = currentIndex < cues.length - 1 ? currentIndex + 1 : 0;
            setSelectedCueId(cues[nextIndex].id);
            handleSeek(cues[nextIndex].startTime);
          }
          break;
        case 'n':
          // N: add new cue
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleAddCue(currentTime);
          }
          break;
        case 's':
          // Ctrl+S: save
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (hasUnsavedChanges) {
              handleSave();
            }
          }
          break;
        case 'Escape':
          // Escape: close editor
          if (!hasUnsavedChanges) {
            onClose();
          } else {
            setShowDiscardConfirm(true);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentTime,
    videoDuration,
    cues,
    selectedCueId,
    hasUnsavedChanges,
    handleSeek,
    handleAddCue,
    handleSave,
    onClose,
  ]);

  // Confirm before closing with unsaved changes
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-white/70 animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Loading subtitle editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-3">
          <Subtitles className="w-5 h-5 text-white/70" />
          <div>
            <h1 className="text-lg font-semibold text-white">Subtitle Editor</h1>
            <p className="text-xs text-zinc-400">{video.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Success message */}
          {successMessage && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600/20 text-green-400 text-sm rounded-lg">
              <Check className="w-4 h-4" />
              {successMessage}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg">
              <AlertCircle className="w-4 h-4" />
              {error}
              <button
                className="ml-1 text-red-300 hover:text-white"
                onClick={() => setError(null)}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Close button */}
          <button
            className={cn(
              'p-2 rounded-lg text-zinc-400 hover:text-white',
              'hover:bg-zinc-700 transition-colors'
            )}
            onClick={handleClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 p-3 border-b border-zinc-800">
        <SubtitleControls
          subtitle={subtitle}
          videoDuration={videoDuration}
          isGenerating={isGenerating}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}
          onAddCue={handleAddCue}
          onImport={handleImport}
          onExport={handleExport}
          onGenerate={handleGenerate}
          onTranslate={handleTranslate}
          onSave={handleSave}
          onClearAll={handleClearAll}
          currentTime={currentTime}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel - Video player */}
        <div className="w-1/2 flex flex-col border-r border-zinc-800">
          <div className="flex-1 p-4">
            <VideoPlayer
              src={videoUrl}
              poster={video.thumbnailUrl}
              className="w-full h-full max-h-[calc(100vh-400px)]"
              autoPlay={false}
              loop={false}
              muted={false}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>

          {/* Current subtitle preview */}
          <div className="flex-shrink-0 px-4 pb-4">
            <div
              className={cn(
                'p-4 rounded-lg text-center min-h-[80px] flex items-center justify-center',
                'bg-zinc-800/50 border border-zinc-700'
              )}
            >
              {activeCue ? (
                <p className="text-lg text-white leading-relaxed whitespace-pre-wrap">
                  {activeCue.text}
                </p>
              ) : (
                <p className="text-zinc-500 text-sm">
                  No subtitle at current time
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right panel - Cue list */}
        <div className="w-1/2 flex flex-col min-h-0">
          {/* Cue list header */}
          <div className="flex-shrink-0 px-4 py-3 bg-zinc-800/30 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-300">
              Cues ({cues.length})
            </h2>
          </div>

          {/* Cue list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cues.length === 0 ? (
              <div className="text-center py-12">
                <VideoIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400 mb-2">No subtitles yet</p>
                <p className="text-sm text-zinc-500">
                  Use "AI Generate" to auto-create subtitles, or "Add Cue" to create manually
                </p>
              </div>
            ) : (
              cues.map((cue) => (
                <SubtitleCueEditor
                  key={cue.id}
                  cue={cue}
                  isActive={cue.id === selectedCueId || cue.id === activeCue?.id}
                  videoDuration={videoDuration}
                  onUpdate={handleUpdateCue}
                  onDelete={handleDeleteCue}
                  onSelect={handleSelectCue}
                  onSeekTo={handleSeek}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Timeline (collapsible) */}
      <div className="flex-shrink-0 border-t border-zinc-700">
        {/* Timeline toggle */}
        <button
          className={cn(
            'w-full flex items-center justify-center gap-2 py-1.5',
            'text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/50',
            'transition-colors'
          )}
          onClick={() => setShowTimeline(!showTimeline)}
        >
          {showTimeline ? (
            <>
              <ChevronDown className="w-4 h-4" />
              Hide Timeline
            </>
          ) : (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Timeline
            </>
          )}
        </button>

        {/* Timeline */}
        {showTimeline && (
          <div style={{ height: `${timelineHeight}px` }}>
            <SubtitleTimeline
              cues={cues}
              currentTime={currentTime}
              duration={videoDuration}
              selectedCueId={selectedCueId}
              onCueSelect={handleSelectCue}
              onCueUpdate={handleUpdateCue}
              onSeek={handleSeek}
            />
          </div>
        )}
      </div>

      {/* Keyboard shortcuts help */}
      <div className="flex-shrink-0 px-4 py-2 bg-zinc-800/30 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-500 text-center">
          Space: Play/Pause | Arrow Keys: Navigate | Ctrl+N: New Cue | Ctrl+S: Save | Esc: Close
        </p>
      </div>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        title="Discard Changes"
        message="You have unsaved changes. Discard them?"
        confirmText="Discard"
        variant="danger"
      />
    </div>
  );
});

export default SubtitleEditor;
