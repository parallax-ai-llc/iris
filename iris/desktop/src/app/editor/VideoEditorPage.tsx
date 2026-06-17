/**
 * VideoEditorPage - Premiere-style video editor page
 * Full-featured video editing with multi-track timeline and inspector
 * 
 * Always operates in project mode - auto-creates project when opening an asset
 */

import { memo, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore, type Track, type Clip, hasEffects, hasVolume } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useUIStore } from '@/shared/stores/ui.store';
import { VideoEditor } from '@/features/video-editor/components/VideoEditor';
import { VideoEditorMenuBar } from '@/features/video-editor/components/VideoEditorMenuBar';
import { NewVideoProjectModal } from '@/features/video-editor/components/modals/NewVideoProjectModal';
import { OpenProjectModal } from '@/features/video-editor/components/modals/OpenProjectModal';
import { SaveProjectModal } from '@/features/video-editor/components/modals/SaveProjectModal';
import { useToast } from '@/shared/components/ui/useToast';
import { TitleBar } from '@/app/layout/TitleBar';
import { Upload } from 'lucide-react';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import type { TimelineData, TimelineTrack, TimelineClip, ExportOptions } from '@/types/videoProject.types';
import type { IrisAsset } from '@/shared/api/types';
import { useAutoSave } from '@/features/video-editor/hooks/useAutoSave';
import {
  parseSubtitleFile,
  exportToSrt,
  exportToVtt,
  type SubtitleEntry,
} from '@/features/video-editor/lib/subtitle-parser';
import { ProjectAutoCaptionsModal } from '@/features/video-editor/components/ProjectAutoCaptionsModal';
import { SilenceRemovalModal } from '@/features/video-editor/components/modals/SilenceRemovalModal';
import * as videoProjectApi from '@/shared/api/videoProject.api';

/** Create a placeholder IrisAsset for project-based editor sessions */
function createPlaceholderAsset(id: string, name: string): IrisAsset {
  return {
    id,
    userId: '',
    name,
    storagePath: '',
    currentVersion: 1,
    assetType: 'VIDEO',
    mimeType: 'video/mp4',
    sizeBytes: 0,
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Capture thumbnail from preview video at time 0
 */
async function capturePreviewThumbnail(): Promise<string | null> {
  // Find the preview video element
  const video = document.querySelector('[data-editor-preview-video]') as HTMLVideoElement;
  if (!video) {
    console.warn('Preview video element not found for thumbnail capture');
    return null;
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    // Use video's natural dimensions, scaled down for thumbnail
    const maxWidth = 640;
    const maxHeight = 360;
    let width = video.videoWidth || 1920;
    let height = video.videoHeight || 1080;

    // Scale down if needed
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;

    // Store original time
    const originalTime = video.currentTime;
    
    // Seek to start for thumbnail
    const captureFrame = () => {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      // Restore original time
      video.currentTime = originalTime;
      
      resolve(dataUrl);
    };

    // If video is at time 0 and has data, capture immediately
    if (video.readyState >= 2 && video.currentTime === 0) {
      captureFrame();
    } else {
      // Seek to 0 and capture
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked);
        captureFrame();
      };
      
      video.addEventListener('seeked', handleSeeked);
      video.currentTime = 0;
      
      // Timeout fallback
      setTimeout(() => {
        video.removeEventListener('seeked', handleSeeked);
        if (video.readyState >= 2) {
          captureFrame();
        } else {
          resolve(null);
        }
      }, 2000);
    }
  });
}

