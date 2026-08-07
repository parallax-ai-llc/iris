/**
 * Parallax Iris - Fal.ai Provider Adapter
 * Supports: text-to-image, text-to-video (various models via Fal)
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

/**
 * Queue poll ceiling for video generation. Seedance 2.5 can be asked for a
 * single 30-second pass, which routinely outruns a 10-minute budget.
 */
const FAL_VIDEO_POLL_MAX_WAIT_MS = 30 * 60 * 1000;

/** fal caps Seedance 2.5 reference-to-video at 50 mixed references per request. */
const FAL_MAX_VIDEO_REFERENCES = 50;

export class FalAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'fal';
  protected baseUrl = 'https://fal.run';

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'text-to-video',
    'image-to-video',
    'reference-to-video',
    'relight',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'fal-ai/flux/schnell',
      name: 'FLUX Schnell',
      provider: 'fal',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.003,
        currency: 'USD',
      },
      defaultParameters: {
        numOutputs: 1,
      },
    },
    {
      id: 'fal-ai/flux-pro',
      name: 'FLUX Pro',
      provider: 'fal',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'jpeg'],
        supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
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
    // Minimax/Hailuo video models via fal.ai
    {
      id: 'fal-ai/minimax/hailuo-02',
      name: 'Hailuo 02',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 10,
        supportedDurations: [6, 10],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.045, // $0.045 per second at 768p
        currency: 'USD',
      },
      defaultParameters: {
        duration: 6,
      },
    },
    {
      id: 'fal-ai/minimax/hailuo-02/1080p',
      name: 'Hailuo 02 (1080p)',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 6,
        supportedDurations: [6], // 1080p only supports 6s
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.06,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 6,
      },
    },
    // Pika video models via fal.ai
    {
      id: 'fal-ai/pika/v2.2',
      name: 'Pika 2.2',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 5,
        supportedDurations: [3, 5],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.05,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 3,
      },
    },
    {
      id: 'pika-2.0',
      name: 'Pika 2.0',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 5,
        supportedDurations: [3, 5],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 3,
      },
    },
    // Seedance (ByteDance) video models via fal.ai
    {
      id: 'seedance-2.5',
      name: 'Seedance 2.5',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video', 'reference-to-video'],
      inputTypes: ['text', 'image', 'video', 'audio'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 30,
        supportedDurations: [4, 5, 6, 8, 10, 15, 20, 25, 30],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        // ~$0.473/s at the default 16:9 720p output (fal bills per token).
        outputCost: 0.473,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 5,
      },
    },
    {
      id: 'seedance-2.0',
      name: 'Seedance 2.0',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 15,
        supportedDurations: [4, 5, 6, 8, 10, 15],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.3,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 5,
      },
    },
    {
      id: 'seedance-2.0-fast',
      name: 'Seedance 2.0 Fast',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 15,
        supportedDurations: [4, 5, 6, 8, 10, 15],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.24,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 5,
      },
    },
    {
      id: 'hailuo-video',
      name: 'Hailuo Video',
      provider: 'fal',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 6,
        supportedDurations: [6],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.045,
        currency: 'USD',
      },
      defaultParameters: {
        duration: 6,
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Fal.ai API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // Fal.ai doesn't have a dedicated ping endpoint
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
        case 'text-to-video':
          return this.textToVideo(request, startTime);
        case 'image-to-video':
          return this.imageToVideo(request, startTime);
        case 'reference-to-video':
          return this.referenceToVideo(request, startTime);
        case 'relight':
          return this.handleRelight(request, startTime);
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
    const model = request.model || 'fal-ai/flux/schnell';

    try {
      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image_size: parameters.aspectRatio || 'square_hd',
          num_images: parameters.numOutputs || 1,
          enable_safety_checker: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string }).detail || 'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        images: Array<{ url: string; width: number; height: number }>;
      };

      const outputs = (data.images || []).map(img =>
        OutputBuilder.image({
          url: img.url,
          width: img.width,
          height: img.height,
        })
      );

      const modelInfo = this.getModelInfo(model);
      const cost = CostCalculator.forImages(
        modelInfo?.pricing?.outputCost ?? 0.003,
        outputs.length
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ units: outputs.length, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
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
    const model = request.model || 'fal-ai/flux/schnell';

    // Validate input
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      // Prepare image URL for Fal.ai
      const imageUrl = mediaInputToUrl(inputImage!);

      // Use flux-dev/canny or flux-dev/depth for image-to-image
      // For basic img2img, we use the redux model
      const img2imgModel = model.includes('pro')
        ? 'fal-ai/flux-pro/redux'
        : 'fal-ai/flux/schnell/redux';

      const response = await fetch(`${this.baseUrl}/${img2imgModel}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt || 'Generate a variation of this image',
          image_url: imageUrl,
          image_size: parameters.aspectRatio || 'square_hd',
          num_images: parameters.numOutputs || 1,
          strength: parameters.strength || 0.75,
          enable_safety_checker: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string }).detail ||
            JSON.stringify(errorData),
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        images: Array<{ url: string; width: number; height: number }>;
      };

      const outputs = (data.images || []).map(img =>
        OutputBuilder.image({
          url: img.url,
          width: img.width,
          height: img.height,
        })
      );

      const modelInfo = this.getModelInfo(model);
      const cost = CostCalculator.forImages(
        modelInfo?.pricing?.outputCost ?? 0.003,
        outputs.length
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ units: outputs.length, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  private async textToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const model = request.model || 'fal-ai/minimax/hailuo-02';

    // Validate prompt
    const validationError = InputValidator.requirePrompt(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      // Map model ID to fal.ai endpoint
      const endpoint = this.mapModelToEndpoint(model);
      const input = this.buildVideoInput(model, prompt!, parameters);

      // Submit request to fal.ai queue
      const response = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Fal.ai] API error:', errorData);
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; message?: string }).detail ||
            (errorData as { message?: string }).message ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const queueData = (await response.json()) as {
        request_id: string;
        status_url?: string;
        response_url?: string;
      };

      // Use URLs provided by fal.ai, fallback to constructed URLs if not provided
      const statusUrl =
        queueData.status_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}/status`;
      const responseUrl =
        queueData.response_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}`;

      // Poll for completion
      const result = await this.pollFalQueue<{ video: { url: string } }>(
        statusUrl,
        responseUrl,
        { interval: 5000, maxWait: FAL_VIDEO_POLL_MAX_WAIT_MS }
      );

      if (!result.video?.url) {
        return ResponseBuilder.emptyResponse(
          'video',
          this.name,
          request.model,
          startTime,
          result
        );
      }

      const duration = (parameters.duration as number) ?? 6;
      const outputs = [
        OutputBuilder.video({
          url: result.video.url,
          duration,
        }),
      ];

      const modelInfo = this.getModelInfo(model);
      const cost = CostCalculator.forVideo(
        modelInfo?.pricing?.outputCost ?? 0.045,
        duration
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ durationSeconds: duration, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      console.error('[Fal.ai] textToVideo error:', error);
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  private async imageToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const {
      prompt = '',
      inputImage,
      inputImages = [],
      parameters = {},
    } = request;
    const model = request.model || 'fal-ai/minimax/hailuo-02';

    // Support both inputImage (single) and inputImages (array)
    // For Seedance first/last frame: inputImages[0] = start frame, inputImages[1] = end frame (optional)
    const startFrameInput = inputImage || inputImages[0];
    const endFrameInput = inputImages[1];

    if (!startFrameInput) {
      return ResponseBuilder.missingInput(
        'Start Frame Image',
        'image-to-video',
        this.name,
        request.model,
        startTime
      );
    }

    try {
      // Map model ID to fal.ai endpoint
      const endpoint = this.mapModelToEndpoint(model, 'image-to-video');

      // Get image URLs (start + optional end frame)
      const imageUrl = mediaInputToUrl(startFrameInput);
      const endImageUrl = endFrameInput
        ? mediaInputToUrl(endFrameInput)
        : undefined;
      const input = this.buildVideoInput(
        model,
        prompt,
        parameters,
        imageUrl,
        endImageUrl
      );

      // Submit request to fal.ai queue
      const response = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Fal.ai] API error:', errorData);
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; message?: string }).detail ||
            (errorData as { message?: string }).message ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const queueData = (await response.json()) as {
        request_id: string;
        status_url?: string;
        response_url?: string;
      };

      // Use URLs provided by fal.ai, fallback to constructed URLs if not provided
      const statusUrl =
        queueData.status_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}/status`;
      const responseUrl =
        queueData.response_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}`;

      // Poll for completion
      const result = await this.pollFalQueue<{ video: { url: string } }>(
        statusUrl,
        responseUrl,
        { interval: 5000, maxWait: FAL_VIDEO_POLL_MAX_WAIT_MS }
      );

      if (!result.video?.url) {
        return ResponseBuilder.emptyResponse(
          'video',
          this.name,
          request.model,
          startTime,
          result
        );
      }

      const duration = (parameters.duration as number) ?? 6;
      const outputs = [
        OutputBuilder.video({
          url: result.video.url,
          duration,
        }),
      ];

      const modelInfo = this.getModelInfo(model);
      const cost = CostCalculator.forVideo(
        modelInfo?.pricing?.outputCost ?? 0.045,
        duration
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ durationSeconds: duration, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      console.error('[Fal.ai] imageToVideo error:', error);
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Reference-to-video: compose one clip from mixed image/video/audio references.
   *
   * Unlike image-to-video there is no single "start frame" — every reference is
   * addressed positionally from the prompt ([Image1], [Video1], [Audio1]), so the
   * per-type ordering the caller supplies is preserved verbatim.
   */
  private async referenceToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const {
      prompt = '',
      inputImage,
      inputImages = [],
      inputVideo,
      inputVideos = [],
      inputAudio,
      inputAudios = [],
      parameters = {},
    } = request;
    const model = request.model || 'seedance-2.5';

    if (!this.supportsReferenceToVideo(model)) {
      return ResponseBuilder.unsupportedCapability(
        'reference-to-video',
        this.name,
        request.model,
        startTime
      );
    }

    const validationError = InputValidator.requirePrompt(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    // Singular fields are folded in first so a caller that only sets
    // inputImage/inputVideo/inputAudio still lands as [Image1]/[Video1]/[Audio1].
    // Explicit per-type default MIME so a raw-base64 reference becomes a data
    // URI fal can actually read — the shared default is image/png.
    const imageUrls = [...(inputImage ? [inputImage] : []), ...inputImages].map(
      input => mediaInputToUrl(input, 'image/png')
    );
    const videoUrls = [...(inputVideo ? [inputVideo] : []), ...inputVideos].map(
      input => mediaInputToUrl(input, 'video/mp4')
    );
    const audioUrls = [...(inputAudio ? [inputAudio] : []), ...inputAudios].map(
      input => mediaInputToUrl(input, 'audio/mpeg')
    );

    const totalReferences =
      imageUrls.length + videoUrls.length + audioUrls.length;
    if (totalReferences === 0) {
      return ResponseBuilder.missingInput(
        'Image, video, or audio reference',
        'reference-to-video',
        this.name,
        request.model,
        startTime
      );
    }
    // Truncating would silently desync the prompt's [ImageN] indices from the
    // arrays, so reject instead.
    if (totalReferences > FAL_MAX_VIDEO_REFERENCES) {
      return ResponseBuilder.validationError(
        'references',
        `Seedance 2.5 accepts at most ${FAL_MAX_VIDEO_REFERENCES} references, got ${totalReferences}`,
        this.name,
        request.model,
        startTime
      );
    }

    try {
      const endpoint = this.mapModelToEndpoint(model, 'reference-to-video');
      const input = this.buildVideoInput(
        model,
        prompt,
        parameters,
        undefined,
        undefined,
        { imageUrls, videoUrls, audioUrls }
      );

      const response = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Fal.ai] API error:', errorData);
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; message?: string }).detail ||
            (errorData as { message?: string }).message ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const queueData = (await response.json()) as {
        request_id: string;
        status_url?: string;
        response_url?: string;
      };

      const statusUrl =
        queueData.status_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}/status`;
      const responseUrl =
        queueData.response_url ||
        `https://queue.fal.run/${endpoint}/requests/${queueData.request_id}`;

      const result = await this.pollFalQueue<{ video: { url: string } }>(
        statusUrl,
        responseUrl,
        { interval: 5000, maxWait: FAL_VIDEO_POLL_MAX_WAIT_MS }
      );

      if (!result.video?.url) {
        return ResponseBuilder.emptyResponse(
          'video',
          this.name,
          request.model,
          startTime,
          result
        );
      }

      const duration = (parameters.duration as number) ?? 6;
      const outputs = [
        OutputBuilder.video({
          url: result.video.url,
          duration,
        }),
      ];

      const modelInfo = this.getModelInfo(model);
      // fal applies a 0.6x multiplier when video references are present.
      const baseRate = modelInfo?.pricing?.outputCost ?? 0.473;
      const cost = CostCalculator.forVideo(
        videoUrls.length > 0 ? baseRate * 0.6 : baseRate,
        duration
      );

      return ResponseBuilder.success()
        .outputs(outputs)
        .usage({ durationSeconds: duration, estimatedCost: cost })
        .metadata(this.name, request.model, startTime)
        .build();
    } catch (error) {
      console.error('[Fal.ai] referenceToVideo error:', error);
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Map model ID to fal.ai endpoint.
   *
   * `mode` picks the endpoint suffix. 'reference-to-video' is Seedance 2.5 only —
   * no other fal video model exposes it, so callers must gate on
   * `supportsReferenceToVideo()` before asking for it.
   */
  private mapModelToEndpoint(
    model: string,
    mode: 'text-to-video' | 'image-to-video' | 'reference-to-video' = 'text-to-video'
  ): string {
    const isImageToVideo = mode === 'image-to-video';

    // Direct fal.ai model IDs
    if (model.startsWith('fal-ai/')) {
      return isImageToVideo ? `${model}/image-to-video` : model;
    }

    // Seedance endpoints include the full path already
    if (model === 'seedance-2.5') {
      // 2.5 is the only Seedance version with a reference-to-video endpoint.
      return `bytedance/seedance-2.5/${mode}`;
    }
    if (model === 'seedance-2.0') {
      return isImageToVideo
        ? 'bytedance/seedance-2.0/image-to-video'
        : 'bytedance/seedance-2.0/text-to-video';
    }
    if (model === 'seedance-2.0-fast') {
      // fal slug uses '/fast/' as a subpath, not '-fast' on the version segment
      return isImageToVideo
        ? 'bytedance/seedance-2.0/fast/image-to-video'
        : 'bytedance/seedance-2.0/fast/text-to-video';
    }

    // Map known model IDs to fal endpoints
    // Note: Pika is no longer supported on fal.ai as of 2026
    const modelMap: Record<string, string> = {
      'hailuo-video': 'fal-ai/minimax/hailuo-02',
    };

    const baseEndpoint = modelMap[model] || 'fal-ai/minimax/hailuo-02';
    return isImageToVideo ? `${baseEndpoint}/image-to-video` : baseEndpoint;
  }

  /** Models exposing fal's reference-to-video endpoint (mixed image/video/audio refs). */
  private supportsReferenceToVideo(model: string): boolean {
    return model === 'seedance-2.5';
  }

  /**
   * Build video input parameters based on model
   */
  private buildVideoInput(
    model: string,
    prompt: string,
    parameters: Record<string, unknown>,
    imageUrl?: string,
    endImageUrl?: string,
    references?: {
      imageUrls?: string[];
      videoUrls?: string[];
      audioUrls?: string[];
    }
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { prompt };

    // Add image for image-to-video
    if (imageUrl) {
      input.image_url = imageUrl;
    }

    // reference-to-video takes parallel arrays; the prompt addresses them
    // positionally as [Image1], [Video1], [Audio1], so order matters.
    if (references?.imageUrls?.length) {
      input.image_urls = references.imageUrls;
    }
    if (references?.videoUrls?.length) {
      input.video_urls = references.videoUrls;
    }
    if (references?.audioUrls?.length) {
      input.audio_urls = references.audioUrls;
    }

    // Map aspect ratio
    if (parameters.aspectRatio) {
      const ar = parameters.aspectRatio as string;
      if (model.includes('hailuo') || model.includes('minimax')) {
        // Hailuo uses specific aspect ratio format
        if (ar === '16:9') input.aspect_ratio = '16:9';
        else if (ar === '9:16') input.aspect_ratio = '9:16';
        else input.aspect_ratio = '1:1';
      } else {
        input.aspect_ratio = ar;
      }
    }

    // Seedance-specific: resolution param (default 720p), end frame, and string duration
    if (model.includes('seedance')) {
      input.resolution = parameters.resolution || '720p';
      // Duration as string for Seedance
      if (parameters.duration) {
        input.duration = String(parameters.duration);
      }
      if (parameters.seed !== undefined) {
        input.seed = parameters.seed;
      }
      // fal defaults generate_audio to true; only override when asked.
      if (parameters.generateAudio !== undefined) {
        input.generate_audio = parameters.generateAudio;
      }
      // Seedance image-to-video supports end_image_url for A-to-B transition
      if (endImageUrl) {
        input.end_image_url = endImageUrl;
      }
    } else if (parameters.duration) {
      input.duration = parameters.duration;
    }

    return input;
  }

  /**
   * Poll fal.ai queue for result
   * @param statusUrl - The status URL provided by fal.ai queue response
   * @param responseUrl - The response URL provided by fal.ai queue response
   * @param options - Polling options
   */
  private async pollFalQueue<T>(
    statusUrl: string,
    responseUrl: string,
    options: { interval: number; maxWait: number }
  ): Promise<T> {
    const startTime = Date.now();

    while (Date.now() - startTime < options.maxWait) {
      await new Promise(resolve => setTimeout(resolve, options.interval));

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Key ${this.credentials!.apiKey}`,
        },
      });

      // Check response status before parsing JSON
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error(
          `[Fal.ai] Poll status error: ${statusResponse.status} - ${errorText}`
        );
        throw new Error(
          `Fal.ai polling error: ${statusResponse.status} - ${errorText.substring(0, 200)}`
        );
      }

      let statusData: {
        status: string;
        error?: string;
        response_url?: string;
      };

      try {
        statusData = await statusResponse.json();
      } catch (parseError) {
        const text = await statusResponse
          .clone()
          .text()
          .catch(() => 'Unable to read response');
        console.error(
          `[Fal.ai] Failed to parse status response:`,
          text.substring(0, 200)
        );
        throw new Error(
          `Fal.ai returned invalid JSON response: ${text.substring(0, 100)}`
        );
      }

      if (statusData.status === 'COMPLETED') {
        // Fetch the result using the response URL provided by fal.ai
        const resultResponse = await fetch(responseUrl, {
          headers: {
            Authorization: `Key ${this.credentials!.apiKey}`,
          },
        });

        // Check result response status before parsing JSON
        if (!resultResponse.ok) {
          const errorText = await resultResponse.text();
          console.error(
            `[Fal.ai] Result fetch error: ${resultResponse.status} - ${errorText}`
          );
          throw new Error(
            `Fal.ai result fetch error: ${resultResponse.status} - ${errorText.substring(0, 200)}`
          );
        }

        try {
          return (await resultResponse.json()) as T;
        } catch (parseError) {
          const text = await resultResponse
            .clone()
            .text()
            .catch(() => 'Unable to read response');
          console.error(
            `[Fal.ai] Failed to parse result response:`,
            text.substring(0, 200)
          );
          throw new Error(
            `Fal.ai returned invalid JSON result: ${text.substring(0, 100)}`
          );
        }
      } else if (statusData.status === 'FAILED') {
        throw new Error(statusData.error || 'Video generation failed');
      }
    }

    throw new Error('Video generation timed out');
  }

  private async handleRelight(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const imageUrl = await mediaInputToUrl(
      request.inputImage!,
      `fal-relight-${Date.now()}`
    );
    const prompt = request.prompt || 'soft natural lighting from the left';

    const response = await fetch(`${this.baseUrl}/fal-ai/iclight-v2`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt,
        num_inference_steps: 28,
        guidance_scale: 5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        JSON.stringify(errorData),
        request.model,
        startTime
      );
    }

    const data = await response.json();
    const images = data.images || [];
    if (!images.length) {
      return ResponseBuilder.apiError(
        this.name,
        500,
        'No images returned from IC-Light',
        request.model,
        startTime
      );
    }

    const outputUrl = images[0].url;

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.image({
          url: outputUrl,
          mimeType: 'image/png',
          format: 'png',
        }),
      ])
      .usage({ units: 1, estimatedCost: 0.03 })
      .metadata(this.name, 'fal-ai/iclight-v2', startTime)
      .build();
  }
}
