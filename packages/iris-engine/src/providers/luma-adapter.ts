/**
 * Parallax Iris - Luma AI Provider Adapter
 * Supports: text-to-video, image-to-video (Dream Machine)
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
} from '../types.js';
import { uploadTempPublicFile } from '../host-hooks.js';
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
} from './response-builder.js';

export class LumaAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'luma';
  protected baseUrl = 'https://api.lumalabs.ai/dream-machine/v1';

  readonly capabilities: AICapability[] = ['text-to-video', 'image-to-video'];

  readonly models: ModelInfo[] = [
    {
      id: 'ray-3',
      name: 'Ray 3',
      provider: 'luma',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.032,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
    {
      id: 'ray-2',
      name: 'Ray 2',
      provider: 'luma',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.028,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
    {
      id: 'ray-flash-2',
      name: 'Ray Flash 2',
      provider: 'luma',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.016,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
    {
      id: 'ray-1-6',
      name: 'Ray 1.6',
      provider: 'luma',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.3,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Luma AI API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/generations`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error('Failed to connect to Luma AI API');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-video':
          return this.textToVideo(request, startTime);
        case 'image-to-video':
          return this.imageToVideo(request, startTime);
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

  private async textToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const modelName = request.model || 'ray-2';

    const response = await fetch(`${this.baseUrl}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt,
        aspect_ratio: parameters.aspectRatio || '16:9',
        loop: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.detail || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as { id: string };
    const result = await this.pollForVideoCompletion(data.id);

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.video({
          url: result.video_url,
          duration: 5,
          mimeType: 'video/mp4',
          format: 'mp4',
        }),
      ])
      .usage({ estimatedCost: 0.3 })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;

    // Validate image input
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    // Luma API requires URL, not base64 - upload to GCS if needed
    let imageUrl: string;
    if (inputImage!.type === 'url') {
      imageUrl = inputImage!.value;
    } else {
      const mimeType = inputImage!.mimeType || 'image/png';
      imageUrl = await this.uploadToGcs(inputImage!.value, mimeType);
      console.log('[Luma] Uploaded image to GCS:', imageUrl);
    }

    const modelName = request.model || 'ray-2';

    // Build request body - prompt is optional for image-to-video
    const requestBody: Record<string, unknown> = {
      model: modelName,
      keyframes: { frame0: { type: 'image', url: imageUrl } },
      aspect_ratio: parameters.aspectRatio || '16:9',
    };

    // Only include prompt if it's a non-empty string
    if (prompt?.trim()) {
      requestBody.prompt = prompt;
    }

    const response = await fetch(`${this.baseUrl}/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.detail || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as { id: string };
    const result = await this.pollForVideoCompletion(data.id);

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.video({
          url: result.video_url,
          duration: 5,
          mimeType: 'video/mp4',
          format: 'mp4',
        }),
      ])
      .usage({ estimatedCost: 0.3 })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async pollForVideoCompletion(
    generationId: string
  ): Promise<{ video_url: string }> {
    return this.pollForCompletion<{ video_url: string }>(
      async () => {
        const statusRes = await fetch(
          `${this.baseUrl}/generations/${generationId}`,
          {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          }
        );
        const statusData = (await statusRes.json()) as {
          state: string;
          assets?: { video?: string };
          failure_reason?: string;
        };

        if (statusData.state === 'completed' && statusData.assets?.video) {
          return {
            completed: true,
            result: { video_url: statusData.assets.video },
          };
        } else if (statusData.state === 'failed') {
          return {
            completed: true,
            error: statusData.failure_reason || 'Generation failed',
          };
        }
        return { completed: false };
      },
      { interval: 5000, maxWait: 300000 }
    );
  }

  private async uploadToGcs(
    base64Data: string,
    mimeType: string
  ): Promise<string> {
    const result = await uploadTempPublicFile({
      base64Data,
      mimeType,
      provider: 'luma',
      expirationMinutes: 60,
    });

    if (!result.success || !result.signedUrl) {
      throw new Error(
        `Failed to upload temp file: ${result.error || 'Unknown error'}`
      );
    }

    return result.signedUrl;
  }
}