// Convert editor.store Track/Clip to videoProject TimelineData format
function convertEditorTracksToTimelineData(
  tracks: Track[],
  markers: import('@/types/editor.types').Marker[] = [],
): TimelineData {
  const convertClip = (clip: Clip): TimelineClip => {
    const baseClip: TimelineClip = {
      id: clip.id,
      type: clip.type === 'music' ? 'audio' : clip.type,
      trackId: clip.trackId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.endTime - clip.startTime,
      sourceUrl: 'assetId' in clip ? clip.assetId : undefined,
      inPoint: clip.sourceStartTime,
      outPoint: clip.sourceEndTime,
      opacity: clip.type === 'video' ? clip.transform.opacity : (clip.type === 'adjustment' ? clip.opacity : 1),
      scale: clip.type === 'video' ? clip.transform.scale : 1,
      x: clip.type === 'video' ? (clip.transform.x ?? 0) : 0,
      y: clip.type === 'video' ? (clip.transform.y ?? 0) : 0,
      rotation: clip.type === 'video' ? clip.transform.rotation : 0,
      volume: hasVolume(clip) ? clip.volume : 1,
      fadeIn: (clip.type === 'audio' || clip.type === 'music') ? clip.fadeIn : 0,
      fadeOut: (clip.type === 'audio' || clip.type === 'music') ? clip.fadeOut : 0,
      speed: 'speed' in clip ? clip.speed ?? 1 : 1,
      effects: hasEffects(clip) ? clip.effects : [],
      keyframes: hasEffects(clip) ? clip.keyframes : [],
      name: clip.name,
      locked: false,
    };

    // Add subtitle-specific properties
    if (clip.type === 'subtitle') {
      baseClip.content = clip.text;
      baseClip.fontFamily = clip.style.fontFamily;
      baseClip.fontSize = clip.style.fontSize;
      baseClip.fontColor = clip.style.fontColor;
      baseClip.backgroundColor = clip.style.backgroundColor;
      baseClip.backgroundOpacity = clip.style.backgroundOpacity;
      baseClip.textAlign = clip.style.alignment;
      baseClip.textPositionX = clip.style.position.x;
      baseClip.textPositionY = clip.style.position.y;
      baseClip.verticalAlign = clip.style.verticalAlign;
    }

    return baseClip;
  };

  const convertTrack = (track: Track): TimelineTrack => ({
    id: track.id,
    type: track.type === 'music' ? 'audio' : track.type,
    name: track.name,
    locked: track.locked,
    muted: track.muted,
    visible: track.visible,
    height: track.height,
    clips: track.clips.map(convertClip),
  });

  return {
    version: 1,
    settings: {
      backgroundColor: '#000000',
      defaultTransitionDuration: 0.5,
      audioFadeDefault: 0.3,
    },
    tracks: tracks.map(convertTrack),
    markers: markers.map((m) => ({
      id: m.id,
      time: m.time,
      label: m.label,
      color: m.color,
      type: m.type,
      url: m.url,
      endTime: m.endTime,
      comment: m.comment,
    })),
  };
}

