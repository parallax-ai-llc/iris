/**
 * Parallax Iris - Suno AI Provider Adapter
 * Supports: text-to-music (AI music generation)
 *
 * API Reference:
 * - Base URL: https://api.sunoapi.org
 * - Generate Endpoint: POST /api/v1/generate
 * - Status Endpoint: GET /api/v1/generate/record-info?taskId={taskId}
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
} from '../types.js';
import { ResponseBuilder, OutputBuilder } from './response-builder.js';

// ============================================================
// TYPES
// ============================================================

/** Suno API request payload */
interface SunoGenerateRequest {
  prompt: string;
  style?: string;
  title?: string;
  customMode?: boolean;
  instrumental?: boolean;
  negativeTags?: string;
  /** Vocal gender: 'm' for male, 'f' for female */
  vocalGender?: 'm' | 'f';
  /** Model version */
  model?: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5';
  /** Callback URL (not used in polling approach) */
  callBackUrl?: string;
}

/** Suno API generate response */
interface SunoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/** Suno track data */
interface SunoTrackData {
  id: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  title: string;
  duration?: number;
  prompt?: string;
  tags?: string;
  lyric?: string;
  modelName?: string;
}

/** Suno API status response */
interface SunoStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    status:
      | 'PENDING'
      | 'TEXT_SUCCESS'
      | 'FIRST_SUCCESS'
      | 'SUCCESS'
      | 'CREATE_TASK_FAILED'
      | 'GENERATE_AUDIO_FAILED'
      | 'SENSITIVE_WORD_ERROR';
    /** Response contains audio data when status is SUCCESS */
    response?: {
      sunoData?: SunoTrackData[];
    };
    errorMessage?: string;
  };
}

// ============================================================
// ADAPTER
// ============================================================

