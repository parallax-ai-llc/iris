/**
 * Parallax Iris - Replicate Provider Adapter
 * Supports: text-to-image, text-to-video (various models)
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
import { mediaInputToUrl } from './media-utils.js';
import {
  REPLICATE_MODELS,
  MODELS_WITHOUT_END_IMAGE_SUPPORT,
} from './replicate-models.js';
import {
  mapImageModelToReplicatePath,
  mapModelToReplicatePath,
  buildVideoInput,
  buildKlingImageToVideoInput,
  buildVideoUpscaleInput,
} from './replicate-utils.js';

export class ReplicateAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'replicate';
  protected baseUrl = 'https://api.replicate.com/v1';

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'text-to-video',
    'image-to-video',
    'face-swap',
    'inpaint',
    'video-inpaint',
    'video-upscale',
    'motion-control',
  ];

  readonly models: ModelInfo[] = REPLICATE_MODELS;

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Replicate API key is required');
    }
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to connect to Replicate API');
    }
  }

  /**
   * Get the latest version of a model
   * Required for some models that don't support the /models/{owner}/{model}/predictions endpoint
   */
  private async getLatestModelVersion(modelPath: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/models/${modelPath}`, {
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get model info for ${modelPath}`);
    }

    const data = (await response.json()) as { latest_version?: { id: string } };
    if (!data.latest_version?.id) {
      throw new Error(`No version found for model ${modelPath}`);
    }

    return data.latest_version.id;
  }

  /**
   * Create a prediction using a specific model version
   */
  private async createPredictionWithVersion(
    version: string,
    input: Record<string, unknown>
  ): Promise<{
    id: string;
    urls: { get: string };
    status: string;
    output?: unknown;
  }> {
    const response = await fetch(`${this.baseUrl}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ version, input }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail ||
          (errorData as { error?: string }).error ||
          `Replicate API error: ${response.status}`
      );
    }

    return response.json() as Promise<{
      id: string;
      urls: { get: string };
      status: string;
      output?: unknown;
    }>;
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
        case 'face-swap':
          return this.faceSwap(request, startTime);
        case 'inpaint':
          return this.inpaint(request, startTime);
        case 'video-inpaint':
          return this.videoInpaint(request, startTime);
        case 'motion-control':
          return this.motionControl(request, startTime);
        case 'video-upscale':
          return this.videoUpscale(request, startTime);
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
    const rawModel = request.model || 'black-forest-labs/flux-schnell';
    const model = mapImageModelToReplicatePath(rawModel);

    try {
      const endpoint = model.includes('/')
        ? `${this.baseUrl}/models/${model}/predictions`
        : `${this.baseUrl}/predictions`;

      const body: Record<string, unknown> = {
        input: {
          prompt,
          num_outputs: parameters.numOutputs || 1,
          aspect_ratio: parameters.aspectRatio || '1:1',
        },
      };

      if (!model.includes('/')) {
        body.version = model;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify(body),
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
        id: string;
        urls: { get: string };
      };

      // Poll for completion
      const result = await this.pollForCompletion<{ output: string[] }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Generation failed',
            };
          }
          return { completed: false };
        },
        { interval: 2000, maxWait: 120000 }
      );

      const outputs = result.output.map(url => OutputBuilder.image({ url }));
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
    const rawModel = request.model || 'black-forest-labs/flux-schnell';
    const model = mapImageModelToReplicatePath(rawModel);

    // Validate input
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      const imageUrl = mediaInputToUrl(inputImage!);
      const img2imgModel = model.includes('flux')
        ? 'black-forest-labs/flux-canny-dev'
        : model;
      const endpoint = `${this.baseUrl}/models/${img2imgModel}/predictions`;

      const body: Record<string, unknown> = {
        input: {
          prompt: prompt || 'Generate a variation of this image',
          control_image: imageUrl,
          num_outputs: parameters.numOutputs || 1,
          aspect_ratio: parameters.aspectRatio || '1:1',
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials!.apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify(body),
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
        id: string;
        urls: { get: string };
      };

      // Poll for completion
      const result = await this.pollForCompletion<{ output: string[] }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Generation failed',
            };
          }
          return { completed: false };
        },
        { interval: 2000, maxWait: 120000 }
      );

      const outputs = result.output.map(url => OutputBuilder.image({ url }));
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
    const { prompt = '', parameters = {} } = request;
    const model = request.model || 'openai/sora-2';

    // Validate prompt
    const validationError = InputValidator.requirePrompt(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    try {
      const replicateModel = mapModelToReplicatePath(model);
      const input = buildVideoInput(model, prompt, parameters);

      const response = await fetch(
        `${this.baseUrl}/models/${replicateModel}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string | string[];
      };

      // If already completed
      if (data.status === 'succeeded' && data.output) {
        return this.buildVideoResponse(data.output, model, request, startTime);
      }

      // Poll for completion
      const result = await this.pollForCompletion<{
        output: string | string[];
      }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string | string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Video generation failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      return this.buildVideoResponse(result.output, model, request, startTime);
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Build video response from output
   */
  private buildVideoResponse(
    output: string | string[],
    model: string,
    request: AIRequest,
    startTime: number
  ): AIResponse {
    const urls = Array.isArray(output) ? output : [output];
    const duration = (request.parameters?.duration as number) ?? 5;

    const outputs: GeneratedOutput[] = urls.map(url =>
      OutputBuilder.video({ url, duration })
    );

    const modelInfo = this.getModelInfo(model);
    let cost = 0;

    if (modelInfo?.pricing) {
      if (modelInfo.pricing.unit === 'second') {
        cost = CostCalculator.forVideo(modelInfo.pricing.outputCost, duration);
      } else {
        cost = CostCalculator.forImages(
          modelInfo.pricing.outputCost,
          outputs.length
        );
      }
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ durationSeconds: duration, estimatedCost: cost })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  /**
   * Image-to-Video generation (Kling first/last frame)
   * Supports start frame (required) and end frame (optional) for Kling models
   *
   * Note: end_image (last frame) is only supported by certain models:
   * - kwaivgi/kling-v2.1 (requires pro mode)
   * - kwaivgi/kling-v1.6-pro
   * - kwaivgi/kling-v2.6 does NOT support end_image
   */
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
    let model = request.model || 'kling-2.0';

    // Support both inputImage (single) and inputImages (array)
    // For Kling first/last frame: inputImages[0] = start frame, inputImages[1] = end frame (optional)
    const startFrameInput = inputImage || inputImages[0];
    const endFrameInput = inputImages[1]; // Optional end frame (tail image)

    if (!startFrameInput) {
      return ResponseBuilder.missingInput(
        'Start Frame Image',
        'image-to-video',
        this.name,
        request.model,
        startTime
      );
    }

    const startFrameUrl = mediaInputToUrl(startFrameInput);
    const endFrameUrl = endFrameInput
      ? mediaInputToUrl(endFrameInput)
      : undefined;

    if (endFrameUrl && MODELS_WITHOUT_END_IMAGE_SUPPORT.includes(model)) {
      // Route to kling-2.1 which supports end_image with pro mode
      model = 'kling-2.1';
    }

    try {
      const replicateModel = mapModelToReplicatePath(model);
      const input = buildKlingImageToVideoInput(
        model,
        prompt,
        parameters,
        startFrameUrl,
        endFrameUrl
      );

      const response = await fetch(
        `${this.baseUrl}/models/${replicateModel}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string | string[];
      };

      if (data.status === 'succeeded' && data.output) {
        return this.buildVideoResponse(data.output, model, request, startTime);
      }

      const result = await this.pollForCompletion<{
        output: string | string[];
      }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string | string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Video generation failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      return this.buildVideoResponse(result.output, model, request, startTime);
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Image Inpaint using FLUX Fill Pro
   * Fills/edits masked regions of an image based on prompt
   *
   * Mask format: White (255) = area to inpaint, Black (0) = area to keep
   *
   * @see https://replicate.com/black-forest-labs/flux-fill-pro
   */
  private async inpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, maskImage, parameters = {} } = request;
    const model = request.model || 'black-forest-labs/flux-fill-pro';

    // Validate required inputs
    const imageError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (imageError) return imageError;

    const maskError = InputValidator.requireMask(request, this.name, startTime);
    if (maskError) return maskError;

    if (!prompt) {
      return ResponseBuilder.missingInput(
        'prompt',
        'inpaint',
        this.name,
        request.model,
        startTime
      );
    }

    try {
      const imageUrl = mediaInputToUrl(inputImage!);
      const maskUrl = mediaInputToUrl(maskImage!);

      // Build input for flux-fill-pro
      const input: Record<string, unknown> = {
        image: imageUrl,
        mask: maskUrl,
        prompt,
        // Optional parameters with defaults
        guidance: parameters.guidance || 30,
        output_format: parameters.outputFormat || 'png',
        safety_tolerance: parameters.safetyTolerance || 2,
        prompt_upsampling: parameters.promptUpsampling !== false, // default true
      };

      // Add optional parameters if provided
      if (parameters.seed !== undefined) {
        input.seed = parameters.seed;
      }
      if (parameters.steps !== undefined) {
        input.steps = parameters.steps;
      }
      if (parameters.outputQuality !== undefined) {
        input.output_quality = parameters.outputQuality;
      }

      const response = await fetch(
        `${this.baseUrl}/models/${model}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string | string[];
      };

      // Check if already completed (sync response)
      if (data.status === 'succeeded' && data.output) {
        return this.buildImageResponse(data.output, model, request, startTime);
      }

      // Poll for completion if not done yet
      const result = await this.pollForCompletion<{
        output: string | string[];
      }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string | string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Inpaint failed',
            };
          }
          return { completed: false };
        },
        { interval: 2000, maxWait: 120000 }
      );

      return this.buildImageResponse(result.output, model, request, startTime);
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  private async faceSwap(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputImages = [], parameters = {} } = request;
    const model = request.model || 'codeplugtech/face-swap';

    if (inputImages.length < 2) {
      return ResponseBuilder.error(
        'VALIDATION_ERROR',
        'Face swap requires 2 images: source (face to use) and target (where to place face)'
      )
        .metadata(this.name, request.model, startTime)
        .build();
    }

    const sourceImage = inputImages[0];
    const targetImage = inputImages[1];

    try {
      const swapImageUrl = mediaInputToUrl(sourceImage);
      const inputImageUrl = mediaInputToUrl(targetImage);

      const input: Record<string, unknown> = {
        swap_image: swapImageUrl,
        input_image: inputImageUrl,
      };

      if (model.includes('advanced-face-swap')) {
        if (parameters.faceEnhance !== undefined)
          input.face_enhance = parameters.faceEnhance;
        if (parameters.upscale !== undefined)
          input.upscale = parameters.upscale;
      }

      const response = await fetch(
        `${this.baseUrl}/models/${model}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string | string[];
      };

      if (data.status === 'succeeded' && data.output) {
        return this.buildImageResponse(data.output, model, request, startTime);
      }

      const result = await this.pollForCompletion<{
        output: string | string[];
      }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string | string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Face swap failed',
            };
          }
          return { completed: false };
        },
        { interval: 2000, maxWait: 120000 }
      );

      return this.buildImageResponse(result.output, model, request, startTime);
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Build image response from output
   */
  private buildImageResponse(
    output: string | string[],
    model: string,
    request: AIRequest,
    startTime: number
  ): AIResponse {
    const urls = Array.isArray(output) ? output : [output];
    const outputs = urls.map(url => OutputBuilder.image({ url }));

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
  }

  /**
   * Video Inpaint - remove or fill objects in video using mask
   */
  private async videoInpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputVideo, maskImage, parameters = {} } = request;
    const model = request.model || 'jd7h/propainter';

    // Validate inputs
    const videoError = InputValidator.requireVideo(
      request,
      this.name,
      startTime
    );
    if (videoError) return videoError;

    const maskError = InputValidator.requireMask(request, this.name, startTime);
    if (maskError) return maskError;

    try {
      const videoUrl = mediaInputToUrl(inputVideo!);
      const maskUrl = mediaInputToUrl(maskImage!);

      let input: Record<string, unknown>;
      let replicateModel = model;

      if (model === 'jd7h/propainter' || model === 'propainter') {
        replicateModel = 'jd7h/propainter';
        input = {
          video: videoUrl,
          mask: maskUrl,
          resize_ratio: parameters.resizeRatio || 1.0,
          dilate_radius: parameters.dilateRadius || 8,
          raft_iter: parameters.raftIter || 20,
          subvideo_length: parameters.subvideoLength || 80,
          neighbor_length: parameters.neighborLength || 10,
          ref_stride: parameters.refStride || 10,
          fp16: parameters.fp16 !== false,
        };
      } else if (
        model === 'ayushunleashed/minimax-remover' ||
        model === 'minimax-remover'
      ) {
        replicateModel = 'ayushunleashed/minimax-remover';
        input = {
          video: videoUrl,
          mask_video: maskUrl,
        };
      } else {
        replicateModel = 'jd7h/propainter';
        input = {
          video: videoUrl,
          mask: maskUrl,
        };
      }

      const response = await fetch(
        `${this.baseUrl}/models/${replicateModel}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string | string[];
      };

      if (data.status === 'succeeded' && data.output) {
        return this.buildVideoEditResponse(
          data.output,
          model,
          'inpaint',
          request,
          startTime
        );
      }

      const result = await this.pollForCompletion<{
        output: string | string[];
      }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string | string[];
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Video inpainting failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      return this.buildVideoEditResponse(
        result.output,
        model,
        'inpaint',
        request,
        startTime
      );
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Build video edit response (inpaint, upscale, motion-control)
   */
  private buildVideoEditResponse(
    output: string | string[],
    model: string,
    editType: string,
    request: AIRequest,
    startTime: number
  ): AIResponse {
    const urls = Array.isArray(output) ? output : [output];

    const outputs: GeneratedOutput[] = urls.map(url =>
      OutputBuilder.video({
        url,
        metadata: { editType },
      })
    );

    const modelInfo = this.getModelInfo(model);
    const cost = modelInfo?.pricing?.outputCost ?? 0.08;

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: outputs.length, estimatedCost: cost })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  /**
   * Motion Control - Apply motion from a video to a reference image
   */
  private async motionControl(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputImage, inputVideo, parameters = {} } = request;
    const model = request.model || 'kwaivgi/kling-v2.6-motion-control';

    // Validate inputs
    const imageError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (imageError) return imageError;

    const videoError = InputValidator.requireVideo(
      request,
      this.name,
      startTime
    );
    if (videoError) return videoError;

    try {
      const imageUrl = mediaInputToUrl(inputImage!);
      const videoUrl = mediaInputToUrl(inputVideo!);

      const input: Record<string, unknown> = {
        image: imageUrl,
        video: videoUrl,
        mode: parameters.mode || 'std',
        keep_original_sound: parameters.keepOriginalSound !== false,
        character_orientation: parameters.characterOrientation || 'image',
      };

      const response = await fetch(
        `${this.baseUrl}/models/${model}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.credentials!.apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait',
          },
          body: JSON.stringify({ input }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return ResponseBuilder.apiError(
          this.name,
          response.status,
          (errorData as { detail?: string; error?: string }).detail ||
            (errorData as { error?: string }).error ||
            'Unknown error',
          request.model,
          startTime
        );
      }

      const data = (await response.json()) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string;
      };

      if (data.status === 'succeeded' && data.output) {
        return this.buildVideoEditResponse(
          data.output,
          model,
          'motion-control',
          request,
          startTime
        );
      }

      const result = await this.pollForCompletion<{ output: string }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string;
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Motion control failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      return this.buildVideoEditResponse(
        result.output,
        model,
        'motion-control',
        request,
        startTime
      );
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  /**
   * Video Upscale - Enhance video resolution using AI upscaling
   * Supports:
   * - topazlabs/video-upscale: Professional-grade upscaling with target_resolution and target_fps
   */
  private async videoUpscale(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { inputVideo, parameters = {} } = request;
    const model = request.model || 'topazlabs/video-upscale';

    // Validate input
    const videoError = InputValidator.requireVideo(
      request,
      this.name,
      startTime
    );
    if (videoError) return videoError;

    try {
      const videoUrl = mediaInputToUrl(inputVideo!);

      // Build input based on model type
      const input: Record<string, unknown> = buildVideoUpscaleInput(
        model,
        videoUrl,
        parameters
      );

      // Get the latest model version and create prediction
      const version = await this.getLatestModelVersion(model);
      const data = (await this.createPredictionWithVersion(version, input)) as {
        id: string;
        urls: { get: string };
        status: string;
        output?: string;
      };

      if (data.status === 'succeeded' && data.output) {
        return this.buildVideoEditResponse(
          data.output,
          model,
          'upscale',
          request,
          startTime
        );
      }

      const result = await this.pollForCompletion<{ output: string }>(
        async () => {
          const statusRes = await fetch(data.urls.get, {
            headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
          });
          const statusData = (await statusRes.json()) as {
            status: string;
            output?: string;
            error?: string;
          };

          if (statusData.status === 'succeeded' && statusData.output) {
            return { completed: true, result: { output: statusData.output } };
          } else if (statusData.status === 'failed') {
            return {
              completed: true,
              error: statusData.error || 'Video upscaling failed',
            };
          }
          return { completed: false };
        },
        { interval: 5000, maxWait: 600000 }
      );

      return this.buildVideoEditResponse(
        result.output,
        model,
        'upscale',
        request,
        startTime
      );
    } catch (error) {
      return ResponseBuilder.providerError(
        this.name,
        error as Error,
        request.model,
        startTime
      );
    }
  }

  estimateCost(request: AIRequest): number {
    const model = this.getModelInfo(request.model);
    if (!model?.pricing) return 0;

    if (
      request.capability === 'text-to-video' &&
      model.pricing.unit === 'second'
    ) {
      const duration = (request.parameters?.duration as number) ?? 5;
      return CostCalculator.forVideo(model.pricing.outputCost, duration);
    }

    return model.pricing.outputCost;
  }
}
