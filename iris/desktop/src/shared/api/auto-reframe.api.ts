/**
 * Iris API - Auto-Reframe operations
 * API client for AI-powered video reframing (subject tracking + dynamic crop)
 */

import { apiClient } from './client';

// ==================== Types ====================

export type AspectRatio = '9:16' | '1:1' | '4:5' | '4:3' | '16:9' | '21:9';
export type TrackingMode = 'auto' | 'face' | 'center' | 'custom';
export type MotionSmoothingLevel = 'none' | 'low' | 'medium' | 'high';

export interface CropKeyframe {
  time: number;   // seconds
  x: number;      // crop X offset (pixels)
  y: number;      // crop Y offset (pixels)
  width: number;  // crop width (pixels)
  height: number; // crop height (pixels)
}

export interface AutoReframeAnalyzeParams {
  sourceAssetId: string;
  targetAspectRatio: AspectRatio;
  trackingMode?: TrackingMode;
  motionSmoothing?: MotionSmoothingLevel;
  sampleInterval?: number;
  focusRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AutoReframeAnalyzeResponse {
  cropKeyframes: CropKeyframe[];
  videoDuration: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  targetAspectRatio: string;
  subjectDetections: number;
  analysisTokensUsed?: number;
  message: string;
}

export interface AutoReframeRenderParams {
  sourceAssetId: string;
  targetAspectRatio: AspectRatio;
  cropKeyframes: CropKeyframe[];
  motionSmoothing?: MotionSmoothingLevel;
  outputWidth?: number;
  outputHeight?: number;
  storagePath: string;
  outputName?: string;
}

export interface AutoReframeRenderResponse {
  asset: { id: string; name: string; storagePath: string };
  outputWidth: number;
  outputHeight: number;
  duration: number;
  message: string;
}

// ==================== API Functions ====================

/**
 * Phase 1: Analyze video for subject positions and generate crop keyframes
 */
export async function analyzeForReframe(
  params: AutoReframeAnalyzeParams
): Promise<AutoReframeAnalyzeResponse | null> {
  const response = await apiClient.post<AutoReframeAnalyzeResponse>(
    '/api/iris/auto-reframe/analyze',
    params,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}

/**
 * Phase 2: Render reframed video with crop keyframes
 */
export async function renderReframe(
  params: AutoReframeRenderParams
): Promise<AutoReframeRenderResponse | null> {
  const response = await apiClient.post<AutoReframeRenderResponse>(
    '/api/iris/auto-reframe/render',
    params,
    { requireAuth: true }
  );
  return response.success ? response.data! : null;
}
