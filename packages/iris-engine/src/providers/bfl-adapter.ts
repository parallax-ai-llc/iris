/**
 * Parallax Iris - BFL (Black Forest Labs) Provider Adapter
 * Supports: text-to-image, image-to-image via FLUX models
 * API Documentation: https://docs.bfl.ml/
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
} from '../types.js';
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
  CostCalculator,
} from './response-builder.js';
import { mediaInputToUrl } from './media-utils.js';

/** BFL API response types */
interface BflTaskResponse {
  id: string;
  polling_url: string;
}

interface BflResultResponse {
  id: string;
  status:
    | 'Ready'
    | 'Pending'
    | 'Task not found'
    | 'Request Moderated'
    | 'Content Moderated'
    | 'Error';
  result?: {
    sample: string; // Image URL
    prompt?: string;
    seed?: number;
    width?: number;
    height?: number;
  };
}

export class BflAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'bfl';
  protected baseUrl = 'https://api.bfl.ai/v1';

  readonly capabilities: AICapability[] = ['text-to-image', 'image-to-image'];

  readonly models: ModelInfo[] = [
    // FLUX 2 Models
    {
      id: 'flux-2-pro',
      name: 'FLUX.2 Pro',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '21:9',
          '9:21',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.05,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-2-max',
      name: 'FLUX.2 Max',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '21:9',
          '9:21',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.08,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-2-klein-4b',
      name: 'FLUX.2 Klein 4B',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.014,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-2-klein-9b',
      name: 'FLUX.2 Klein 9B',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.015,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-2-flex',
      name: 'FLUX.2 Flex',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '21:9',
          '9:21',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.025,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    // FLUX 1 Models
    {
      id: 'flux-pro-1.1',
      name: 'FLUX 1.1 Pro',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '21:9',
          '9:21',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-dev',
      name: 'FLUX.1 Dev',
      provider: 'bfl',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.025,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    // Kontext Models (Image Editing)
    {
      id: 'flux-kontext-pro',
      name: 'FLUX Kontext Pro',
      provider: 'bfl',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'flux-kontext-max',
      name: 'FLUX Kontext Max',
      provider: 'bfl',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.08,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('BFL API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // Check credits to verify API key
    const response = await fetch(`${this.baseUrl}/credits`, {
      headers: {
        'x-key': this.credentials!.apiKey!,
      },
    });
    if (!response.ok) {
      throw new Error('BFL API key validation failed');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-image':
          return this.textToImage(request, startTime);
        case 'image-to-image':
          return this.imageToImage(request, startTime);
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

  /**
   * Map model names from database to actual BFL API endpoint names
   */
  private mapModelToEndpoint(model: string): string {
    const modelMap: Record<string, string> = {
      // Legacy/short names -> actual API endpoints
      'flux-pro': 'flux-pro-1.1',
      'flux-1-pro': 'flux-pro-1.1',
      'flux-1.1-pro': 'flux-pro-1.1',
      // FLUX 2 aliases
      'flux-2': 'flux-2-pro',
      'flux2-pro': 'flux-2-pro',
      'flux2-max': 'flux-2-max',
      // Klein aliases
      'flux-2-klein': 'flux-2-klein-9b',
      // Kontext aliases
      'kontext-pro': 'flux-kontext-pro',
      'kontext-max': 'flux-kontext-max',
    };
    return modelMap[model] || model;
  }

  private async textToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const requestedModel = request.model || 'flux-pro-1.1';
    const model = this.mapModelToEndpoint(requestedModel);

    // Validate prompt
    const validationError = InputValidator.requirePrompt(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      // Build request payload
      const modelInfo = this.getModelInfo(model);
      const maxImageSize = modelInfo?.constraints?.maxImageSize || 1440;
      const payload = this.buildTextToImagePayload(
        prompt!,
        parameters,
        maxImageSize
      );

      // Submit task
      const taskResponse = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'x-key': this.credentials!.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!taskResponse.ok) {
        const errorData = await taskResponse.json().catch(() => ({}));
        console.error('[BFL] API error:', errorData);
        return ResponseBuilder.apiError(
          this.name,
          taskResponse.status,
          (errorData as { detail?: string; message?: string }).detail ||
            (errorData as { message?: string }).message ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const taskData = (await taskResponse.json()) as BflTaskResponse;

      if (!taskData.polling_url) {
        return ResponseBuilder.apiError(
          this.name,
          500,
          'No polling_url returned from BFL API',
          request.model,
          startTime
        );
      }

      // Poll for result using the polling_url from the response
      const result = await this.pollForResult(taskData.polling_url);

      if (!result.result?.sample) {
        return ResponseBuilder.emptyResponse(
          'image',
          this.name,
          request.model,
          startTime,
          result
        );
      }

      const outputs = [
        OutputBuilder.image({
          url: result.result.sample,
          width: result.result.width,
          height: result.result.height,
          metadata: {
            seed: result.result.seed,
          },
        }),
      ];

      const cost = CostCalculator.forImages(
        modelInfo?.pricing?.outputCost ?? 0.04,
        outputs.length
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ units: outputs.length, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      console.error('[BFL] textToImage error:', error);
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  private async imageToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;
    // Use Kontext models for image-to-image
    const requestedModel = request.model?.includes('kontext')
      ? request.model
      : 'flux-kontext-pro';
    const model = this.mapModelToEndpoint(requestedModel);

    // Validate inputs
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      // Get image URL
      const imageUrl = mediaInputToUrl(inputImage!);

      // Build request payload for Kontext
      const modelInfo = this.getModelInfo(model);
      const maxImageSize = modelInfo?.constraints?.maxImageSize || 1440;
      const payload = this.buildKontextPayload(
        prompt || 'Edit this image',
        imageUrl,
        parameters,
        maxImageSize
      );

      // Submit task
      const taskResponse = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'x-key': this.credentials!.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!taskResponse.ok) {
        const errorData = await taskResponse.json().catch(() => ({}));
        console.error('[BFL] API error:', errorData);
        return ResponseBuilder.apiError(
          this.name,
          taskResponse.status,
          (errorData as { detail?: string; message?: string }).detail ||
            (errorData as { message?: string }).message ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const taskData = (await taskResponse.json()) as BflTaskResponse;

      if (!taskData.polling_url) {
        return ResponseBuilder.apiError(
          this.name,
          500,
          'No polling_url returned from BFL API',
          request.model,
          startTime
        );
      }

      // Poll for result using the polling_url from the response
      const result = await this.pollForResult(taskData.polling_url);

      if (!result.result?.sample) {
        return ResponseBuilder.emptyResponse(
          'image',
          this.name,
          request.model,
          startTime,
          result
        );
      }

      const outputs = [
        OutputBuilder.image({
          url: result.result.sample,
          width: result.result.width,
          height: result.result.height,
          metadata: {
            seed: result.result.seed,
          },
        }),
      ];

      const cost = CostCalculator.forImages(
        modelInfo?.pricing?.outputCost ?? 0.04,
        outputs.length
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ units: outputs.length, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      console.error('[BFL] imageToImage error:', error);
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Build payload for text-to-image generation
   */
  private buildTextToImagePayload(
    prompt: string,
    parameters: Record<string, unknown>,
    maxImageSize = 1440
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      prompt,
    };

    // Add dimensions based on aspect ratio
    if (parameters.aspectRatio) {
      const dimensions = this.aspectRatioToDimensions(
        parameters.aspectRatio as string,
        maxImageSize
      );
      payload.width = dimensions.width;
      payload.height = dimensions.height;
    } else if (parameters.width && parameters.height) {
      payload.width = parameters.width;
      payload.height = parameters.height;
    }

    // Add optional parameters
    if (parameters.seed !== undefined) {
      payload.seed = parameters.seed;
    }
    if (parameters.guidanceScale !== undefined) {
      payload.guidance = parameters.guidanceScale;
    }
    if (parameters.steps !== undefined) {
      payload.steps = parameters.steps;
    }
    if (parameters.outputFormat) {
      payload.output_format = parameters.outputFormat;
    }

    return payload;
  }

  /**
   * Build payload for Kontext (image editing) requests
   */
  private buildKontextPayload(
    prompt: string,
    imageUrl: string,
    parameters: Record<string, unknown>,
    maxImageSize = 1440
  ): Record<string, unknown> {
    // Always set dimensions - use aspectRatio if provided, otherwise default to 1:1
    const aspectRatio = (parameters.aspectRatio as string) || '1:1';
    const dimensions = this.aspectRatioToDimensions(aspectRatio, maxImageSize);

    const payload: Record<string, unknown> = {
      prompt,
      input_images: [imageUrl],
      width: dimensions.width,
      height: dimensions.height,
    };

    // Add optional parameters
    if (parameters.seed !== undefined) {
      payload.seed = parameters.seed;
    }
    if (parameters.guidanceScale !== undefined) {
      payload.guidance = parameters.guidanceScale;
    }

    return payload;
  }

  /**
   * Convert aspect ratio to dimensions, respecting model's maxImageSize constraint.
   * BFL API constraints: dimensions must be multiples of 32.
   */
  private aspectRatioToDimensions(
    aspectRatio: string,
    maxImageSize = 1440
  ): { width: number; height: number } {
    const dimensionMap: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1024, height: 576 },
      '9:16': { width: 576, height: 1024 },
      '4:3': { width: 1280, height: 960 },
      '3:4': { width: 960, height: 1280 },
      '21:9': { width: 1344, height: 576 },
      '9:21': { width: 576, height: 1344 },
    };

    const dims = dimensionMap[aspectRatio] || { width: 1024, height: 1024 };

    // Scale down if either dimension exceeds the model's max, keeping aspect ratio and multiples of 32
    if (dims.width > maxImageSize || dims.height > maxImageSize) {
      const scale = maxImageSize / Math.max(dims.width, dims.height);
      dims.width = Math.floor((dims.width * scale) / 32) * 32;
      dims.height = Math.floor((dims.height * scale) / 32) * 32;
    }

    return dims;
  }

  /**
   * Poll BFL API for task completion
   * Uses the polling_url returned by the BFL API instead of constructing the URL manually
   */
  private async pollForResult(
    pollingUrl: string,
    options: { interval?: number; maxWait?: number } = {}
  ): Promise<BflResultResponse> {
    const { interval = 2000, maxWait = 300000 } = options; // 5 minutes default timeout
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, interval));

      const response = await fetch(pollingUrl, {
        headers: {
          'x-key': this.credentials!.apiKey!,
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[BFL] Poll error: ${response.status} - ${errorText}`);
        throw new Error(
          `BFL polling error: ${response.status} - ${errorText.substring(0, 200)}`
        );
      }

      const result = (await response.json()) as BflResultResponse;

      switch (result.status) {
        case 'Ready':
          return result;
        case 'Pending':
          // Continue polling
          break;
        case 'Task not found':
          throw new Error('BFL task not found');
        case 'Request Moderated':
        case 'Content Moderated':
          throw new Error(
            `Content moderated by BFL safety filters: ${result.status}`
          );
        case 'Error':
          throw new Error('BFL generation failed');
        default:
          // Unknown status, continue polling
          break;
      }
    }

    throw new Error('BFL generation timed out');
  }
}