export class SunoAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'suno';
  protected baseUrl = 'https://api.sunoapi.org/api/v1';

  readonly capabilities: AICapability[] = ['text-to-music'];

  readonly models: ModelInfo[] = [
    {
      id: 'suno-v4',
      name: 'Suno V4',
      provider: 'suno',
      capabilities: ['text-to-music'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 3000, // prompt character limit
        supportedFormats: ['mp3'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.1, // estimated per track
        currency: 'USD',
      },
      defaultParameters: {
        customMode: false,
        instrumental: false,
      },
    },
    {
      id: 'suno-v4.5',
      name: 'Suno V4.5',
      provider: 'suno',
      capabilities: ['text-to-music'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000, // prompt character limit
        supportedFormats: ['mp3'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.12,
        currency: 'USD',
      },
      defaultParameters: {
        customMode: false,
        instrumental: false,
      },
    },
    {
      id: 'suno-v4.5-plus',
      name: 'Suno V4.5 Plus',
      provider: 'suno',
      capabilities: ['text-to-music'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000,
        supportedFormats: ['mp3'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.15,
        currency: 'USD',
      },
      defaultParameters: {
        customMode: false,
        instrumental: false,
      },
    },
    {
      id: 'suno-v4.5-all',
      name: 'Suno V4.5 All',
      provider: 'suno',
      capabilities: ['text-to-music'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000,
        supportedFormats: ['mp3'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.15,
        currency: 'USD',
      },
      defaultParameters: {
        customMode: false,
        instrumental: false,
      },
    },
    {
      id: 'suno-v5',
      name: 'Suno V5',
      provider: 'suno',
      capabilities: ['text-to-music'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000,
        supportedFormats: ['mp3'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.2,
        currency: 'USD',
      },
      defaultParameters: {
        customMode: false,
        instrumental: false,
      },
      isPreview: true,
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Suno API key is required');
    }
    // Suno doesn't have a dedicated health check endpoint, so we just validate the key format
    // The actual validation happens when we make a request
  }

  protected async pingApi(): Promise<void> {
    // Suno doesn't have a dedicated health check endpoint
    // We would need to make an actual request to validate
    // For now, just check if credentials are set
    if (!this.credentials?.apiKey) {
      throw new Error('Suno API key not configured');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-music':
          return this.textToMusic(request, startTime);
        default:
          return ResponseBuilder.unsupportedCapability(
            request.capability,
            this.name,
            request.model,
            startTime
          );
      }
    } catch (error) {
      return this.createErrorResponse(error as Error, request, startTime);
    }
  }

  private async textToMusic(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;

    // Validate prompt input
    if (!prompt || prompt.trim().length === 0) {
      return ResponseBuilder.missingInput(
        'prompt',
        'text-to-music',
        this.name,
        request.model,
        startTime
      );
    }

    // Map model ID to Suno model version
    const modelVersion = this.mapModelVersion(request.model);

    // Suno's two modes interpret `prompt` completely differently, so the field
    // mapping must respect the mode (see docs.sunoapi.org/suno-api/generate-music):
    //   - Non-custom mode (customMode:false): `prompt` is a DESCRIPTION of the
    //     desired song (Suno auto-writes lyrics + picks a style). style/title
    //     must be empty. Max 500 chars.
    //   - Custom mode (customMode:true): `prompt` is STRICTLY the LYRICS that get
    //     sung; `style` + `title` drive the music and are required (prompt only
    //     required when instrumental is false).
    // Our panel's main textarea is a music DESCRIPTION, with lyrics supplied
    // separately. Feeding the description into `prompt` under custom mode (the
    // old behavior) made Suno sing the description and ignore the intent — so we
    // route the description into `style` and only use `prompt` for real lyrics.
    const description = prompt.trim();
    const lyrics = parameters.lyrics ? String(parameters.lyrics).trim() : '';
    const styleTags = parameters.style ? String(parameters.style).trim() : '';
    const title = parameters.title ? String(parameters.title).trim() : '';
    const instrumental = parameters.instrumental === true;

    // Char limits per model (V4 is tighter than V4.5+).
    const styleLimit = modelVersion === 'V4' ? 200 : 1000;
    const lyricsLimit = modelVersion === 'V4' ? 3000 : 5000;
    const titleLimit = 80;

    // The creative direction that actually shapes the music. Combine explicit
    // genre/style tags with the natural-language description.
    const combinedStyle = [styleTags, description]
      .filter(Boolean)
      .join('\n')
      .slice(0, styleLimit);

    let payload: SunoGenerateRequest;
    if (instrumental) {
      // No vocals: custom mode so style + title are honored; lyrics not needed.
      payload = {
        prompt: '', // ignored for instrumental tracks
        customMode: true,
        instrumental: true,
        style: combinedStyle || description || 'instrumental',
        title: (title || this.deriveTitle(description)).slice(0, titleLimit),
        model: modelVersion,
        callBackUrl: 'https://api.parallax.kr/api/webhooks/suno',
      };
    } else if (lyrics) {
      // Vocals with user-provided lyrics: custom mode, prompt = lyrics.
      payload = {
        prompt: lyrics.slice(0, lyricsLimit),
        customMode: true,
        instrumental: false,
        style: combinedStyle,
        title: (title || this.deriveTitle(description)).slice(0, titleLimit),
        model: modelVersion,
        callBackUrl: 'https://api.parallax.kr/api/webhooks/suno',
      };
    } else {
      // Vocals but no explicit lyrics: non-custom mode so Suno writes lyrics that
      // match the idea. style/title must be empty here — fold tags into the idea.
      const idea = [styleTags, description]
        .filter(Boolean)
        .join(', ')
        .slice(0, 500);
      payload = {
        prompt: idea,
        customMode: false,
        instrumental: false,
        model: modelVersion,
        callBackUrl: 'https://api.parallax.kr/api/webhooks/suno',
      };
    }

    // Optional refinements accepted in either mode.
    if (parameters.negativeTags) {
      payload.negativeTags = String(parameters.negativeTags);
    }
    if (parameters.vocalGender) {
      const gender = String(parameters.vocalGender).toLowerCase();
      if (gender === 'm' || gender === 'male') {
        payload.vocalGender = 'm';
      } else if (gender === 'f' || gender === 'female') {
        payload.vocalGender = 'f';
      }
    }

    // Submit generation request
    const generateResponse = await this.submitGeneration(payload);

    if (generateResponse.code !== 200 || !generateResponse.data?.taskId) {
      return ResponseBuilder.apiError(
        this.name,
        generateResponse.code,
        generateResponse.msg || 'Failed to submit generation request',
        request.model,
        startTime
      );
    }

    const taskId = generateResponse.data.taskId;

    // Poll for completion
    const result = await this.pollForCompletion<SunoStatusResponse>(
      async () => {
        const status = await this.checkStatus(taskId);
        // Get tracks from response.sunoData
        const tracks = status.data.response?.sunoData || [];

        // Check for error states
        if (
          status.data.status === 'CREATE_TASK_FAILED' ||
          status.data.status === 'GENERATE_AUDIO_FAILED' ||
          status.data.status === 'SENSITIVE_WORD_ERROR'
        ) {
          return {
            completed: true,
            error:
              status.data.errorMessage ||
              `Generation failed: ${status.data.status}`,
          };
        }

        // Check for success - tracks must be available
        if (status.data.status === 'SUCCESS' && tracks.length > 0) {
          return {
            completed: true,
            result: status,
          };
        }

        // Still processing
        return { completed: false };
      },
      {
        interval: 4000, // Poll every 4 seconds
        maxWait: 300000, // 5 minutes max
      }
    );

    // Build response with audio outputs
    const tracks = result.data.response?.sunoData || [];

    const outputs = tracks.map((track: SunoTrackData) =>
      OutputBuilder.audio({
        url: track.audioUrl,
        duration: track.duration,
        mimeType: 'audio/mpeg',
        format: 'mp3',
        metadata: {
          id: track.id,
          title: track.title,
          streamUrl: track.streamAudioUrl,
          imageUrl: track.imageUrl,
          style: track.tags,
          lyrics: track.lyric,
          modelName: track.modelName,
        },
      })
    );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'audio',
        this.name,
        request.model,
        startTime,
        result
      );
    }

    // Calculate cost (per track)
    const modelInfo = this.getModelInfo(request.model);
    const costPerTrack = modelInfo?.pricing?.outputCost ?? 0.1;
    const totalCost = costPerTrack * outputs.length;

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: totalCost,
      })
      .metadata(this.name, request.model, startTime, taskId)
      .build();
  }

  /**
   * Derive a short track title from the description when the user didn't supply
   * one. Custom mode requires a non-empty title.
   */
  private deriveTitle(description: string): string {
    const words = description.replace(/\s+/g, ' ').trim().split(' ');
    const title = words.slice(0, 6).join(' ');
    return title || 'Untitled';
  }

  /**
   * Map our model ID to Suno API model version
   */
  private mapModelVersion(modelId: string): SunoGenerateRequest['model'] {
    switch (modelId) {
      case 'suno-v4':
        return 'V4';
      case 'suno-v4.5':
        return 'V4_5';
      case 'suno-v4.5-plus':
        return 'V4_5PLUS';
      case 'suno-v4.5-all':
        return 'V4_5ALL';
      case 'suno-v5':
        return 'V5';
      default:
        return 'V4_5'; // Default to V4.5
    }
  }

  /**
   * Submit a generation request to Suno API
   */
  private async submitGeneration(
    payload: SunoGenerateRequest
  ): Promise<SunoGenerateResponse> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return response.json();
  }

  /**
   * Check the status of a generation task
   */
  private async checkStatus(taskId: string): Promise<SunoStatusResponse> {
    const response = await fetch(
      `${this.baseUrl}/generate/record-info?taskId=${taskId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return response.json();
  }
}
