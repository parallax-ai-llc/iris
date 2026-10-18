/**
 * Parallax Iris - Runway ML Provider Adapter
 * Supports: image-to-video, text-to-video
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
  GeneratedOutput,
} from '../types.js';
import { ResponseBuilder, OutputBuilder } from './response-builder.js';
import { mediaInputToUrl } from './media-utils.js';

export class RunwayAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'runway';
  protected baseUrl = 'https://api.dev.runwayml.com/v1';

  readonly capabilities: AICapability[] = ['image-to-video', 'text-to-video'];

  readonly models: ModelInfo[] = [
    {
      id: 'gen4_turbo',
      name: 'Gen-4 Turbo',
      provider: 'runway',
      capabilities: ['image-to-video', 'text-to-video'],
      inputTypes: ['image', 'text'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedAspectRatios: ['16:9', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.05,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
    {
      id: 'gen-3-alpha-turbo',
      name: 'Gen-3 Alpha Turbo',
      provider: 'runway',
      capabilities: ['image-to-video', 'text-to-video'],
      inputTypes: ['image', 'text'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedAspectRatios: ['16:9', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.025,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
    {
      id: 'gen3a_turbo',
      name: 'Gen-3 Alpha Turbo (API)',
      provider: 'runway',
      capabilities: ['image-to-video', 'text-to-video'],
      inputTypes: ['image', 'text'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [5, 10],
        supportedAspectRatios: ['16:9', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.025,
        currency: 'USD',
      },
      defaultParameters: { duration: 5, aspectRatio: '16:9' },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Runway API key is required');
    }
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    if (!this.credentials?.apiKey || this.credentials.apiKey.length < 10) {
      throw new Error('Invalid Runway API key');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return ResponseBuilder.validationError(
          'request',
          validation.errors[0].message,
          this.name,
          request.model,
          startTime
        );
      }

      const hasImage = !!(
        request.inputImage ||
        (request.inputImages && request.inputImages.length > 0)
      );
      const apiModel = this.mapModelToApiName(request.model);

      // gen3a_turbo requires an image
      if (apiModel === 'gen3a_turbo' && !hasImage) {
        return ResponseBuilder.validationError(
          'inputImage',
          'Gen-3 Alpha Turbo requires a reference image. Please provide an image or use a text-to-video model like Veo.',
          this.name,
          request.model,
          startTime
        );
      }

      const payload = this.buildRequestPayload(request, hasImage);
      const endpoint = hasImage ? '/image_to_video' : '/text_to_video';

      const taskResponse = await this.fetchApi<{ id: string; status: string }>(
        endpoint,
        {
          method: 'POST',
          headers: { 'X-Runway-Version': '2024-11-06' },
          body: JSON.stringify(payload),
        }
      );

      const result = await this.pollForCompletion<{
        id: string;
        status: string;
        output: string[];
        failure?: string;
        createdAt: string;
      }>(
        async () => {
          const status = await this.fetchApi<{
            id: string;
            status: string;
            output?: string[];
            failure?: string;
          }>(`/tasks/${taskResponse.id}`, {
            headers: { 'X-Runway-Version': '2024-11-06' },
          });

          if (status.status === 'SUCCEEDED') {
            return { completed: true, result: status as any };
          } else if (status.status === 'FAILED') {
            console.error('[Runway] Task failed:', status.failure);
            return {
              completed: true,
              error: status.failure || 'Video generation failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      const outputs: GeneratedOutput[] = result.output.map(url =>
        OutputBuilder.video({
          url,
          duration: (request.parameters?.duration as number) ?? 5,
          mimeType: 'video/mp4',
          format: 'mp4',
        })
      );

      const model = this.getModelInfo(request.model);
      const videoDuration = (request.parameters?.duration as number) ?? 5;
      const estimatedCost =
        (model?.pricing?.outputCost ?? 0.025) * videoDuration;

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ durationSeconds: videoDuration, estimatedCost })
        .rawResponse(result)
        .metadata(this.name, request.model, startTime, result.id)
        .build();
    } catch (error) {
      return this.createErrorResponse(error as Error, request, startTime);
    }
  }

  private mapModelToApiName(modelId: string): string {
    const modelMap: Record<string, string> = {
      'gen-3-alpha-turbo': 'gen3a_turbo',
      gen3a_turbo: 'gen3a_turbo',
      gen3a: 'gen3a_turbo',
      gen4_turbo: 'gen4_turbo',
    };
    return modelMap[modelId] || 'gen3a_turbo';
  }

  private mapModelToTextToVideoApiName(modelId: string): string {
    const modelMap: Record<string, string> = {
      veo3: 'veo3',
      'veo3.1': 'veo3.1',
      'veo3.1_fast': 'veo3.1_fast',
    };
    return modelMap[modelId] || 'veo3.1';
  }

  private buildRequestPayload(
    request: AIRequest,
    hasImage: boolean
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    const promptText =
      request.prompt?.trim() ||
      'Animate this image with natural, smooth motion';
    payload.promptText = promptText.substring(0, 512);

    if (hasImage) {
      const apiModel = this.mapModelToApiName(request.model);
      payload.model = apiModel;
      payload.duration = request.parameters?.duration ?? 5;

      const aspectRatio = request.parameters?.aspectRatio as string;
      // Runway API requires resolution format: 1280:720, 720:1280, 1104:832, 832:1104, 960:960, 1584:672
      if (apiModel === 'gen3a_turbo') {
        payload.ratio = aspectRatio === '9:16' ? '768:1280' : '1280:768';
      } else {
        // gen4_turbo
        payload.ratio = aspectRatio === '9:16' ? '720:1280' : '1280:720';
      }

      // Add image input
      const startImage = request.inputImage || request.inputImages?.[0];
      const endImage = request.inputImages?.[1]; // Optional end frame (last frame)

      if (startImage) {
        const imageUrl = mediaInputToUrl(startImage);

        // gen4_turbo supports simple string format or array with position
        // gen3a_turbo requires array format with position for first/last frame
        if (apiModel === 'gen3a_turbo' || endImage) {
          // Use array format with position when using gen3a_turbo or when end frame is provided
          const promptImages: Array<{
            uri: string;
            position: 'first' | 'last';
          }> = [{ uri: imageUrl, position: 'first' }];
          if (endImage) {
            promptImages.push({
              uri: mediaInputToUrl(endImage),
              position: 'last',
            });
          }
          payload.promptImage = promptImages;
        } else {
          // gen4_turbo with single image - use simple string format
          payload.promptImage = imageUrl;
        }
      }
    } else {
      const apiModel = this.mapModelToTextToVideoApiName(request.model);
      payload.model = apiModel;

      const requestedDuration = (request.parameters?.duration as number) ?? 5;
      if (requestedDuration <= 4) payload.duration = 4;
      else if (requestedDuration <= 6) payload.duration = 6;
      else payload.duration = 8;

      const aspectRatio = request.parameters?.aspectRatio as string;
      payload.ratio = aspectRatio === '9:16' ? '1080:1920' : '1920:1080';
      payload.audio = true;
    }

    if (request.parameters?.seed) {
      payload.seed = request.parameters.seed;
    }

    return payload;
  }

  estimateCost(request: AIRequest): number {
    const model = this.getModelInfo(request.model);
    if (!model?.pricing) return 0;
    const duration = (request.parameters?.duration as number) ?? 5;
    return model.pricing.outputCost * duration;
  }
}
