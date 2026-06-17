/**
 * Parallax Iris - Ideogram Provider Adapter
 * Supports: text-to-image, image-to-image (remix), image-upscale
 * API Docs: https://developer.ideogram.ai/ideogram-api/api-overview
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
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
  CostCalculator,
} from './response-builder.js';
import { mediaInputToBuffer, mapAspectRatio } from './media-utils.js';

export class IdeogramAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'ideogram';
  protected baseUrl = 'https://api.ideogram.ai';

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'image-upscale',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'ideogram-3.0',
      name: 'Ideogram 3.0',
      provider: 'ideogram',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1536,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '3:2',
          '2:3',
          '16:10',
          '10:16',
          '3:1',
          '1:3',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.08,
        currency: 'USD',
      },
      defaultParameters: { aspectRatio: '1:1', renderingSpeed: 'DEFAULT' },
    },
    {
      id: 'ideogram-3.0-turbo',
      name: 'Ideogram 3.0 Turbo',
      provider: 'ideogram',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1536,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '3:2',
          '2:3',
          '16:10',
          '10:16',
          '3:1',
          '1:3',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: { aspectRatio: '1:1', renderingSpeed: 'TURBO' },
    },
    {
      id: 'ideogram-upscale',
      name: 'Ideogram Upscale',
      provider: 'ideogram',
      capabilities: ['image-upscale'],
      inputTypes: ['image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 10485760,
        supportedFormats: ['png', 'jpeg', 'webp'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.08,
        currency: 'USD',
      },
      defaultParameters: { resemblance: 50, detail: 50 },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Ideogram API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // No-op for Ideogram - validated on first request
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-image':
          return this.textToImage(request, startTime);
        case 'image-to-image':
          return this.imageRemix(request, startTime);
        case 'image-upscale':
          return this.imageUpscale(request, startTime);
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

  private async textToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, negativePrompt, parameters = {} } = request;
    const model = request.model || 'ideogram-3.0';

    let renderingSpeed = (parameters.renderingSpeed as string) || 'DEFAULT';
    if (model.includes('turbo')) renderingSpeed = 'TURBO';

    const aspectRatio = mapAspectRatio(
      parameters.aspectRatio || '1:1',
      'ideogram'
    );

    const requestBody: Record<string, unknown> = {
      prompt: prompt || '',
      rendering_speed: renderingSpeed,
      aspect_ratio: aspectRatio,
      magic_prompt: parameters.magicPrompt || 'AUTO',
      num_images: parameters.numOutputs || 1,
    };

    if (negativePrompt) requestBody.negative_prompt = negativePrompt;
    if (parameters.seed !== undefined) requestBody.seed = parameters.seed;
    if (parameters.styleType) requestBody.style_type = parameters.styleType;
    if (parameters.stylePreset)
      requestBody.style_preset = parameters.stylePreset;

    const response = await fetch(`${this.baseUrl}/v1/ideogram-v3/generate`, {
      method: 'POST',
      headers: {
        'Api-Key': this.credentials!.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Ideogram API error: ${response.status}`;
      console.error('[IdeogramAdapter] API error:', {
        status: response.status,
        errorText,
        requestBody,
      });

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.message ||
          errorJson.error ||
          errorJson.detail ||
          errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }

      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorMessage,
        request.model,
        startTime
      );
    }

    const responseData = (await response.json()) as {
      created: string;
      data: Array<{
        url: string | null;
        prompt: string;
        resolution: string;
        is_image_safe: boolean;
        seed: number;
        style_type: string;
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const numImages = responseData.data?.length || 0;

    for (const item of responseData.data || []) {
      if (!item.url || !item.is_image_safe) continue;

      const [width, height] = (item.resolution || '1024x1024')
        .split('x')
        .map(Number);

      outputs.push(
        OutputBuilder.image({
          url: item.url,
          width,
          height,
          mimeType: 'image/png',
          format: 'png',
          metadata: {
            seed: item.seed,
            prompt: item.prompt,
            styleType: item.style_type,
          },
        })
      );
    }

    const costPerImage = model.includes('turbo') ? 0.04 : 0.08;
    const estimatedCost = CostCalculator.forImages(costPerImage, numImages);

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(responseData)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageRemix(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, negativePrompt, parameters = {} } = request;
    const model = request.model || 'ideogram-3.0';

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    let renderingSpeed = (parameters.renderingSpeed as string) || 'DEFAULT';
    if (model.includes('turbo')) renderingSpeed = 'TURBO';

    const aspectRatio = mapAspectRatio(
      parameters.aspectRatio || '1:1',
      'ideogram'
    );

    // Build remix request with image_weight for strength control
    const imageWeight =
      parameters.strength !== undefined
        ? Math.round((1 - (parameters.strength as number)) * 100)
        : 50;

    const imageRequest: Record<string, unknown> = {
      prompt: prompt || 'Remix this image',
      rendering_speed: renderingSpeed,
      aspect_ratio: aspectRatio,
      magic_prompt: parameters.magicPrompt || 'AUTO',
      num_images: parameters.numOutputs || 1,
      image_weight: imageWeight, // 0-100, higher = more like original
    };

    if (negativePrompt) imageRequest.negative_prompt = negativePrompt;
    if (parameters.seed !== undefined) imageRequest.seed = parameters.seed;
    if (parameters.styleType) imageRequest.style_type = parameters.styleType;

    const formData = new FormData();
    formData.append('image_request', JSON.stringify(imageRequest));

    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    const extension = mimeType.split('/')[1] || 'png';
    formData.append('image_file', blob, `image.${extension}`);

    const response = await fetch(`${this.baseUrl}/remix`, {
      method: 'POST',
      headers: { 'Api-Key': this.credentials!.apiKey! },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Ideogram Remix API error: ${response.status}`;
      console.error('[IdeogramAdapter] Remix API error:', {
        status: response.status,
        errorText,
      });

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.message ||
          errorJson.error ||
          errorJson.detail ||
          errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }

      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorMessage,
        request.model,
        startTime
      );
    }

    const responseData = (await response.json()) as {
      created: string;
      data: Array<{
        url: string | null;
        prompt: string;
        resolution: string;
        is_image_safe: boolean;
        seed: number;
        style_type: string;
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const numImages = responseData.data?.length || 0;

    for (const item of responseData.data || []) {
      if (!item.url || !item.is_image_safe) continue;

      const [width, height] = (item.resolution || '1024x1024')
        .split('x')
        .map(Number);

      outputs.push(
        OutputBuilder.image({
          url: item.url,
          width,
          height,
          mimeType: 'image/png',
          format: 'png',
          metadata: {
            seed: item.seed,
            prompt: item.prompt,
            styleType: item.style_type,
          },
        })
      );
    }

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'remixed image',
        this.name,
        request.model,
        startTime,
        responseData
      );
    }

    const costPerImage = model.includes('turbo') ? 0.04 : 0.08;
    const estimatedCost = CostCalculator.forImages(costPerImage, numImages);

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(responseData)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageUpscale(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputImage, prompt, parameters = {} } = request;

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    const imageRequest: Record<string, unknown> = {
      resemblance: parameters.resemblance ?? 50,
      detail: parameters.detail ?? 50,
      num_images: 1,
    };

    if (prompt) {
      imageRequest.prompt = prompt;
      imageRequest.magic_prompt_option = parameters.magicPrompt ?? 'AUTO';
    }

    if (parameters.seed !== undefined) {
      imageRequest.seed = parameters.seed;
    }

    const formData = new FormData();
    formData.append('image_request', JSON.stringify(imageRequest));

    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    const extension = mimeType.split('/')[1] || 'png';
    formData.append('image_file', blob, `image.${extension}`);

    const response = await fetch(`${this.baseUrl}/upscale`, {
      method: 'POST',
      headers: { 'Api-Key': this.credentials!.apiKey! },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Ideogram Upscale API error: ${response.status}`;
      console.error('[IdeogramAdapter] Upscale API error:', {
        status: response.status,
        errorText,
      });

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage =
          errorJson.message ||
          errorJson.error ||
          errorJson.detail ||
          errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${errorText}`;
      }

      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorMessage,
        'ideogram-upscale',
        startTime
      );
    }

    const responseData = (await response.json()) as {
      created: string;
      data: Array<{
        url: string | null;
        prompt: string;
        resolution: string;
        upscaled_resolution: string;
        is_image_safe: boolean;
        seed: number;
        style_type: string;
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const numImages = responseData.data?.length || 0;

    for (const item of responseData.data || []) {
      if (!item.url || !item.is_image_safe) continue;

      const [width, height] = (
        item.upscaled_resolution ||
        item.resolution ||
        '2048x2048'
      )
        .split('x')
        .map(Number);

      outputs.push(
        OutputBuilder.image({
          url: item.url,
          width,
          height,
          mimeType: 'image/png',
          format: 'png',
          metadata: {
            seed: item.seed,
            prompt: item.prompt,
            styleType: item.style_type,
            originalResolution: item.resolution,
            upscaledResolution: item.upscaled_resolution,
          },
        })
      );
    }

    const estimatedCost = CostCalculator.forImages(0.08, numImages);

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(responseData)
      .metadata(this.name, 'ideogram-upscale', startTime)
      .build();
  }
}
