/**
 * Google AI Provider - Model Definitions
 *
 * Contains all model configurations for Google AI (Imagen, Veo, Gemini, Chirp)
 * Extracted from google-adapter.ts for better maintainability.
 */

import { ModelInfo } from '../types.js';

/**
 * Google AI Models
 * - Imagen: Image generation
 * - Gemini: Text generation and analysis
 * - Veo: Video generation
 * - Chirp: Speech-to-text
 */
export const GOOGLE_MODELS: ModelInfo[] = [
  // ============ Image Generation Models (Imagen) ============
  {
    id: 'gemini-2.5-flash-image',
    name: 'Imagen 4',
    provider: 'google',
    capabilities: ['text-to-image', 'image-to-image'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    constraints: {
      maxImageSize: 2048,
      supportedFormats: ['png', 'jpeg'],
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    },
    pricing: { unit: 'image', inputCost: 0, outputCost: 0.04, currency: 'USD' },
    defaultParameters: { numOutputs: 1 },
  },
  {
    id: 'gemini-2.5-flash-image-fast',
    name: 'Imagen 4 Fast',
    provider: 'google',
    capabilities: ['text-to-image', 'image-to-image'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    constraints: {
      maxImageSize: 2048,
      supportedFormats: ['png', 'jpeg'],
      supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    },
    pricing: { unit: 'image', inputCost: 0, outputCost: 0.02, currency: 'USD' },
    defaultParameters: { numOutputs: 1 },
  },

  // ============ Gemini Models (Text & Analysis) ============
  {
    id: 'gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash Image',
    provider: 'google',
    capabilities: ['text-to-image', 'inpaint', 'image-to-image'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    constraints: {
      maxImageSize: 2048,
      supportedFormats: ['png', 'jpeg', 'webp'],
    },
    pricing: {
      unit: 'image',
      inputCost: 0,
      outputCost: 0.039,
      currency: 'USD',
    },
    defaultParameters: { numOutputs: 1 },
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    capabilities: ['text-to-text', 'image-analysis', 'video-analysis'],
    inputTypes: ['text', 'image', 'video'],
    outputTypes: ['text'],
    constraints: { maxTokens: 1048576 },
    pricing: {
      unit: 'token',
      inputCost: 0.00003125 / 1000,
      outputCost: 0.000125 / 1000,
      currency: 'USD',
    },
    defaultParameters: { temperature: 0.7, maxTokens: 32000 },
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    capabilities: ['text-to-text', 'image-analysis', 'video-analysis'],
    inputTypes: ['text', 'image', 'video'],
    outputTypes: ['text'],
    constraints: { maxTokens: 1048576 },
    pricing: {
      unit: 'token',
      inputCost: 0.000009375 / 1000,
      outputCost: 0.0000375 / 1000,
      currency: 'USD',
    },
    defaultParameters: { temperature: 0.7, maxTokens: 32000 },
  },
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    capabilities: ['text-to-text', 'image-analysis', 'video-analysis'],
    inputTypes: ['text', 'image', 'video'],
    outputTypes: ['text'],
    constraints: { maxTokens: 1048576 },
    pricing: {
      unit: 'token',
      inputCost: 0.00001875 / 1000,
      outputCost: 0.000075 / 1000,
      currency: 'USD',
    },
    defaultParameters: { temperature: 0.7 },
  },

  // ============ Video Generation Models (Veo) ============
  {
    id: 'veo-3.1-generate-001',
    name: 'Veo 3',
    provider: 'google',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 8,
      supportedDurations: [4, 6, 8],
      supportedAspectRatios: ['16:9', '9:16'],
    },
    pricing: { unit: 'second', inputCost: 0, outputCost: 0.5, currency: 'USD' },
  },
  {
    id: 'veo-3.1-fast-generate-001',
    name: 'Veo 3 Fast',
    provider: 'google',
    capabilities: ['text-to-video', 'image-to-video'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    constraints: {
      maxVideoDuration: 8,
      supportedDurations: [4, 6, 8],
      supportedAspectRatios: ['16:9', '9:16'],
    },
    pricing: {
      unit: 'second',
      inputCost: 0,
      outputCost: 0.35,
      currency: 'USD',
    },
  },

  // ============ Speech-to-Text Models (Chirp) ============
  // Pricing: $0.016/min = ~$0.000267/sec
  {
    id: 'chirp',
    name: 'Chirp',
    provider: 'google',
    capabilities: ['speech-to-text'],
    inputTypes: ['audio'],
    outputTypes: ['text'],
    constraints: {
      maxAudioDuration: 28800, // 8 hours
      supportedFormats: ['wav', 'mp3', 'ogg', 'flac', 'webm', 'mp4'],
    },
    pricing: {
      unit: 'second',
      inputCost: 0.016 / 60,
      outputCost: 0,
      currency: 'USD',
    },
  },
  {
    id: 'chirp_2',
    name: 'Chirp 2',
    provider: 'google',
    capabilities: ['speech-to-text'],
    inputTypes: ['audio'],
    outputTypes: ['text'],
    constraints: {
      maxAudioDuration: 28800,
      supportedFormats: ['wav', 'mp3', 'ogg', 'flac', 'webm', 'mp4'],
    },
    pricing: {
      unit: 'second',
      inputCost: 0.016 / 60,
      outputCost: 0,
      currency: 'USD',
    },
  },
];
