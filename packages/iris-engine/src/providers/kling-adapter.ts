/**
 * Parallax Iris - Kling AI Provider Adapter
 * Supports: text-to-video, image-to-video
 *
 * Kling API uses JWT authentication with Access Key and Secret Key
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
} from '../types.js';
import * as crypto from 'crypto';
import { uploadTempPublicFile } from '../host-hooks.js';
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
  CostCalculator,
} from './response-builder.js';
import { parseDataUri } from './media-utils.js';

export class KlingAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'kling';
  protected baseUrl = 'https://api.klingai.com/v1';

  readonly capabilities: AICapability[] = ['text-to-video', 'image-to-video'];

  readonly models: ModelInfo[] = [
    {
      id: 'kling-v1-standard',
      name: 'Kling 1.6 Standard',
      provider: 'kling',
      capabilities: ['text-to-video', 'image-to-video'],
      inputTypes: ['text', 'image'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 5,
        supportedDurations: [5],
        supportedFormats: ['mp4'],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.028,
        currency: 'USD',
      },
      defaultParameters: { duration: 5 },
    },
    {
      id: 'kling-v1-pro',
      name: 'Kling 1.6 Pro',
      provider: 'kling',
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
        outputCost: 0.035,
        currency: 'USD',
      },
      defaultParameters: { duration: 5 },
    },
    {
      id: 'kling-v2',
      name: 'Kling 2.0',
      provider: 'kling',
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
        outputCost: 0.05,
        currency: 'USD',
      },
      defaultParameters: { duration: 5 },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    const accessKey =
      this.credentials?.apiKey || this.credentials?.custom?.accessKey;
    const secretKey = this.credentials?.custom?.secretKey;
    if (!accessKey || !secretKey) {
      throw new Error(
        'Kling AI requires both Access Key and Secret Key. Set apiKey (or custom.accessKey) and custom.secretKey.'
      );
    }
  }

  protected async pingApi(): Promise<void> {
    // Kling doesn't have a simple ping endpoint
  }

  private generateJWT(): string {
    const accessKey =
      this.credentials?.apiKey || this.credentials?.custom?.accessKey;
    const secretKey = this.credentials?.custom?.secretKey;
    if (!accessKey || !secretKey)
      throw new Error('Kling API credentials not configured');

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 1800;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { iss: accessKey, exp: expiry, iat: now - 5, nbf: now - 5 };

    const base64UrlEncode = (obj: object): string => {
      return Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(signatureInput)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
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
    const jwtToken = this.generateJWT();
    const duration = (parameters.duration as number) || 5;

    const response = await fetch(`${this.baseUrl}/videos/text2video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration,
        aspect_ratio: parameters.aspectRatio || '16:9',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.message || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as { task_id: string };

    const result = await this.pollForCompletion<{ video_url: string }>(
      async () => {
        const pollToken = this.generateJWT();
        const statusRes = await fetch(
          `${this.baseUrl}/videos/tasks/${data.task_id}`,
          {
            headers: { Authorization: `Bearer ${pollToken}` },
          }
        );
        const statusData = (await statusRes.json()) as {
          status: string;
          video_url?: string;
          error?: string;
        };

        if (statusData.status === 'completed')
          return {
            completed: true,
            result: { video_url: statusData.video_url! },
          };
        if (statusData.status === 'failed')
          return {
            completed: true,
            error: statusData.error || 'Generation failed',
          };
        return { completed: false };
      },
      { interval: 5000, maxWait: 300000 }
    );

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.video({
          url: result.video_url,
          duration,
          mimeType: 'video/mp4',
          format: 'mp4',
        }),
      ])
      .usage({
        durationSeconds: duration,
        estimatedCost: CostCalculator.forVideo(0.05, duration),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToVideo(
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

    const jwtToken = this.generateJWT();

    // Prepare image URL
    let imageUrl: string;
    if (inputImage!.type === 'url') {
      imageUrl = inputImage!.value;
    } else if (inputImage!.type === 'base64') {
      let base64Value = inputImage!.value;
      let mimeType = inputImage!.mimeType || 'image/png';

      if (base64Value.startsWith('data:')) {
        const parsed = parseDataUri(base64Value);
        mimeType = parsed.mimeType;
        base64Value = parsed.base64;
      }

      imageUrl = await this.uploadToGcs(base64Value, mimeType);
    } else {
      return ResponseBuilder.validationError(
        'inputImage',
        `Unsupported image input type: ${inputImage!.type}`,
        this.name,
        request.model,
        startTime
      );
    }

    let mode = 'std';
    let modelName = 'kling-v1-6';
    if (request.model?.includes('pro')) mode = 'pro';
    if (request.model?.includes('v2')) modelName = 'kling-v2-1';
    else if (request.model?.includes('v1-5') || request.model?.includes('v1.5'))
      modelName = 'kling-v1-5';

    const duration = (parameters.duration as number) || 5;

    const response = await fetch(`${this.baseUrl}/videos/image2video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_name: modelName,
        mode,
        prompt: prompt || '',
        negative_prompt: parameters.negativePrompt || '',
        image: imageUrl,
        duration: String(duration),
        aspect_ratio: parameters.aspectRatio || '16:9',
        cfg_scale: parameters.cfgScale || 0.5,
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

    const data = (await response.json()) as {
      code: number;
      message: string;
      data?: { task_id: string };
    };

    if (data.code !== 0 || !data.data?.task_id) {
      return ResponseBuilder.error(
        'KLING_API_ERROR',
        data.message || 'Unknown error'
      )
        .metadata(this.name, request.model, startTime)
        .build();
    }

    const taskId = data.data.task_id;

    const result = await this.pollForCompletion<{ video_url: string }>(
      async () => {
        const pollToken = this.generateJWT();
        const statusRes = await fetch(
          `${this.baseUrl}/videos/image2video/${taskId}`,
          {
            headers: { Authorization: `Bearer ${pollToken}` },
          }
        );

        if (!statusRes.ok) {
          const errData = await statusRes.json().catch(() => ({}));
          return {
            completed: true,
            error: `Status check failed: ${statusRes.status} - ${JSON.stringify(errData)}`,
          };
        }

        const statusData = (await statusRes.json()) as {
          code: number;
          message: string;
          data?: {
            task_status: string;
            task_status_msg?: string;
            works?: Array<{ resource: { resource: string } }>;
          };
        };

        if (statusData.code !== 0)
          return {
            completed: true,
            error: statusData.message || 'Status check failed',
          };

        const taskStatus = statusData.data?.task_status;
        if (taskStatus === 'succeed') {
          const videoUrl = statusData.data?.works?.[0]?.resource?.resource;
          if (videoUrl)
            return { completed: true, result: { video_url: videoUrl } };
          return { completed: true, error: 'Video URL not found in response' };
        } else if (taskStatus === 'failed') {
          return {
            completed: true,
            error: statusData.data?.task_status_msg || 'Generation failed',
          };
        }
        return { completed: false };
      },
      { interval: 5000, maxWait: 300000 }
    );

    // Download video and convert to base64
    let base64Video: string | undefined;
    if (result.video_url) {
      try {
        const videoResponse = await fetch(result.video_url);
        if (videoResponse.ok) {
          const buffer = await videoResponse.arrayBuffer();
          base64Video = Buffer.from(buffer).toString('base64');
        }
      } catch {
        /* If download fails, just use URL */
      }
    }

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.video({
          url: result.video_url,
          base64: base64Video,
          duration,
          mimeType: 'video/mp4',
          format: 'mp4',
        }),
      ])
      .usage({
        durationSeconds: duration,
        estimatedCost: CostCalculator.forVideo(0.05, duration),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async uploadToGcs(
    base64Data: string,
    mimeType: string
  ): Promise<string> {
    const result = await uploadTempPublicFile({
      base64Data,
      mimeType,
      provider: 'kling',
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
