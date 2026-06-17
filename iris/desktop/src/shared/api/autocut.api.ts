/**
 * Iris API - AutoCut operations
 * API client for AI highlight detection and automatic clip cutting
 */

import { apiClient } from './client';

// ==================== Types ====================

export type ContentType = 'highlights' | 'educational' | 'funny' | 'dramatic' | 'all';

export interface HighlightSegment {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  score: number; // 0-100
  label: string;
  category: string;
  reason: string;
  transcript: string;
}

export interface AutoCutAnalyzeParams {
  sourceAssetId: string;
  language?: string;
  targetClipCount?: number;
  minClipDuration?: number;
  maxClipDuration?: number;
  contentType?: ContentType;
  useSceneDetection?: boolean;
  existingSubtitleId?: string;
}

export interface AutoCutAnalyzeResponse {
  segments: HighlightSegment[];
  subtitleId: string;
  videoDuration: number;
  analysisTokensUsed?: number;
  message: string;
}

export interface AutoCutCutParams {
  sourceAssetId: string;
  segments: Array<{
    id: string;
    startTime: number;
    endTime: number;
    label?: string;
  }>;
  exportMode?: 'individual' | 'merge';
  storagePath: string;
  outputName?: string;
  autoSubtitles?: boolean;
}

export interface AutoCutCutResponse {
  assets: Array<{ id: string; name: string; storagePath: string }>;
  totalCreated: number;
  exportMode: string;
  message: string;
}

// ==================== API Functions ====================

/**
 * Phase 1: Analyze video for highlight segments
 */
export async function analyzeVideo(
  params: AutoCutAnalyzeParams
): Promise<AutoCutAnalyzeResponse | null> {
  const response = await apiClient.post<AutoCutAnalyzeResponse>(
    '/api/iris/autocut/analyze',
    params,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Phase 2: Cut selected highlight segments into clips
 */
export async function cutHighlights(
  params: AutoCutCutParams
): Promise<AutoCutCutResponse | null> {
  const response = await apiClient.post<AutoCutCutResponse>(
    '/api/iris/autocut/cut',
    params,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}
