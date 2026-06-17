/**
 * Parallax Iris - Google AI Provider Adapter
 * Supports: text-to-image (Imagen), text-to-video (Veo), image-to-video (Veo), text-to-text (Gemini)
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
import { GoogleAuth } from 'google-auth-library';
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
  CostCalculator,
} from './response-builder.js';
import {
  gcsUriToPublicUrl,
  mediaInputToBase64,
  mediaInputToBuffer,
} from './media-utils.js';
import { GOOGLE_MODELS } from './google-models.js';

export class GoogleAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'google';
  protected baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private googleAuth: GoogleAuth | null = null;

  readonly capabilities: AICapability[] = [
    'text-to-image',
    'image-to-image',
    'inpaint',
    'text-to-video',
    'image-to-video',
    'text-to-text',
    'image-analysis',
    'video-analysis',
    'speech-to-text',
    'multi-angle',
  ];

  // Models are imported from google-models.ts
  readonly models: ModelInfo[] = GOOGLE_MODELS;

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Google AI API key is required');
    }
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/models?key=${this.credentials!.apiKey}`
    );
    if (!response.ok) {
      throw new Error('Failed to connect to Google AI API');
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
        case 'text-to-video':
          return this.textToVideo(request, startTime);
        case 'image-to-video':
          return this.imageToVideo(request, startTime);
        case 'text-to-text':
        case 'image-analysis':
          return this.textToText(request, startTime);
        case 'video-analysis':
          return this.videoAnalysis(request, startTime);
        case 'speech-to-text':
          return this.speechToText(request, startTime);
        case 'multi-angle':
          return this.multiAngleGeneration(request, startTime);
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
    const model = request.model || 'gemini-2.5-flash-image';
    const isGeminiModel = model.startsWith('gemini');

    if (isGeminiModel) {
      return this.geminiImageGeneration(request, startTime);
    } else {
      return this.imagenGeneration(request, startTime);
    }
  }

  private async imagenGeneration(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const model = request.model || 'gemini-2.5-flash-image';

    const projectId =
      (this.credentials as any)?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location =
      (this.credentials as any)?.location ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'us-central1';

    if (!projectId) {
      return ResponseBuilder.validationError(
        'projectId',
        'Imagen 4 requires Vertex AI. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
        this.name,
        request.model,
        startTime
      );
    }

    const accessToken = await this.getVertexAccessToken();
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    const response = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: parameters.numOutputs || 1,
          aspectRatio: parameters.aspectRatio || '1:1',
        },
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
      predictions?: Array<{ bytesBase64Encoded: string; mimeType?: string }>;
    };
    const predictions = data.predictions || [];

    if (predictions.length === 0 || !predictions[0]?.bytesBase64Encoded) {
      return ResponseBuilder.emptyResponse(
        'image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const outputs: GeneratedOutput[] = predictions
      .filter(p => p.bytesBase64Encoded)
      .map(p =>
        OutputBuilder.image({
          base64: p.bytesBase64Encoded,
          width: 1024,
          height: 1024,
          mimeType: p.mimeType || 'image/png',
          format: p.mimeType?.split('/')[1] || 'png',
        })
      );

    const modelInfo = this.getModelInfo(model);
    const costPerImage = modelInfo?.pricing?.outputCost || 0.04;

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(costPerImage, outputs.length),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;
    const model = request.model || 'gemini-2.5-flash-image';

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    // Route to Gemini image editing if using a Gemini model
    const isGeminiModel = model.startsWith('gemini');
    if (isGeminiModel) {
      return this.geminiImageEdit(request, startTime);
    }

    const projectId =
      (this.credentials as any)?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location =
      (this.credentials as any)?.location ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'us-central1';

    if (!projectId) {
      return ResponseBuilder.validationError(
        'projectId',
        'Imagen 4 requires Vertex AI. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
        this.name,
        request.model,
        startTime
      );
    }

    const accessToken = await this.getVertexAccessToken();
    const imageData = await mediaInputToBase64(inputImage!);

    const editModel = 'gemini-2.5-flash-image';
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${editModel}:predict`;

    const response = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt || 'Generate a variation of this image',
            referenceImages: [
              {
                referenceId: 1,
                referenceImage: { bytesBase64Encoded: imageData.base64 },
                referenceType: 'REFERENCE_TYPE_STYLE',
              },
            ],
          },
        ],
        parameters: {
          sampleCount: parameters.numOutputs || 1,
          aspectRatio: parameters.aspectRatio || '1:1',
        },
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
      predictions?: Array<{ bytesBase64Encoded: string; mimeType?: string }>;
    };
    const predictions = data.predictions || [];

    if (predictions.length === 0 || !predictions[0]?.bytesBase64Encoded) {
      return ResponseBuilder.emptyResponse(
        'image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    const outputs: GeneratedOutput[] = predictions
      .filter(p => p.bytesBase64Encoded)
      .map(p =>
        OutputBuilder.image({
          base64: p.bytesBase64Encoded,
          width: 1024,
          height: 1024,
          mimeType: p.mimeType || 'image/png',
          format: p.mimeType?.split('/')[1] || 'png',
        })
      );

    const modelInfo = this.getModelInfo(model);
    const costPerImage = modelInfo?.pricing?.outputCost || 0.04;

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(costPerImage, outputs.length),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async geminiImageGeneration(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const model = request.model || 'gemini-2.0-flash-preview-image-generation';

    // Build generationConfig with optional imageConfig for aspectRatio
    const generationConfig: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (parameters.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: parameters.aspectRatio,
      };
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const parts = data.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
        outputs.push(
          OutputBuilder.image({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            format: part.inlineData.mimeType.split('/')[1] || 'png',
          })
        );
      }
    }

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(0.039, outputs.length),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  /**
   * Edit image using Gemini models (image-to-image)
   * Uses generateContent API with input image and text prompt
   */
  private async geminiImageEdit(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;
    const model = request.model || 'gemini-3-pro-image-preview';

    const inputImageData = await mediaInputToBase64(inputImage!);

    // Build parts array: image first, then text prompt
    const parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }> = [];
    parts.push({
      inlineData: {
        mimeType: inputImageData.mimeType,
        data: inputImageData.base64,
      },
    });
    parts.push({ text: prompt || 'Edit this image to improve it.' });

    // Build generationConfig with optional imageConfig for aspectRatio
    const generationConfig: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (parameters.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: parameters.aspectRatio,
      };
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const responseParts = data.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData) {
        outputs.push(
          OutputBuilder.image({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            format: part.inlineData.mimeType.split('/')[1] || 'png',
          })
        );
      }
    }

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'edited image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(0.039, outputs.length),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async inpaint(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, maskImage, parameters = {} } = request;
    const model = request.model || 'gemini-3-pro-image-preview';

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const inputImageData = await mediaInputToBase64(inputImage!);

    const parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }> = [];
    parts.push({
      inlineData: {
        mimeType: inputImageData.mimeType,
        data: inputImageData.base64,
      },
    });

    if (maskImage) {
      const maskImageData = await mediaInputToBase64(maskImage);
      parts.push({
        inlineData: {
          mimeType: maskImageData.mimeType,
          data: maskImageData.base64,
        },
      });
    }

    const inpaintPrompt = maskImage
      ? `Edit this image. Use the second image as a mask - the white areas indicate regions to modify. ${prompt || 'Fill in the masked area naturally.'}`
      : `Edit this image: ${prompt || 'Make appropriate modifications to improve the image.'}`;

    parts.push({ text: inpaintPrompt });

    // Build generationConfig with optional imageConfig for aspectRatio
    const generationConfig: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (parameters.aspectRatio) {
      generationConfig.imageConfig = {
        aspectRatio: parameters.aspectRatio,
      };
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const responseParts = data.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData) {
        outputs.push(
          OutputBuilder.image({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            format: part.inlineData.mimeType.split('/')[1] || 'png',
          })
        );
      }
    }

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'edited image',
        this.name,
        request.model,
        startTime,
        data
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(0.039, outputs.length),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  /**
   * Multi-angle generation using Nano Banana Pro (gemini-3-pro-image-preview)
   * Generates the same subject from a specific viewing angle while preserving identity
   */
  private async multiAngleGeneration(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputImage, parameters = {} } = request;
    const model = 'gemini-3-pro-image-preview'; // Fallback model with image generation support

    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const inputImageData = await mediaInputToBase64(inputImage!);

    // Extract angle settings from parameters
    const angleSettings =
      (parameters.angleSettings as {
        rotation?: number;
        tilt?: number;
        zoom?: number;
        shotCount?: 1 | 12;
      }) || {};

    const rotation = angleSettings.rotation ?? 0;
    const tilt = angleSettings.tilt ?? 0;
    const zoom = angleSettings.zoom ?? 0;

    // Build the identity-preserving angle prompt
    const anglePrompt = this.buildAnglePrompt(rotation, tilt, zoom, prompt);

    // Build parts array: reference image first, then prompt
    const parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }> = [];
    parts.push({
      inlineData: {
        mimeType: inputImageData.mimeType,
        data: inputImageData.base64,
      },
    });
    parts.push({ text: anglePrompt });

    // Force 16:9 aspect ratio for angle mode
    const generationConfig: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '16:9',
      },
    };

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || 'Unknown error',
        model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    const outputs: GeneratedOutput[] = [];
    const responseParts = data.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData) {
        outputs.push(
          OutputBuilder.image({
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            format: part.inlineData.mimeType.split('/')[1] || 'png',
          })
        );
      }
    }

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'angle-adjusted image',
        this.name,
        model,
        startTime,
        data
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: outputs.length,
        estimatedCost: CostCalculator.forImages(0.039, outputs.length),
      })
      .metadata(this.name, model, startTime)
      .build();
  }

  /**
   * Build identity-preserving prompt for angle generation
   */
  private buildAnglePrompt(
    rotation: number,
    tilt: number,
    zoom: number,
    userPrompt?: string
  ): string {
    // Convert rotation to direction description
    let rotationDesc = 'front facing camera';
    if (rotation >= 337.5 || rotation < 22.5) {
      rotationDesc = 'front facing camera (0°)';
    } else if (rotation >= 22.5 && rotation < 67.5) {
      rotationDesc = '45° to the left of front';
    } else if (rotation >= 67.5 && rotation < 112.5) {
      rotationDesc = 'left profile (90°)';
    } else if (rotation >= 112.5 && rotation < 157.5) {
      rotationDesc = '135° from front (back-left)';
    } else if (rotation >= 157.5 && rotation < 202.5) {
      rotationDesc = 'back view (180°)';
    } else if (rotation >= 202.5 && rotation < 247.5) {
      rotationDesc = '135° from front (back-right)';
    } else if (rotation >= 247.5 && rotation < 292.5) {
      rotationDesc = 'right profile (270°)';
    } else {
      rotationDesc = '45° to the right of front';
    }

    // Convert tilt to camera angle description
    let tiltDesc = 'eye level';
    if (tilt > 20) {
      tiltDesc = `looking down at the subject (camera ${Math.abs(tilt)}° above eye level)`;
    } else if (tilt < -20) {
      tiltDesc = `looking up at the subject (camera ${Math.abs(tilt)}° below eye level)`;
    } else if (tilt > 5) {
      tiltDesc = 'slightly elevated camera angle';
    } else if (tilt < -5) {
      tiltDesc = 'slightly low camera angle';
    }

    // Convert zoom to framing description
    let zoomDesc = 'standard framing';
    if (zoom > 70) {
      zoomDesc = 'close-up shot focusing on face and upper body';
    } else if (zoom > 40) {
      zoomDesc = 'medium-close framing';
    } else if (zoom > 10) {
      zoomDesc = 'slightly tighter framing than standard';
    }

    const prompt = `Use the provided reference image as the sole identity and realism anchor.

Generate the subject from a specific viewing angle:
- Camera Position: ${rotationDesc}
- Camera Tilt: ${tiltDesc}
- Framing: ${zoomDesc}

CRITICAL IDENTITY PRESERVATION REQUIREMENTS:
The identity must remain 100% consistent with the reference.
Preserve the exact facial structure, proportions, bone structure, skin tone, hairstyle, hairline, head shape, neck, and shoulders from the reference image.
No changes to age, gender, facial features, or hairstyle.

Camera at specified angle with natural head and body rotation only, no distortion.
Neutral natural expression where the face is visible.
Consistent lighting, realistic shadows, and uniform image quality.

Ultra-photorealistic human appearance.
Visible realistic skin texture, natural hair flow.
No beauty filters, no stylization, no cartoon or illustration style.

${userPrompt ? `Additional context: ${userPrompt}` : ''}

High resolution, sharp focus.

Do NOT alter identity.
Do NOT change proportions.
Do NOT modify facial features or hairstyle.`;

    return prompt;
  }

  private async textToText(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, systemPrompt, parameters = {} } = request;
    const model = request.model || 'gemini-2.0-flash-exp';

    // Build request body
    const requestBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: parameters.temperature || 0.7,
        maxOutputTokens: parameters.maxTokens || 32000,
      },
    };

    if (systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    // Add web search grounding if enabled (Google uses google_search_retrieval)
    if (parameters.enableWebSearch) {
      requestBody.tools = [
        {
          google_search_retrieval: {
            dynamic_retrieval_config: { mode: 'MODE_DYNAMIC' },
          },
        },
      ];
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || 'Unknown error',
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    const modelInfo = this.getModelInfo(request.model);
    const estimatedCost = CostCalculator.forTokens(
      modelInfo?.pricing?.inputCost ?? 0,
      modelInfo?.pricing?.outputCost ?? 0,
      inputTokens,
      outputTokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(text)])
      .usage({ inputTokens, outputTokens, totalTokens, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async videoAnalysis(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, inputVideo, parameters = {} } = request;
    const model = request.model || 'gemini-2.0-flash-exp';

    const validationError = InputValidator.requireVideo(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const videoData = await mediaInputToBase64(inputVideo!, 'video/mp4');

    const analysisPrompt = prompt || 'Describe what you see in this video.';

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.credentials!.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: videoData.mimeType,
                    data: videoData.base64,
                  },
                },
                { text: analysisPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: parameters.temperature || 0.7,
            maxOutputTokens: parameters.maxTokens || 32000,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.error?.message || JSON.stringify(errorData),
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    const modelInfo = this.getModelInfo(request.model);
    const estimatedCost = CostCalculator.forTokens(
      modelInfo?.pricing?.inputCost ?? 0,
      modelInfo?.pricing?.outputCost ?? 0,
      inputTokens,
      outputTokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(text)])
      .usage({ inputTokens, outputTokens, totalTokens, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async textToVideo(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;

    const projectId =
      (this.credentials as any)?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location =
      (this.credentials as any)?.location ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'us-central1';

    if (!projectId) {
      return ResponseBuilder.validationError(
        'projectId',
        'Google Veo requires Vertex AI. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
        this.name,
        request.model,
        startTime
      );
    }

    const accessToken = await this.getVertexAccessToken();
    const model = request.model || 'veo-3.1-generate-001';
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predictLongRunning`;

    const response = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: parameters.aspectRatio || '16:9',
          durationSeconds: parameters.duration || 8,
          sampleCount: 1,
          generateAudio: true,
          resolution: parameters.resolution || '720p',
        },
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
      name?: string;
      done?: boolean;
      response?: any;
    };
    const duration = (parameters.duration as number) || 8;

    let predictions: Array<{
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    }> = [];

    if (!data.done && data.name) {
      const pollResult = await this.pollOperationCompletion(
        data.name,
        300000,
        5000
      );

      if (!pollResult.done || pollResult.error) {
        return ResponseBuilder.error(
          'VIDEO_GENERATION_FAILED',
          pollResult.error?.message || 'Video generation failed or timed out'
        )
          .retryable(true)
          .metadata(this.name, request.model, startTime)
          .build();
      }

      predictions = pollResult.predictions || [];
    } else if (data.done) {
      predictions = data.response?.predictions || [];
    }

    const outputs = await this.extractVideoOutputs(
      predictions,
      duration,
      accessToken
    );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'video',
        this.name,
        request.model,
        startTime
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: duration,
        estimatedCost: CostCalculator.forVideo(0.5, duration),
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

    const projectId =
      (this.credentials as any)?.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location =
      (this.credentials as any)?.location ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'us-central1';

    if (!projectId) {
      return ResponseBuilder.validationError(
        'projectId',
        'Google Veo requires Vertex AI. Please set GOOGLE_CLOUD_PROJECT_ID environment variable.',
        this.name,
        request.model,
        startTime
      );
    }

    const accessToken = await this.getVertexAccessToken();
    const model = request.model || 'veo-3.1-generate-001';
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predictLongRunning`;

    // Prepare image data
    let imageData: {
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    } = {};

    if (inputImage!.type === 'gcs') {
      imageData = { gcsUri: inputImage!.value };
    } else {
      const imgData = await mediaInputToBase64(inputImage!);
      imageData = {
        bytesBase64Encoded: imgData.base64,
        mimeType: imgData.mimeType,
      };
    }

    const duration = (parameters.duration as number) || 8;
    const gcsBucket = process.env.GCS_BUCKET_NAME || 'parallax-ai-storage';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const storageUri = `gs://${gcsBucket}/iris/veo-outputs/${timestamp}-${randomId}/`;

    const response = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instances: [{ prompt: prompt || '', image: imageData }],
        parameters: {
          storageUri,
          aspectRatio: parameters.aspectRatio || '16:9',
          durationSeconds: duration,
          sampleCount: 1,
          generateAudio: true,
          resolution: parameters.resolution || '720p',
          resizeMode: 'crop',
        },
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
      name?: string;
      done?: boolean;
      response?: any;
    };

    let predictions: Array<{
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    }> = [];

    if (!data.done && data.name) {
      const pollResult = await this.pollOperationCompletion(
        data.name,
        300000,
        5000
      );

      if (!pollResult.done || pollResult.error) {
        return ResponseBuilder.error(
          'VIDEO_GENERATION_FAILED',
          `${pollResult.error?.message || 'Video generation failed'} [operation: ${data.name}]`
        )
          .retryable(true)
          .metadata(this.name, request.model, startTime)
          .build();
      }

      predictions = pollResult.predictions || [];
    } else if (data.done) {
      // Check for Veo generateVideoResponse format
      if (data.response?.generateVideoResponse?.generatedSamples) {
        for (const sample of data.response.generateVideoResponse
          .generatedSamples) {
          if (sample.video?.uri || sample.video?.gcsUri) {
            predictions.push({
              gcsUri: sample.video.gcsUri || sample.video.uri,
              mimeType: 'video/mp4',
            });
          }
        }
      } else if (data.response?.predictions) {
        predictions = data.response.predictions;
      }
    }

    const outputs = await this.extractVideoOutputs(
      predictions,
      duration,
      accessToken
    );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'video',
        this.name,
        request.model,
        startTime
      );
    }

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({
        units: duration,
        estimatedCost: CostCalculator.forVideo(0.5, duration),
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async extractVideoOutputs(
    predictions: Array<{
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    }>,
    duration: number,
    accessToken: string
  ): Promise<GeneratedOutput[]> {
    const outputs: GeneratedOutput[] = [];

    for (const prediction of predictions) {
      if (prediction.bytesBase64Encoded) {
        outputs.push(
          OutputBuilder.video({
            base64: prediction.bytesBase64Encoded,
            duration,
            mimeType: prediction.mimeType || 'video/mp4',
          })
        );
      } else if (prediction.gcsUri) {
        const publicUrl = gcsUriToPublicUrl(prediction.gcsUri);

        try {
          const videoData = await this.downloadFromGcs(
            prediction.gcsUri,
            accessToken
          );
          outputs.push(
            OutputBuilder.video({
              base64: videoData.base64,
              url: publicUrl,
              duration,
              mimeType: videoData.mimeType || 'video/mp4',
            })
          );
        } catch (downloadError) {
          console.warn(
            `[GoogleAdapter] Failed to download video from GCS, using public URL: ${downloadError}`
          );
          outputs.push(
            OutputBuilder.video({
              url: publicUrl,
              duration,
              mimeType: 'video/mp4',
            })
          );
        }
      }
    }

    return outputs;
  }

  private async getVertexAccessToken(): Promise<string> {
    if (!this.googleAuth) {
      this.googleAuth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }

    const client = await this.googleAuth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error(
        'Failed to get Vertex AI access token. Check GOOGLE_APPLICATION_CREDENTIALS.'
      );
    }

    return accessToken.token;
  }

  private async pollOperationCompletion(
    operationName: string,
    maxWaitMs: number = 300000,
    pollIntervalMs: number = 5000
  ): Promise<{
    done: boolean;
    predictions?: Array<{
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    }>;
    error?: { code: number; message: string };
  }> {
    const startTime = Date.now();
    const parts = operationName.split('/');
    const locationIndex = parts.indexOf('locations');
    const location =
      locationIndex >= 0 && parts[locationIndex + 1]
        ? parts[locationIndex + 1]
        : 'us-central1';

    await new Promise(resolve => setTimeout(resolve, 3000));

    let consecutive404Count = 0;
    const max404Retries = 5;

    const modelsIndex = parts.indexOf('models');
    const model =
      modelsIndex >= 0 && parts[modelsIndex + 1]
        ? parts[modelsIndex + 1]
        : 'veo-3.1-generate-001';
    const projectId = parts[1];

    while (Date.now() - startTime < maxWaitMs) {
      const accessToken = await this.getVertexAccessToken();
      const fetchOpUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;

      const response = await fetch(fetchOpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ operationName }),
      });

      if (!response.ok) {
        consecutive404Count++;
        if (consecutive404Count <= max404Retries) {
          const waitTime = Math.min(
            pollIntervalMs * consecutive404Count,
            30000
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to poll operation: ${response.status} - ${JSON.stringify(errorData)} [operation: ${operationName}]`
        );
      }

      consecutive404Count = 0;

      const data = (await response.json()) as {
        name: string;
        done?: boolean;
        response?: {
          predictions?: Array<{
            bytesBase64Encoded?: string;
            gcsUri?: string;
            mimeType?: string;
          }>;
          videos?: Array<{
            gcsUri?: string;
            bytesBase64Encoded?: string;
            mimeType?: string;
          }>;
          generatedSamples?: Array<{
            video?: { bytesBase64Encoded?: string; uri?: string };
          }>;
        };
        error?: { code: number; message: string };
      };

      if (data.done) {
        if (data.error) {
          return { done: true, error: data.error };
        }

        let predictions: Array<{
          bytesBase64Encoded?: string;
          gcsUri?: string;
          mimeType?: string;
        }> = [];

        if (data.response?.videos && data.response.videos.length > 0) {
          for (const video of data.response.videos) {
            predictions.push({
              gcsUri: video.gcsUri,
              bytesBase64Encoded: video.bytesBase64Encoded,
              mimeType: video.mimeType || 'video/mp4',
            });
          }
        } else if (data.response?.predictions) {
          predictions = data.response.predictions;
        } else if (data.response?.generatedSamples) {
          for (const sample of data.response.generatedSamples) {
            if (sample.video?.bytesBase64Encoded) {
              predictions.push({
                bytesBase64Encoded: sample.video.bytesBase64Encoded,
                mimeType: 'video/mp4',
              });
            } else if (sample.video?.uri) {
              predictions.push({
                gcsUri: sample.video.uri,
                mimeType: 'video/mp4',
              });
            }
          }
        }

        return { done: true, predictions };
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return {
      done: false,
      error: {
        code: 504,
        message: `Operation timed out after ${maxWaitMs / 1000} seconds`,
      },
    };
  }

  private async downloadFromGcs(
    gcsUri: string,
    accessToken: string
  ): Promise<{ base64: string; mimeType: string }> {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);

    const [, bucket, objectPath] = match;
    const encodedPath = encodeURIComponent(objectPath);
    const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}?alt=media`;

    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download from GCS: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return { base64, mimeType: contentType };
  }

  /**
   * Speech-to-Text using Google Cloud Speech-to-Text API v1
   * Uses standard models for broader compatibility
   */
  private async speechToText(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { parameters = {} } = request;

    // Validate audio input
    const validationError = InputValidator.requireAudio(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const accessToken = await this.getVertexAccessToken();

    // Convert audio to buffer
    const { buffer, mimeType } = await mediaInputToBuffer(
      request.inputAudio!,
      'audio/mpeg'
    );

    const audioBase64 = buffer.toString('base64');

    // Build language code - map short codes to full locale codes
    const langInput =
      (parameters.languageCode as string) ||
      (parameters.language as string) ||
      'en-US';
    const languageCodeMap: Record<string, string> = {
      auto: 'en-US', // Default to English for auto
      en: 'en-US',
      ko: 'ko-KR',
      ja: 'ja-JP',
      zh: 'zh-CN',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
    };
    const languageCode = languageCodeMap[langInput] || langInput;

    // Map mime type to Google Speech API encoding
    const encodingMap: Record<string, string> = {
      'audio/wav': 'LINEAR16',
      'audio/x-wav': 'LINEAR16',
      'audio/wave': 'LINEAR16',
      'audio/mp3': 'MP3',
      'audio/mpeg': 'MP3',
      'audio/ogg': 'OGG_OPUS',
      'audio/flac': 'FLAC',
      'audio/webm': 'WEBM_OPUS',
      'audio/l16': 'LINEAR16',
    };
    const encoding = encodingMap[mimeType] || 'MP3';

    // Speech-to-Text API v1 endpoint
    const speechUrl = 'https://speech.googleapis.com/v1/speech:recognize';

    // Build recognition config for v1 API
    const recognitionConfig: Record<string, unknown> = {
      encoding,
      languageCode,
      // Use 'default' model for general purpose recognition
      model: 'default',
      enableAutomaticPunctuation: true,
      // For LINEAR16, we need sample rate. For MP3/OGG, it's auto-detected.
      ...(encoding === 'LINEAR16' ? { sampleRateHertz: 16000 } : {}),
    };

    const response = await fetch(speechUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        config: recognitionConfig,
        audio: {
          content: audioBase64,
        },
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

    const result = (await response.json()) as {
      results?: Array<{
        alternatives?: Array<{
          transcript?: string;
          confidence?: number;
          words?: Array<{
            word?: string;
            startTime?: string;
            endTime?: string;
          }>;
        }>;
        languageCode?: string;
      }>;
      totalBilledTime?: string;
    };

    // Extract transcript from results
    let fullTranscript = '';
    const words: Array<{
      word: string;
      start: number;
      end: number;
      confidence?: number;
    }> = [];
    let detectedLanguage: string | undefined;

    if (result.results) {
      for (const res of result.results) {
        if (res.alternatives && res.alternatives.length > 0) {
          const alt = res.alternatives[0];
          fullTranscript += `${alt.transcript || ''} `;

          if (alt.words) {
            for (const w of alt.words) {
              words.push({
                word: w.word || '',
                start: parseFloat((w.startTime || '0s').replace('s', '')),
                end: parseFloat((w.endTime || '0s').replace('s', '')),
              });
            }
          }
        }
        if (res.languageCode) {
          detectedLanguage = res.languageCode;
        }
      }
    }

    fullTranscript = fullTranscript.trim();

    // Calculate duration from billed time or estimate from words
    let audioDuration = 0;
    if (result.totalBilledTime) {
      audioDuration = parseFloat(result.totalBilledTime.replace('s', ''));
    } else if (words.length > 0) {
      audioDuration = words[words.length - 1].end;
    }

    // Cost calculation: $0.016 per minute (standard model)
    const durationMinutes = audioDuration / 60;
    const estimatedCost = durationMinutes * 0.016;

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.text(fullTranscript, {
          languageCode: detectedLanguage,
          words: words.length > 0 ? words : undefined,
        }),
      ])
      .usage({ durationSeconds: audioDuration, estimatedCost })
      .rawResponse(result)
      .metadata(this.name, request.model, startTime)
      .build();
  }
}
