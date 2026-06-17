/**
 * usePreRenderGate - Pre-render gate for AI tools on multi-clip projects
 *
 * AI tools that operate on the entire project (Upscale, AutoCut, Auto-Reframe)
 * require a single video asset. When the timeline has multiple video clips,
 * this hook merges them via FFmpeg into a temporary file, uploads it to the
 * server, and returns the resulting assetId.
 *
 * For single-clip timelines, the existing assetId is returned directly.
 *
 * Usage:
 *   const { isMultiClip, isPrerendering, prerenderProgress, prepareAsset } = usePreRenderGate();
 *
 *   const handleAutoCut = async () => {
 *     const assetId = await prepareAsset();
 *     if (!assetId) return; // user cancelled or error
 *     setAutoCutAssetId(assetId);
 *     setShowAutoCut(true);
 *   };
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useEditorStore, type VideoClip } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { uploadAsset } from '@/shared/api/asset.api';
import { getDownloadUrl } from '@/shared/api/asset.api';
import { toast } from '@/shared/lib/toast';

interface PreRenderProgress {
  status: string;
  progress: number;
  message: string;
}

export function usePreRenderGate() {
  const tracks = useEditorStore((s) => s.tracks);
  const [isPrerendering, setIsPrerendering] = useState(false);
  const [prerenderProgress, setPrerenderProgress] = useState<PreRenderProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  // Cache: avoid re-rendering if timeline hasn't changed
  const lastPrerenderAssetId = useRef<string | null>(null);

  const videoClips = useMemo(() => {
    return tracks
      .filter((t) => t.type === 'video' && !t.muted)
      .flatMap((t) => t.clips)
      .filter((c): c is VideoClip => c.type === 'video') as VideoClip[];
  }, [tracks]);

  const isMultiClip = videoClips.length > 1;

  /**
   * Prepare a single assetId for AI processing.
   *
   * - Single clip: returns its assetId immediately.
   * - Multi clip: merges via FFmpeg, uploads to server, returns new assetId.
   *
   * Returns null if the operation fails or is cancelled.
   */
  const prepareAsset = useCallback(async (): Promise<string | null> => {
    // No clips at all
    if (videoClips.length === 0) {
      toast.error('No video clips in timeline');
      return null;
    }

    // Single clip: return assetId directly
    if (!isMultiClip) {
      const clip = videoClips[0];
      return clip.assetId || null;
    }

    // Check electron API availability
    if (!window.electronAPI?.prerender) {
      toast.error('Pre-render requires the desktop application');
      return null;
    }

    setIsPrerendering(true);
    setPrerenderProgress({ status: 'preparing', progress: 0, message: 'Preparing clips...' });

    try {
      // Get project settings for resolution
      const project = useVideoProjectStore.getState().currentProject;
      const width = project?.width || 1920;
      const height = project?.height || 1080;
      const frameRate = project?.frameRate || 30;

      // Resolve download URLs for each clip's asset
      const clipsWithUrls = await Promise.all(
        videoClips.map(async (clip) => {
          // Try to get a download URL from the server
          const downloadUrl = await getDownloadUrl(clip.assetId);
          return {
            sourceUrl: downloadUrl || clip.assetId, // fallback to assetId if it's a local path
            startTime: clip.startTime,
            endTime: clip.endTime,
            sourceStartTime: clip.sourceStartTime,
            sourceEndTime: clip.sourceEndTime,
            volume: clip.volume,
            speed: clip.speed,
          };
        })
      );

      // Set up progress listener
      window.electronAPI.prerender.onProgress((data) => {
        setPrerenderProgress({
          status: data.status,
          progress: data.progress,
          message: data.message,
        });
      });

      // Run FFmpeg merge
      let result: { success: boolean; outputPath?: string; error?: string };
      try {
        result = await window.electronAPI.prerender.mergeClips({
          clips: clipsWithUrls,
          width,
          height,
          frameRate,
        });
      } finally {
        // Clean up progress listener regardless of success or failure
        window.electronAPI.prerender.removeProgressListener();
      }

      if (!result.success || !result.outputPath) {
        toast.error(`Pre-render failed: ${result.error || 'Unknown error'}`);
        return null;
      }

      setPrerenderProgress({ status: 'uploading', progress: 95, message: 'Uploading merged video...' });

      // Read the temp file and upload to server
      let assetId: string | null = null;
      try {
        const fileBuffer = await window.electronAPI.files.readFile(result.outputPath);
        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
        const file = new File([blob], `prerender-${Date.now()}.mp4`, { type: 'video/mp4' });
        const asset = await uploadAsset(file, 'VIDEO');
        assetId = asset?.id || null;
      } catch (uploadError) {
        console.error('Failed to upload pre-rendered file:', uploadError);
        toast.error('Failed to upload merged video to server');
        return null;
      } finally {
        // Clean up temp file regardless of upload success
        window.electronAPI.prerender.cleanup(result.outputPath).catch(() => {});
      }

      if (!assetId) {
        toast.error('Upload succeeded but no asset ID returned');
        return null;
      }

      lastPrerenderAssetId.current = assetId;

      setPrerenderProgress({ status: 'completed', progress: 100, message: 'Ready' });
      toast.success('Project pre-rendered successfully');
      return assetId;
    } catch (error) {
      console.error('Pre-render error:', error);
      toast.error('Pre-render failed unexpectedly');
      return null;
    } finally {
      setIsPrerendering(false);
    }
  }, [isMultiClip, videoClips]);

  /**
   * Cancel an in-progress pre-render.
   */
  const cancelPrerender = useCallback(() => {
    if (window.electronAPI?.prerender) {
      window.electronAPI.prerender.cancel();
      window.electronAPI.prerender.removeProgressListener();
    }
    setIsPrerendering(false);
    setPrerenderProgress({ status: 'idle', progress: 0, message: '' });
  }, []);

  return {
    /** Whether the timeline has more than one video clip */
    isMultiClip,
    /** Whether a pre-render is currently in progress */
    isPrerendering,
    /** Current pre-render progress details */
    prerenderProgress,
    /** Prepare a single assetId (auto-merges if multi-clip) */
    prepareAsset,
    /** Cancel an in-progress pre-render */
    cancelPrerender,
  };
}
