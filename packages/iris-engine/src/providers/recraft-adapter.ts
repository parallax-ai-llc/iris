/**
 * Parallax Iris - Recraft Provider Adapter
 * Supports: text-to-image, image-to-image, inpaint, image-upscale, background-remove
 * API Docs: https://www.recraft.ai/docs/api-reference/usage
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
import { mediaInputToBuffer } from './media-utils.js';

export class RecraftAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'recraft';
  protected baseUrl = 'https://external.api.recraft.ai/v1';

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'inpaint',
    'image-upscale',
    'background-remove',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'recraftv3',
      name: 'Recraft V3',
      provider: 'recraft',
      capabilities: ['text-to-image', 'image-to-image', 'inpaint'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 4096,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '4:3',
          '3:4',
          '3:2',
          '2:3',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: { style: 'realistic_image' },
    },
    {
      id: 'recraftv2',
      name: 'Recraft V2',
      provider: 'recraft',
      capabilities: ['text-to-image'],
      inputTypes: ['text'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 4096,
        supportedFormats: ['png', 'jpeg', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.02,
        currency: 'USD',
      },
      defaultParameters: { style: 'realistic_image' },
    },
    {
      id: 'recraft-crisp-upscale',
      name: 'Recraft Crisp Upscale',
      provider: 'recraft',
      capabilities: ['image-upscale'],
      inputTypes: ['image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 4096,
        supportedFormats: ['png', 'jpeg', 'webp'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.02,
        currency: 'USD',
      },
    },
    {
      id: 'recraft-creative-upscale',
      name: 'Recraft Creative Upscale',
      provider: 'recraft',
      capabilities: ['image-upscale'],
      inputTypes: ['image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 4096,
        supportedFormats: ['png', 'jpeg', 'webp'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
    },
    {
      id: 'recraft-remove-background',
      name: 'Recraft Remove Background',
      provider: 'recraft',
      capabilities: ['background-remove'],
      inputTypes: ['image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 4096,
        supportedFormats: ['png', 'jpeg', 'webp'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.02,
        currency: 'USD',
      },
    },
  ];

  /**
   * Supported Recraft styles for reference:
   * - realistic_image, digital_illustration, vector_illustration, icon
   * - realistic_image/b_and_w, realistic_image/hard_flash, realistic_image/hdr
   * - realistic_image/natural_light, realistic_image/studio_portrait
   * - digital_illustration/pixel_art, digital_illustration/hand_drawn
   * - digital_illustration/grain, digital_illustration/infantile_sketch
   * - digital_illustration/2d_art_poster, digital_illustration/handmade_3d
   * - digital_illustration/hand_drawn_outline, digital_illustration/engraving_color
   * - digital_illustration/2d_art_poster_2
   */

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Recraft API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
    });
    if (!response.ok) {
      throw new Error('Failed to connect to Recraft API');
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
          return this.inpaint(request, startTime);
        case 'image-upscale':
          return this.imageUpscale(request, startTime);
        case 'background-remove':
          return this.removeBackground(request, startTime);
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

  private mapAspectRatioToSize(aspectRatio?: string): string {
    const mapping: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1365x1024',
      '9:16': '1024x1365',
      '4:3': '1365x1024',
      '3:4': '1024x1365',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
      '21:9': '1820x780',
    };
    return mapping[aspectRatio || '1:1'] || '1024x1024';
  }

  private async textToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, negativePrompt, parameters = {} } = request;
    const model = request.model || 'recraftv3';

    const style = (parameters.style as string) || 'realistic_image';
    const size = this.mapAspectRatioToSize(parameters.aspectRatio);

    const requestBody: Record<string, unknown> = {
      prompt: prompt || '',
      model,
      style,
      size,
      n: parameters.numOutputs || 1,
      response_format: 'url',
    };

    if (negativePrompt) requestBody.negative_prompt = negativePrompt;

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
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

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    const outputs: GeneratedOutput[] = (data.data || [])
      .filter(item => item.url || item.b64_json)
      .map(item =>
        OutputBuilder.image({ url: item.url, base64: item.b64_json })
      );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const modelInfo = this.getModelInfo(model);
    const numImages = (parameters.numOutputs as number) || 1;
    const estimatedCost = CostCalculator.forImages(
      modelInfo?.pricing?.outputCost ?? 0.04,
      numImages
    );

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, negativePrompt, parameters = {} } = request;

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    const style = (parameters.style as string) || 'realistic_image';
    const strength = (parameters.strength as number) ?? 0.5;

    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    formData.append('image', blob, `image.${mimeType.split('/')[1] || 'png'}`);
    formData.append('prompt', prompt || 'Transform this image');
    formData.append('strength', String(strength));
    formData.append('style', style);
    formData.append('model', 'recraftv3');
    formData.append('response_format', 'url');
    formData.append('n', String(parameters.numOutputs || 1));

    if (negativePrompt) formData.append('negative_prompt', negativePrompt);

    const response = await fetch(`${this.baseUrl}/images/imageToImage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
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

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    const outputs: GeneratedOutput[] = (data.data || [])
      .filter(item => item.url || item.b64_json)
      .map(item =>
        OutputBuilder.image({ url: item.url, base64: item.b64_json })
      );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'edited image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const numImages = (parameters.numOutputs as number) || 1;
    const estimatedCost = CostCalculator.forImages(0.04, numImages);

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async inpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const {
      prompt,
      inputImage,
      maskImage,
      negativePrompt,
      parameters = {},
    } = request;

    const imageValidation = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (imageValidation) return imageValidation;

    if (!maskImage) {
      return ResponseBuilder.missingInput(
        'mask image',
        'inpaint',
        this.name,
        request.model,
        startTime
      );
    }

    const { buffer: imageBuffer, mimeType: imageMimeType } =
      await mediaInputToBuffer(inputImage!);
    const { buffer: maskBuffer, mimeType: maskMimeType } =
      await mediaInputToBuffer(maskImage);

    const style = (parameters.style as string) || 'realistic_image';

    const formData = new FormData();
    const imageBlob = new Blob([imageBuffer as unknown as BlobPart], {
      type: imageMimeType,
    });
    const maskBlob = new Blob([maskBuffer as unknown as BlobPart], {
      type: maskMimeType,
    });

    formData.append(
      'image',
      imageBlob,
      `image.${imageMimeType.split('/')[1] || 'png'}`
    );
    formData.append(
      'mask',
      maskBlob,
      `mask.${maskMimeType.split('/')[1] || 'png'}`
    );
    formData.append('prompt', prompt || 'Fill this region');
    formData.append('style', style);
    formData.append('model', 'recraftv3');
    formData.append('response_format', 'url');
    formData.append('n', String(parameters.numOutputs || 1));

    if (negativePrompt) formData.append('negative_prompt', negativePrompt);

    const response = await fetch(`${this.baseUrl}/images/inpaint`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
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

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    const outputs: GeneratedOutput[] = (data.data || [])
      .filter(item => item.url || item.b64_json)
      .map(item =>
        OutputBuilder.image({ url: item.url, base64: item.b64_json })
      );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'inpainted image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const numImages = (parameters.numOutputs as number) || 1;
    const estimatedCost = CostCalculator.forImages(0.04, numImages);

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageUpscale(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputImage, parameters = {} } = request;

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    // Determine upscale type: crisp (default) or creative
    const upscaleType = (parameters.upscaleType as string) || 'crisp';
    const endpoint =
      upscaleType === 'creative'
        ? '/images/creativeUpscale'
        : '/images/crispUpscale';

    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    formData.append('file', blob, `image.${mimeType.split('/')[1] || 'png'}`);
    formData.append('response_format', 'url');

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
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

    const data = (await response.json()) as {
      image: { url?: string; b64_json?: string };
    };

    if (!data.image?.url && !data.image?.b64_json) {
      return ResponseBuilder.emptyResponse(
        'upscaled image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const outputs: GeneratedOutput[] = [
      OutputBuilder.image({ url: data.image.url, base64: data.image.b64_json }),
    ];

    const estimatedCost = upscaleType === 'creative' ? 0.04 : 0.02;

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: 1, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model || 'recraft-upscale', startTime)
      .build();
  }

  private async removeBackground(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputImage } = request;

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    formData.append('file', blob, `image.${mimeType.split('/')[1] || 'png'}`);
    formData.append('response_format', 'url');

    const response = await fetch(`${this.baseUrl}/images/removeBackground`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
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

    const data = (await response.json()) as {
      image: { url?: string; b64_json?: string };
    };

    if (!data.image?.url && !data.image?.b64_json) {
      return ResponseBuilder.emptyResponse(
        'background removed image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const outputs: GeneratedOutput[] = [
      OutputBuilder.image({ url: data.image.url, base64: data.image.b64_json }),
    ];

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: 1, estimatedCost: 0.02 })
      .rawResponse(data)
      .metadata(
        this.name,
        request.model || 'recraft-remove-background',
        startTime
      )
      .build();
  }
}