export const VideoEditorPage = memo(function VideoEditorPage() {
  const { t } = useTranslation('common');
  const { asset, closeEditor } = useEditorStore();
  const currentProject = useVideoProjectStore((state) => state.currentProject);

  // Hydrate the editor store's proxy maps from the persisted media pool whenever
  // the project loads or its media pool changes. This is what makes "the project
  // remembers proxy state" actually work across sessions — without it, ready
  // proxies on disk would be invisible to the playback resolver.
  //
  // Also performs invalidation: if a 'ready' record references a file that no
  // longer exists on disk (cleared cache, app reinstall, manually deleted),
  // we reset both the in-memory map AND the server record so the next proxy
  // mode toggle re-generates it cleanly.
  useEffect(() => {
    if (!currentProject) return;
    let cancelled = false;

    (async () => {
      const setProxyStatus = useEditorStore.getState().setProxyStatus;
      const setProxyPath = useEditorStore.getState().setProxyPath;
      const projectId = currentProject.id;

      for (const m of currentProject.mediaPool ?? []) {
        if (cancelled) return;
        const key = m.externalId ?? m.id;

        if (m.proxyStatus === 'ready' && m.proxyPath) {
          // Verify the file actually exists. If not, mark as none and reset
          // the server record — the user will need to regenerate.
          try {
            const check = await window.electronAPI?.proxy?.check(key);
            if (check?.exists) {
              setProxyPath(key, check.outputPath ?? m.proxyPath);
              setProxyStatus(key, 'ready');
            } else {
              setProxyStatus(key, 'pending');
              // Best-effort: clear stale server record
              await videoProjectApi
                .updateMediaProxy(projectId, m.id, {
                  proxyStatus: 'none',
                  proxyPath: null,
                })
                .catch(() => {});
            }
          } catch {
            // If we can't even check (no electronAPI), trust the record.
            setProxyPath(key, m.proxyPath);
            setProxyStatus(key, 'ready');
          }
        } else if (m.proxyStatus) {
          setProxyStatus(
            key,
            m.proxyStatus === 'none'
              ? 'pending'
              : (m.proxyStatus as 'pending' | 'generating' | 'ready' | 'error'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProject]);

  const isProvisional = useVideoProjectStore((state) => state.isProvisional);
  const closeProject = useVideoProjectStore((state) => state.closeProject);
  const saveTimeline = useVideoProjectStore((state) => state.saveTimeline);
  const createProject = useVideoProjectStore((state) => state.createProject);
  const duplicateProject = useVideoProjectStore((state) => state.duplicateProject);
  const updateTimelineData = useVideoProjectStore((state) => state.updateTimelineData);
  const setCurrentPage = useUIStore((state) => state.setCurrentPage);
  // Remember which page the user came from so "Go Back" returns there
  const entryPageRef = useRef<string>(useUIStore.getState().currentPage);
  const backPage = entryPageRef.current === 'projects' ? 'projects' : 'videos';
  const toast = useToast();
  
  const isDirty = useVideoProjectStore((state) => state.isDirty);
  const editorTracks = useEditorStore((s) => s.tracks);
  const hasSubtitleClips = useMemo(
    () => editorTracks.some((t) => t.type === 'subtitle' && t.clips.some((c) => c.type === 'subtitle')),
    [editorTracks]
  );
  const hasMediaClips = useMemo(
    () => editorTracks.some((t) =>
      (t.type === 'video' || t.type === 'audio') &&
      t.clips.some((c) => c.type === 'video' || c.type === 'audio')
    ),
    [editorTracks]
  );
  const hasLocalClips = useMemo(
    () => editorTracks.some((t) =>
      t.clips.some((c) => {
        const id = (c as { assetId?: string }).assetId ?? '';
        return id.startsWith('blob:') || id.startsWith('file://');
      })
    ),
    [editorTracks]
  );
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStep, setInitStep] = useState('');
  const initCancelledRef = useRef(false);
  const [showLocalCloseConfirm, setShowLocalCloseConfirm] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [showSaveProjectModal, setShowSaveProjectModal] = useState(false);
  const [isSaveAsMode, setIsSaveAsMode] = useState(false);
  const [showProjectAutoCaptions, setShowProjectAutoCaptions] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState<'new' | 'open' | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSilenceRemoval, setShowSilenceRemoval] = useState(false);

  // Auto-save lifecycle management
  useAutoSave();

  // Initialize provisional project when asset is opened (no DB write until explicit save)
  useEffect(() => {
    if (!asset) return;

    initCancelledRef.current = false;

    const initProject = async () => {
      const store = useVideoProjectStore.getState();
      const existingProject = store.currentProject;

      // Already initialized for this asset (in-memory fast path).
      // openEditor() always calls initializeProject(asset) with NO duration
      // override, which seeds the editor with a 30s placeholder. If we bail
      // out here without re-syncing, the timeline gets stuck at 30s. Pull
      // the real duration back from the persisted media pool entry.
      const existingMedia = existingProject?.mediaPool?.find(
        (m) => m.externalId === asset.id
      );
      if (existingProject && existingMedia) {
        const realDuration = existingMedia.duration ?? 0;
        if (realDuration > 0) {
          useEditorStore.getState().initializeProject(asset, undefined, realDuration);
        }
        return;
      }

      setIsInitializing(true);
      setInitStep(t('editor.videoInit.analyzing'));
      try {
        if (existingProject) {
          store.closeProject();
        }

        const metadata = (asset.metadata || {}) as Record<string, unknown>;
        let rawWidth = (metadata.width as number) || 0;
        let rawHeight = (metadata.height as number) || 0;
        let duration = (metadata.duration as number) || 0;

        // Only probe via ffmpeg when stored metadata lacks valid dimensions.
        // Probing requires downloading from the server which is slow for large files.
        // When metadata already has dimensions, trust them (upload pipeline now stores
        // rotation-corrected values).
        const needsProbe = !rawWidth || !rawHeight;
        if (needsProbe && window.electronAPI?.video?.probeDimensions) {
          setInitStep(t('editor.videoInit.probingDimensions'));
          try {
            const API_BASE = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';
            const assetUrl = `${API_BASE}/api/iris/assets/${asset.id}/download`;
            const authToken = await window.electronAPI.auth.getToken();
            if (!initCancelledRef.current) {
              const probed = await window.electronAPI.video.probeDimensions(assetUrl, authToken ?? undefined);
              if (probed && probed.width > 0 && probed.height > 0) {
                rawWidth = probed.width;
                rawHeight = probed.height;
              }
            }
          } catch {
            // fall through to metadata values
          }
        }

        if (initCancelledRef.current) return;

        // Fallback: probe duration from video element if missing
        if (!duration && asset.previewUrl) {
          setInitStep(t('editor.videoInit.probingDuration'));
          try {
            duration = await new Promise<number>((resolve) => {
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.onloadedmetadata = () => { resolve(isFinite(video.duration) ? video.duration : 0); video.src = ''; };
              video.onerror = () => resolve(0);
              setTimeout(() => resolve(0), 10000);
              video.src = asset.previewUrl!;
            });
          } catch {
            // keep zero
          }
        }

        // Second fallback: probe via ffmpeg through the main process. This
        // is far more reliable than the browser <video> probe — it works
        // for any container/codec the asset can be downloaded as, and does
        // not depend on previewUrl being a playable stream.
        if (!duration && window.electronAPI?.video?.probeDuration) {
          try {
            const API_BASE = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';
            const assetUrl = `${API_BASE}/api/iris/assets/${asset.id}/download`;
            const authToken = await window.electronAPI.auth.getToken();
            const probed = await window.electronAPI.video.probeDuration(assetUrl, authToken ?? undefined);
            if (probed && probed > 0) duration = probed;
          } catch {
            // keep zero — falls through to the 30s placeholder default
          }
        }

        if (initCancelledRef.current) return;

        setInitStep(t('editor.videoInit.preparingEditor'));
        if (!rawWidth) rawWidth = 1920;
        if (!rawHeight) rawHeight = 1080;

        const width = rawWidth;
        const height = rawHeight;

        const projectName = asset.name.replace(/\.[^/.]+$/, '');

        // Set up provisional project in memory only (no DB write)
        store.initProvisionalProject(projectName, width, height, 30);

        // Re-initialize editor store with actual probed duration
        // (openEditor was called before probing, so editor had wrong duration).
        // Keep float precision so very short clips (<1s) aren't rounded to 0.
        if (duration > 0) {
          useEditorStore.getState().initializeProject(asset, undefined, duration);
          useVideoProjectStore.setState((state) => ({
            currentProject: state.currentProject
              ? { ...state.currentProject, duration }
              : null,
          }));
        }

        // Add video to media pool (local-only until save)
        const validThumbnailUrl = asset.thumbnailUrl?.startsWith('http') ? asset.thumbnailUrl : null;
        await store.addMedia({
          mediaType: 'video',
          externalId: asset.id,
          name: asset.name,
          thumbnailUrl: validThumbnailUrl,
          duration: duration ? Math.round(duration) : null,
          width: Math.round(width),
          height: Math.round(height),
          fileSize: asset.sizeBytes ? Math.round(asset.sizeBytes) : null,
        });

        // Download all server assets to local storage
        await useEditorStore.getState().downloadAllAssets();

      } catch (error) {
        console.error('Failed to initialize project:', error);
      } finally {
        if (!initCancelledRef.current) {
          setIsInitializing(false);
          setInitStep('');
        }
      }
    };

    initProject();
    // Intentionally narrow deps to asset.id: re-running on the full `asset`
    // object or translation function would needlessly re-initialize the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  // Cancel initialization and return to videos page
  const handleCancelInit = useCallback(() => {
    initCancelledRef.current = true;
    setIsInitializing(false);
    setInitStep('');
    closeProject();
    closeEditor();
    setCurrentPage(backPage);
  }, [closeProject, closeEditor, setCurrentPage, backPage]);

  // Handle back navigation
  const handleClose = useCallback(() => {
    if (hasLocalClips) {
      setShowLocalCloseConfirm(true);
      return;
    }
    closeProject();
    closeEditor();
    setCurrentPage(backPage);
  }, [closeProject, closeEditor, setCurrentPage, hasLocalClips, backPage]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!currentProject || isProvisional) {
      setShowSaveProjectModal(true);
      return;
    }

    const currentTracks = useEditorStore.getState().tracks;
    const currentDuration = useEditorStore.getState().duration;
    const currentMarkers = useEditorStore.getState().markers;
    const timelineData = convertEditorTracksToTimelineData(currentTracks, currentMarkers);

    // Capture thumbnail from preview
    const thumbnail = await capturePreviewThumbnail();

    updateTimelineData(timelineData);
    const saved = await saveTimeline({
      timelineData,
      duration: currentDuration,
      thumbnail: thumbnail || undefined,
    });
    if (saved) {
      toast.success('Project saved');
    } else {
      toast.error('Failed to save project');
    }
  }, [currentProject, isProvisional, saveTimeline, updateTimelineData, toast]);

  // Handle save as — always show modal first to collect new project name
  const handleSaveAs = useCallback(() => {
    setIsSaveAsMode(!isProvisional && !!currentProject);
    setShowSaveProjectModal(true);
  }, [currentProject, isProvisional]);

  // Handle save as with a chosen name (for existing non-provisional projects)
  // Duplicates the project and switches to the copy WITHOUT causing a page flash
  const handleSaveAsWithName = useCallback(async (name: string) => {
    if (!currentProject) return;

    const currentTracks = useEditorStore.getState().tracks;
    const currentDuration = useEditorStore.getState().duration;
    const currentMarkers = useEditorStore.getState().markers;
    const timelineData = convertEditorTracksToTimelineData(currentTracks, currentMarkers);
    const thumbnail = await capturePreviewThumbnail();

    // Save current state to the original project first (silent)
    updateTimelineData(timelineData);
    await saveTimeline({ timelineData, duration: currentDuration, thumbnail: thumbnail || undefined });

    // Duplicate project
    const duplicated = await duplicateProject(currentProject.id);
    if (!duplicated) {
      toast.error('Failed to save project as copy');
      return;
    }

    // Rename the duplicate if the name differs
    let finalProject = duplicated;
    if (name !== duplicated.name) {
      const result = await videoProjectApi.updateProject(duplicated.id, { name });
      if (result.success && result.data) {
        finalProject = result.data;
      } else {
        finalProject = { ...duplicated, name };
      }
    }

    // Switch to the new project without navigating away (no page flash)
    useVideoProjectStore.setState({ currentProject: finalProject, isDirty: false });
    useVideoProjectStore.getState().fetchProjects();

    toast.success(`Saved as: ${name}`);
  }, [currentProject, duplicateProject, updateTimelineData, saveTimeline, toast]);

  // Handle save with project name (first-time save or provisional → real)
  const handleSaveWithName = useCallback(async (name: string) => {
    const currentTracks = useEditorStore.getState().tracks;
    const currentDuration = useEditorStore.getState().duration;
    const currentMarkers = useEditorStore.getState().markers;
    const timelineData = convertEditorTracksToTimelineData(currentTracks, currentMarkers);
    const thumbnail = await capturePreviewThumbnail();

    if (isProvisional) {
      // Update provisional project name, then saveTimeline handles DB creation
      useVideoProjectStore.setState((state) => ({
        currentProject: state.currentProject ? { ...state.currentProject, name } : null,
      }));
      updateTimelineData(timelineData);
      const saved = await saveTimeline({
        timelineData,
        duration: currentDuration,
        thumbnail: thumbnail || undefined,
      });
      if (saved) {
        toast.success('Project saved');
      } else {
        toast.error('Failed to save project');
      }
      return;
    }

    const project = await createProject({ name });
    if (!project) {
      toast.error('Failed to create project');
      return;
    }

    updateTimelineData(timelineData);
    const saved = await saveTimeline({
      timelineData,
      duration: currentDuration,
      thumbnail: thumbnail || undefined,
    });
    if (saved) {
      toast.success('Project saved');
    } else {
      toast.error('Failed to save project');
    }
  }, [isProvisional, createProject, saveTimeline, updateTimelineData, toast]);

  // Modal save dispatcher — routes to save-as or regular save based on mode
  const handleModalSave = useCallback((name: string) => {
    if (isSaveAsMode) {
      handleSaveAsWithName(name);
    } else {
      handleSaveWithName(name);
    }
  }, [isSaveAsMode, handleSaveAsWithName, handleSaveWithName]);

  // Handle export
  const handleExport = useCallback(async (exportOptions?: ExportOptions) => {
    const store = useVideoProjectStore.getState();
    if (!store.currentProject) {
      toast.error('No project to export');
      return;
    }

    const options: ExportOptions = exportOptions ?? {
      format: 'mp4',
      quality: 'high',
      frameRate: 30,
      width: 1920,
      height: 1080,
      includeSubtitles: true,
      subtitleFormat: 'burned',
    };

    // Save timeline first
    await handleSave();

    const started = await store.startExport(options);
    if (!started) {
      toast.error(store.exportProgress?.error || 'Failed to start export');
      return;
    }

    toast.success('Export started — rendering in progress');

    // Poll for progress
    const pollInterval = setInterval(async () => {
      const progress = await store.pollExportStatus();
      if (!progress || progress.status === 'completed' || progress.status === 'failed') {
        clearInterval(pollInterval);
        if (progress?.status === 'completed') {
          toast.success('Export completed!');
        } else if (progress?.status === 'failed') {
          toast.error(progress.error || 'Export failed');
        }
      }
    }, 2000);
  }, [toast, handleSave]);

  // Handle subtitle import from SRT/VTT file
  const handleImportSubtitles = useCallback(async () => {
    if (!window.electronAPI?.files) {
      toast.error('File system access is not available');
      return;
    }
    try {
      // Open file dialog via Electron
      const filePath = await window.electronAPI.files.selectFile({
        filters: [
          { name: 'Subtitle Files', extensions: ['srt', 'vtt'] },
          { name: 'SRT Files', extensions: ['srt'] },
          { name: 'VTT Files', extensions: ['vtt'] },
        ],
      });
      if (!filePath) return;

      // Read the file contents
      const arrayBuffer = await window.electronAPI.files.readFile(filePath);
      const decoder = new TextDecoder('utf-8');
      const content = decoder.decode(arrayBuffer);

      // Parse the subtitle file
      const result = parseSubtitleFile(content);
      if (!result || result.entries.length === 0) {
        toast.error('Could not parse subtitle file — no valid cues found');
        return;
      }

      const editorStore = useEditorStore.getState();
      const { tracks, addTrack, addClip } = editorStore;

      // Find or create a subtitle track
      let subtitleTrack = tracks.find((t) => t.type === 'subtitle');
      if (!subtitleTrack) {
        subtitleTrack = addTrack('subtitle', 'Subtitles');
      }

      // Add each entry as a subtitle clip
      for (const entry of result.entries) {
        addClip(subtitleTrack.id, {
          type: 'subtitle',
          name: entry.text.substring(0, 30) + (entry.text.length > 30 ? '...' : ''),
          startTime: entry.startTime,
          endTime: entry.endTime,
          sourceStartTime: 0,
          sourceEndTime: entry.endTime - entry.startTime,
          text: entry.text,
          style: {
            fontSize: 24,
            fontFamily: 'Arial',
            fontColor: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundOpacity: 0.7,
            position: { x: 50, y: 85 },
            alignment: 'center',
            verticalAlign: 'bottom',
            animation: 'none',
            animationColor: '#FFFF00',
          },
        });
      }

      const fileName = filePath.split(/[/\\]/).pop() || 'subtitle';
      toast.success(`Imported ${result.entries.length} subtitles from ${fileName}`);
    } catch (error) {
      console.error('Failed to import subtitles:', error);
      toast.error('Failed to import subtitle file');
    }
  }, [toast]);

  // Collect subtitle entries from timeline tracks
  const collectSubtitleEntries = useCallback((): SubtitleEntry[] => {
    const editorStore = useEditorStore.getState();
    const entries: SubtitleEntry[] = [];
    let index = 0;

    for (const track of editorStore.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.type !== 'subtitle') continue;
        index++;
        entries.push({
          index,
          startTime: clip.startTime,
          endTime: clip.endTime,
          text: clip.text,
        });
      }
    }

    return entries.sort((a, b) => a.startTime - b.startTime);
  }, []);

  // Export subtitles as SRT
  const handleExportSubtitlesSrt = useCallback(async () => {
    if (!window.electronAPI?.files) {
      toast.error('File system access is not available');
      return;
    }
    try {
      const entries = collectSubtitleEntries();
      if (entries.length === 0) {
        toast.error('No subtitle clips on the timeline to export');
        return;
      }

      const content = exportToSrt(entries);
      const projectName = currentProject?.name || 'subtitles';
      const savePath = await window.electronAPI.files.saveFile({
        defaultPath: `${projectName}.srt`,
        filters: [
          { name: 'SRT Files', extensions: ['srt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!savePath) return;

      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(content).buffer;
      await window.electronAPI.files.writeFile(savePath, arrayBuffer as ArrayBuffer);

      toast.success(`Exported ${entries.length} subtitles as SRT`);
    } catch (error) {
      console.error('Failed to export subtitles:', error);
      toast.error('Failed to export subtitles');
    }
  }, [collectSubtitleEntries, currentProject?.name, toast]);

  // Export subtitles as VTT
  const handleExportSubtitlesVtt = useCallback(async () => {
    if (!window.electronAPI?.files) {
      toast.error('File system access is not available');
      return;
    }
    try {
      const entries = collectSubtitleEntries();
      if (entries.length === 0) {
        toast.error('No subtitle clips on the timeline to export');
        return;
      }

      const content = exportToVtt(entries);
      const projectName = currentProject?.name || 'subtitles';
      const savePath = await window.electronAPI.files.saveFile({
        defaultPath: `${projectName}.vtt`,
        filters: [
          { name: 'VTT Files', extensions: ['vtt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!savePath) return;

      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(content).buffer;
      await window.electronAPI.files.writeFile(savePath, arrayBuffer as ArrayBuffer);

      toast.success(`Exported ${entries.length} subtitles as VTT`);
    } catch (error) {
      console.error('Failed to export subtitles:', error);
      toast.error('Failed to export subtitles');
    }
  }, [collectSubtitleEntries, currentProject?.name, toast]);

  // Handle new project
  const handleNew = useCallback(() => {
    if (currentProject && isDirty) {
      setShowUnsavedModal('new');
      return;
    }
    setShowNewProjectModal(true);
  }, [currentProject, isDirty]);

  const handleCreateNewProject = useCallback(async (name: string, width: number, height: number) => {
    setIsInitializing(true);
    try {
      const projectStore = useVideoProjectStore.getState();
      if (projectStore.currentProject) {
        projectStore.closeProject();
      }

      const project = await projectStore.createProject({ name, width, height });
      if (project) {
        // Re-initialize editor with new blank project (keep isEditorOpen = true)
        useEditorStore.getState().openEditor(
          createPlaceholderAsset(`blank-${Date.now()}`, name)
        );
        toast.success(`Created project: ${name}`);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
    } finally {
      setIsInitializing(false);
    }
  }, [toast]);

  // Handle open project
  const handleOpenProject = useCallback(() => {
    if (currentProject && isDirty) {
      setShowUnsavedModal('open');
      return;
    }
    setShowOpenProjectModal(true);
  }, [currentProject, isDirty]);

  const handleLoadProject = useCallback(async (projectId: string) => {
    setIsInitializing(true);
    try {
      const store = useVideoProjectStore.getState();
      if (store.currentProject) {
        store.closeProject();
      }
      closeEditor();

      const project = await store.loadProject(projectId);
      if (project) {
        // Correct dimensions for legacy projects where rotation metadata wasn't applied.
        // Uses Electron IPC → ffmpeg probe (main process downloads with auth headers).
        const videoMedia = project.mediaPool.find((m) => m.mediaType === 'video' && m.externalId);
        if (videoMedia?.externalId && window.electronAPI?.video?.probeDimensions) {
          const API_BASE = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';
          const assetUrl = `${API_BASE}/api/iris/assets/${videoMedia.externalId}/download`;
          const authToken = await window.electronAPI.auth.getToken();
          const probed = await window.electronAPI.video.probeDimensions(assetUrl, authToken ?? undefined);
          // Fix only when probed dims are the exact rotation-swap of stored dims
          if (probed && probed.width === project.height && probed.height === project.width) {
            await store.updateProject({ width: probed.width, height: probed.height });
          }
        }

        // Open editor with a placeholder asset
        useEditorStore.getState().openEditor(
          createPlaceholderAsset(`project-${project.id}`, project.name)
        );

        // Load timeline data if exists
        if (project.timelineData && project.timelineData.tracks?.length > 0) {
          useEditorStore.getState().loadFromTimelineData(project.timelineData, project.duration);

          // Sync timeline clips to media pool - ensure all referenced assets are in the pool
          const mediaPoolIds = new Set(project.mediaPool.map((m) => m.externalId));
          for (const track of project.timelineData.tracks) {
            for (const clip of track.clips) {
              if (clip.sourceUrl && !mediaPoolIds.has(clip.sourceUrl)) {
                const mediaType = clip.type === 'audio' ? 'audio' : clip.type === 'image' ? 'image' : 'video';
                await store.addMedia({
                  mediaType,
                  externalId: clip.sourceUrl,
                  name: clip.name || `${clip.type} clip`,
                });
                mediaPoolIds.add(clip.sourceUrl);
              }
            }
          }
        }

        // Download all server assets to local storage
        await useEditorStore.getState().downloadAllAssets();

        toast.success(`Opened: ${project.name}`);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      toast.error('Failed to open project');
    } finally {
      setIsInitializing(false);
    }
  }, [closeEditor, toast]);

  // Unsaved changes modal handlers
  const handleUnsavedSave = useCallback(async () => {
    const action = showUnsavedModal;
    setShowUnsavedModal(null);
    await handleSave();
    if (action === 'new') setShowNewProjectModal(true);
    else if (action === 'open') setShowOpenProjectModal(true);
  }, [showUnsavedModal, handleSave]);

  const handleUnsavedDiscard = useCallback(() => {
    const action = showUnsavedModal;
    setShowUnsavedModal(null);
    useVideoProjectStore.getState().markClean();
    if (action === 'new') setShowNewProjectModal(true);
    else if (action === 'open') setShowOpenProjectModal(true);
  }, [showUnsavedModal]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNew();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpenProject();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleSaveAs();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNew, handleOpenProject, handleSave, handleSaveAs]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar
        hideNav
        rightContent={
          <button
            onClick={() => setShowExportModal(true)}
            className="h-7 px-4 inline-flex items-center gap-1.5 rounded-full bg-white text-zinc-900 text-xs font-semibold hover:bg-zinc-200 transition-colors shadow-sm"
            title={t('file.exportVideo', { ns: 'menus' })}
          >
            <Upload className="w-3.5 h-3.5" />
            {t('file.exportVideo', { ns: 'menus' })}
          </button>
        }
        leftContent={
          <VideoEditorMenuBar
            onNew={handleNew}
            onOpenProject={handleOpenProject}
            onClose={handleClose}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onGenerateAutoCaptions={() => setShowProjectAutoCaptions(true)}
            onImportSubtitles={handleImportSubtitles}
            onExportSubtitlesSrt={handleExportSubtitlesSrt}
            onExportSubtitlesVtt={handleExportSubtitlesVtt}
            onSilenceRemoval={() => setShowSilenceRemoval(true)}
            hasAsset={!!asset?.id}
            hasMediaClips={hasMediaClips}
            hasSubtitleClips={hasSubtitleClips}
            isSaving={false}
          />
        }
      />
      {(isInitializing || !currentProject) ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900 gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            {asset && (
              <p className="text-zinc-400 text-sm font-medium max-w-xs text-center truncate">
                {asset.name}
              </p>
            )}
            {initStep && (
              <p className="text-zinc-600 text-xs">{initStep}</p>
            )}
            <button
              onClick={handleCancelInit}
              className="mt-2 px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded-full transition-colors"
            >
              {t('buttons.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <VideoEditor
          assetId={asset?.id}
          thumbnailUrl={currentProject.thumbnailUrl || ''}
          duration={currentProject.duration || 0}
          title={currentProject.name}
          onClose={handleClose}
          onSave={handleSave}
          onExport={handleExport}
          hideHeader
          openExportModal={showExportModal}
          onExportModalChange={setShowExportModal}
          onOpenSilenceRemoval={() => setShowSilenceRemoval(true)}
          className="flex-1 h-full"
        />
      )}

      <NewVideoProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={handleCreateNewProject}
      />

      <OpenProjectModal
        isOpen={showOpenProjectModal}
        onClose={() => setShowOpenProjectModal(false)}
        onOpen={handleLoadProject}
      />

      <SaveProjectModal
        isOpen={showSaveProjectModal}
        onClose={() => { setShowSaveProjectModal(false); setIsSaveAsMode(false); }}
        onSave={handleModalSave}
        title={isSaveAsMode ? 'Save Project As' : 'Save Project'}
        defaultName={isSaveAsMode && currentProject ? `${currentProject.name} Copy` : undefined}
      />

      {showProjectAutoCaptions && (
        <ProjectAutoCaptionsModal
          isOpen={showProjectAutoCaptions}
          onClose={() => setShowProjectAutoCaptions(false)}
        />
      )}

      <SilenceRemovalModal
        isOpen={showSilenceRemoval}
        onClose={() => setShowSilenceRemoval(false)}
      />

      {/* Local file close confirmation */}
      <ConfirmDialog
        isOpen={showLocalCloseConfirm}
        onClose={() => setShowLocalCloseConfirm(false)}
        onConfirm={() => {
          setShowLocalCloseConfirm(false);
          closeProject();
          closeEditor();
          setCurrentPage(backPage);
        }}
        title={t('editor.localFileWarning.videoTitle')}
        message={t('editor.localFileWarning.videoMessage')}
        confirmText={t('editor.localFileWarning.closeWithoutSaving')}
        cancelText={t('buttons.cancel')}
        variant="danger"
      />

      {/* Unsaved changes confirmation */}
      <ConfirmDialog
        isOpen={!!showUnsavedModal}
        onClose={() => setShowUnsavedModal(null)}
        onConfirm={handleUnsavedDiscard}
        title={t('editor.videoUnsavedWarning.title')}
        message={t('editor.videoUnsavedWarning.message')}
        confirmText={t('editor.videoUnsavedWarning.discard')}
        cancelText={t('buttons.cancel')}
        variant="danger"
        secondaryAction={{
          text: t('editor.videoUnsavedWarning.saveAndContinue'),
          onClick: handleUnsavedSave,
        }}
      />
    </div>
  );
});

export default VideoEditorPage;
