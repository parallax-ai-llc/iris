/**
 * Parallax Iris - Stability AI Provider Adapter
 * Supports: text-to-image, image-to-image, inpaint, outpaint
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
} from './response-builder.js';
import { mediaInputToBuffer, parseAspectRatio } from './media-utils.js';

const STABILITY_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '3:2',
  '5:4',
  '1:1',
  '4:5',
  '2:3',
  '9:16',
  '9:21',
] as const;

function mapToStabilityAspectRatio(ratio: string): string {
  if ((STABILITY_ASPECT_RATIOS as readonly string[]).includes(ratio))
    return ratio;
  // Map unsupported ratios to nearest supported
  const map: Record<string, string> = {
    '3:4': '4:5',
    '4:3': '3:2',
    '2:1': '16:9',
    '1:2': '9:16',
  };
  return map[ratio] || '1:1';
}

export class StabilityAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'stability';
  protected baseUrl = 'https://api.stability.ai/v2beta';

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'image-to-video',
    'inpaint',
    'outpaint',
    'sky-replace',
    'image-enhance',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'stable-diffusion-3',
      name: 'Stable Diffusion 3',
      provider: 'stability',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
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
          '21:9',
          '9:21',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.035,
        currency: 'USD',
      },
      defaultParameters: { width: 1024, height: 1024 },
    },
    {
      id: 'stable-diffusion-xl',
      name: 'Stable Diffusion XL',
      provider: 'stability',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.002,
        currency: 'USD',
      },
      defaultParameters: {
        width: 1024,
        height: 1024,
        guidanceScale: 7,
        steps: 30,
      },
    },
    {
      id: 'stable-video-diffusion',
      name: 'Stable Video Diffusion',
      provider: 'stability',
      capabilities: ['image-to-video'],
      inputTypes: ['image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 4,
        supportedDurations: [2, 4],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16'],
      },
      pricing: {
        unit: 'request',
        inputCost: 0,
        outputCost: 0.2,
        currency: 'USD',
      },
      defaultParameters: { duration: 4, fps: 25 },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Stability AI API key is required');
    }
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/stable-image/generate/sd3`, {
      method: 'OPTIONS',
      headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
    });
    if (!response.ok && response.status !== 405) {
      throw new Error('Failed to connect to Stability AI API');
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
        case 'inpaint':
          return this.handleInpaint(request, startTime);
        case 'outpaint':
          return this.handleOutpaint(request, startTime);
        case 'sky-replace':
          return this.handleSkyReplace(request, startTime);
        case 'image-enhance':
          return this.handleAutoEnhance(request, startTime);
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
    const { prompt, parameters = {} } = request;
    const model = request.model || 'stable-diffusion-3';
    const { width, height } = parseAspectRatio(
      (parameters.aspectRatio as string) || '1:1'
    );

    const endpoint =
      model.includes('sd3') || model.includes('stable-diffusion-3')
        ? '/stable-image/generate/sd3'
        : '/stable-image/generate/core';

    const formData = new FormData();
    formData.append('prompt', prompt || '');
    formData.append('output_format', 'png');
    formData.append(
      'aspect_ratio',
      mapToStabilityAspectRatio((parameters.aspectRatio as string) || '1:1')
    );
    if (parameters.negativePrompt)
      formData.append('negative_prompt', parameters.negativePrompt as string);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        Accept: 'image/*',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({
          base64,
          width,
          height,
          mimeType: 'image/png',
          format: 'png',
        }),
      ])
      .usage({ units: 1, estimatedCost: 0.035 })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );
    const imageBlob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });

    const formData = new FormData();
    formData.append('image', imageBlob, 'input.png');
    formData.append('prompt', prompt || 'Generate a variation of this image');
    formData.append('output_format', 'png');
    formData.append('control_strength', String(parameters.strength || 0.7));
    if (parameters.negativePrompt)
      formData.append('negative_prompt', parameters.negativePrompt as string);

    const response = await fetch(
      `${this.baseUrl}/stable-image/control/structure`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          Accept: 'image/*',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({ base64, mimeType: 'image/png', format: 'png' }),
      ])
      .usage({ units: 1, estimatedCost: 0.035 })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async handleInpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const imageValidation = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (imageValidation) return imageValidation;

    const maskValidation = InputValidator.requireMask(
      request,
      this.name,
      startTime
    );
    if (maskValidation) return maskValidation;

    const formData = new FormData();
    formData.append(
      'prompt',
      request.prompt || 'Fill in the masked area naturally'
    );
    formData.append('output_format', 'png');

    // Add source image
    const { buffer: imageBuffer, mimeType: imageMime } =
      await mediaInputToBuffer(request.inputImage!);
    formData.append(
      'image',
      new Blob([imageBuffer as unknown as BlobPart], { type: imageMime }),
      'image.png'
    );

    // Add mask image
    const { buffer: maskBuffer, mimeType: maskMime } = await mediaInputToBuffer(
      request.maskImage!
    );
    formData.append(
      'mask',
      new Blob([maskBuffer as unknown as BlobPart], { type: maskMime }),
      'mask.png'
    );

    if (request.negativePrompt)
      formData.append('negative_prompt', request.negativePrompt);

    const response = await fetch(`${this.baseUrl}/stable-image/edit/inpaint`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        Accept: 'image/*',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({ base64, mimeType: 'image/png', format: 'png' }),
      ])
      .usage({ units: 1, estimatedCost: 0.04 })
      .metadata(this.name, 'stable-diffusion-inpaint', startTime)
      .build();
  }

  private async handleSkyReplace(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      request.inputImage!
    );
    const imageBlob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });

    const backgroundPrompt =
      (request.parameters?.backgroundPrompt as string) ||
      request.prompt ||
      'blue sky with white clouds, golden hour lighting';
    const foregroundPrompt =
      (request.parameters?.foregroundPrompt as string) ||
      'natural lighting, realistic';

    const formData = new FormData();
    formData.append('subject_image', imageBlob, 'image.png');
    formData.append('background_prompt', backgroundPrompt);
    formData.append('foreground_prompt', foregroundPrompt);
    formData.append('output_format', 'png');

    const response = await fetch(
      `${this.baseUrl}/stable-image/edit/replace-background-and-relight`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          Accept: 'image/*',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({ base64, mimeType: 'image/png', format: 'png' }),
      ])
      .usage({ units: 1, estimatedCost: 0.04 })
      .metadata(this.name, 'stable-image-sky-replace', startTime)
      .build();
  }

  private async handleAutoEnhance(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      request.inputImage!
    );
    const imageBlob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });

    const formData = new FormData();
    formData.append('image', imageBlob, 'image.png');
    formData.append('output_format', 'png');
    if (request.prompt) formData.append('prompt', request.prompt);

    const response = await fetch(
      `${this.baseUrl}/stable-image/upscale/conservative`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          Accept: 'image/*',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({ base64, mimeType: 'image/png', format: 'png' }),
      ])
      .usage({ units: 1, estimatedCost: 0.025 })
      .metadata(this.name, 'stable-image-auto-enhance', startTime)
      .build();
  }

  private async handleOutpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const formData = new FormData();
    formData.append('output_format', 'png');

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      request.inputImage!
    );
    formData.append(
      'image',
      new Blob([imageBuffer as unknown as BlobPart], { type: mimeType }),
      'image.png'
    );

    if (request.prompt) formData.append('prompt', request.prompt);

    const direction = (request.parameters?.direction as string) || 'all';
    const pixels = 256;

    if (direction === 'all' || direction === 'left')
      formData.append('left', String(pixels));
    if (direction === 'all' || direction === 'right')
      formData.append('right', String(pixels));
    if (direction === 'all' || direction === 'up')
      formData.append('up', String(pixels));
    if (direction === 'all' || direction === 'down')
      formData.append('down', String(pixels));

    const response = await fetch(`${this.baseUrl}/stable-image/edit/outpaint`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        Accept: 'image/*',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorText,
        request.model,
        startTime
      );
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString('base64');

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({ base64, mimeType: 'image/png', format: 'png' }),
      ])
      .usage({ units: 1, estimatedCost: 0.04 })
      .metadata(this.name, 'stable-diffusion-outpaint', startTime)
      .build();
  }
}
