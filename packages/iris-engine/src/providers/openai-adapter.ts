/**
 * Parallax Iris - OpenAI Provider Adapter
 * Supports: text-to-text, text-to-image, text-to-video (Sora), speech-to-text, text-to-speech, image-analysis
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
import { mediaInputToUrl, mediaInputToBuffer } from './media-utils.js';

export class OpenAIAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'openai';
  protected baseUrl = 'https://api.openai.com/v1';

  readonly capabilities: AICapability[] = [
    'text-to-text',
    'text-to-image',
    'image-to-image',
    'text-to-video',
    'text-to-speech',
    'speech-to-text',
    'image-analysis',
    'audio-analysis',
    'document-analysis',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      capabilities: ['text-to-text', 'image-analysis', 'document-analysis'],
      inputTypes: ['text', 'image', 'document'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 0.0025 / 1000,
        outputCost: 0.01 / 1000,
        currency: 'USD',
      },
      defaultParameters: { temperature: 0.7, maxTokens: 16000 },
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      capabilities: ['text-to-text', 'image-analysis', 'audio-analysis'],
      inputTypes: ['text', 'image', 'audio'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 0.00015 / 1000,
        outputCost: 0.0006 / 1000,
        currency: 'USD',
      },
      defaultParameters: { temperature: 0.7, maxTokens: 16000 },
    },
    {
      id: 'gpt-5.2',
      name: 'GPT-5.2',
      provider: 'openai',
      capabilities: ['text-to-text', 'image-analysis', 'document-analysis'],
      inputTypes: ['text', 'image', 'document'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 0.00175 / 1000,
        outputCost: 0.014 / 1000,
        currency: 'USD',
      },
      defaultParameters: { temperature: 0.7, maxTokens: 32000 },
    },
    {
      id: 'gpt-5.1-2025-11-13',
      name: 'GPT-5.1',
      provider: 'openai',
      capabilities: ['text-to-text', 'image-analysis', 'document-analysis'],
      inputTypes: ['text', 'image', 'document'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 0.00175 / 1000,
        outputCost: 0.014 / 1000,
        currency: 'USD',
      },
      defaultParameters: { temperature: 0.7, maxTokens: 32000 },
    },
    {
      id: 'gpt-5-mini-2025-08-07',
      name: 'GPT-5 Mini',
      provider: 'openai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 0.0003 / 1000,
        outputCost: 0.0012 / 1000,
        currency: 'USD',
      },
      defaultParameters: { temperature: 0.7, maxTokens: 16000 },
    },
    {
      id: 'gpt-image-1',
      name: 'GPT Image 1',
      provider: 'openai',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1536,
        supportedFormats: ['png', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: { quality: 'standard', width: 1024, height: 1024 },
    },
    {
      id: 'gpt-image-1-mini',
      name: 'GPT Image 1 Mini',
      provider: 'openai',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedFormats: ['png', 'webp'],
        supportedAspectRatios: ['1:1', '16:9', '9:16'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.02,
        currency: 'USD',
      },
      defaultParameters: { quality: 'standard', width: 1024, height: 1024 },
    },
    {
      id: 'gpt-image-2',
      name: 'GPT Image 2',
      provider: 'openai',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 2048,
        supportedFormats: ['png', 'webp'],
        supportedAspectRatios: [
          '1:1',
          '16:9',
          '9:16',
          '3:1',
          '1:3',
          '4:3',
          '3:4',
        ],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.08,
        currency: 'USD',
      },
      defaultParameters: { quality: 'standard', width: 1024, height: 1024 },
    },
    {
      id: 'whisper-1',
      name: 'Whisper',
      provider: 'openai',
      capabilities: ['speech-to-text'],
      inputTypes: ['audio'],
      outputTypes: ['text'],
      constraints: {
        maxAudioDuration: 7200,
        supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0.006 / 60,
        outputCost: 0,
        currency: 'USD',
      },
    },
    {
      id: 'tts-1',
      name: 'TTS',
      provider: 'openai',
      capabilities: ['text-to-speech'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 4096,
        supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
      },
      pricing: {
        unit: 'token',
        inputCost: 0.015 / 1000,
        outputCost: 0,
        currency: 'USD',
      },
      defaultParameters: { voice: 'alloy', speed: 1.0 },
    },
    {
      id: 'tts-1-hd',
      name: 'TTS HD',
      provider: 'openai',
      capabilities: ['text-to-speech'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 4096,
        supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
      },
      pricing: {
        unit: 'token',
        inputCost: 0.03 / 1000,
        outputCost: 0,
        currency: 'USD',
      },
      defaultParameters: { voice: 'alloy', speed: 1.0 },
    },
    {
      id: 'sora-2',
      name: 'Sora 2',
      provider: 'openai',
      capabilities: ['text-to-video'],
      inputTypes: ['text'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 12,
        supportedDurations: [4, 8, 12],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 0.5,
        currency: 'USD',
      },
    },
    {
      id: 'sora-2-pro',
      name: 'Sora 2 Pro',
      provider: 'openai',
      capabilities: ['text-to-video'],
      inputTypes: ['text'],
      outputTypes: ['video'],
      constraints: {
        maxVideoDuration: 12,
        supportedDurations: [4, 8, 12],
        supportedAspectRatios: ['16:9', '9:16', '1:1'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0,
        outputCost: 1.0,
        currency: 'USD',
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey)
      throw new Error('OpenAI API key is required');
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
    });
    if (!response.ok) throw new Error('Failed to connect to OpenAI API');
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

      switch (request.capability) {
        case 'text-to-text':
        case 'image-analysis':
          return this.handleChatCompletion(request, startTime);
        case 'text-to-image':
          return this.handleImageGeneration(request, startTime);
        case 'image-to-image':
          return this.handleImageEdit(request, startTime);
        case 'text-to-video':
          return this.handleVideoGeneration(request, startTime);
        case 'text-to-speech':
          return this.handleTextToSpeech(request, startTime);
        case 'speech-to-text':
          return this.handleSpeechToText(request, startTime);
        case 'audio-analysis':
          return this.handleAudioAnalysis(request, startTime);
        case 'document-analysis':
          return this.handleDocumentAnalysis(request, startTime);
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

  private async handleChatCompletion(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const messages: Array<{
      role: string;
      content:
        | string
        | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [];

    if (request.systemPrompt)
      messages.push({ role: 'system', content: request.systemPrompt });

    if (request.capability === 'image-analysis' && request.inputImage) {
      const content: Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
      }> = [];
      if (request.prompt) content.push({ type: 'text', text: request.prompt });
      content.push({
        type: 'image_url',
        image_url: { url: mediaInputToUrl(request.inputImage) },
      });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: request.prompt || '' });
    }

    const isGpt5OrNewer =
      request.model.startsWith('gpt-5') ||
      request.model.startsWith('o1') ||
      request.model.startsWith('o3');
    const defaultMaxTokens = isGpt5OrNewer ? 32000 : 16000;
    const maxTokensParam = isGpt5OrNewer
      ? {
          max_completion_tokens:
            request.parameters?.maxTokens ?? defaultMaxTokens,
        }
      : { max_tokens: request.parameters?.maxTokens ?? defaultMaxTokens };

    // Build request body
    // Note: GPT-5 / o1 / o3 reasoning models only accept the default temperature (1)
    // and do not support top_p — sending custom values is silently ignored or errors out.
    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages,
      ...maxTokensParam,
    };

    if (!isGpt5OrNewer) {
      requestBody.temperature = request.parameters?.temperature ?? 0.7;
      if (request.parameters?.topP !== undefined) {
        requestBody.top_p = request.parameters.topP;
      }
    }

    // Add web search if enabled (OpenAI uses web_search_preview tool)
    if (request.parameters?.enableWebSearch) {
      requestBody.tools = [{ type: 'web_search_preview' }];
      requestBody.tool_choice = 'auto';
    }

    const response = await this.fetchApi<{
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const model = this.getModelInfo(request.model);
    const estimatedCost = CostCalculator.forTokens(
      model?.pricing?.inputCost ?? 0,
      model?.pricing?.outputCost ?? 0,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(response.choices[0].message.content)])
      .usage({
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        estimatedCost,
      })
      .rawResponse(response)
      .metadata(this.name, request.model, startTime, response.id)
      .build();
  }

  private async handleImageGeneration(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const model = request.model || 'gpt-image-1';

    let size = '1024x1024';
    if (request.parameters?.aspectRatio === '16:9') size = '1536x1024';
    else if (request.parameters?.aspectRatio === '9:16') size = '1024x1536';

    if (request.parameters?.width && request.parameters?.height) {
      size = `${request.parameters.width}x${request.parameters.height}`;
    }

    const requestBody: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n: request.parameters?.numOutputs ?? 1,
      size,
    };

    const response = await this.fetchApi<{
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    }>('/images/generations', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const outputs: GeneratedOutput[] = response.data
      .filter(item => item.url || item.b64_json)
      .map(item =>
        OutputBuilder.image({
          url: item.url,
          base64: item.b64_json,
          metadata: { revisedPrompt: item.revised_prompt },
        })
      );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'image',
        this.name,
        request.model,
        startTime,
        response
      );
    }

    const modelInfo = this.getModelInfo(request.model);
    const numImages = (request.parameters?.numOutputs as number) ?? 1;
    const estimatedCost = CostCalculator.forImages(
      modelInfo?.pricing?.outputCost ?? 0.04,
      numImages
    );

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(response)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async handleImageEdit(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const model = request.model || 'gpt-image-1';
    const { prompt, inputImage, parameters = {} } = request;

    // Get image as buffer for multipart/form-data
    const { buffer: imageBuffer, mimeType } = await mediaInputToBuffer(
      inputImage!
    );

    // Determine size based on aspect ratio
    let size = '1024x1024';
    if (parameters.aspectRatio === '16:9') size = '1536x1024';
    else if (parameters.aspectRatio === '9:16') size = '1024x1536';

    // Build multipart/form-data request
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt || 'Edit this image');

    // Append image as file
    const extension = mimeType.split('/')[1] || 'png';
    const blob = new Blob([imageBuffer as unknown as BlobPart], {
      type: mimeType,
    });
    formData.append('image', blob, `image.${extension}`);

    formData.append('n', String(parameters.numOutputs ?? 1));
    formData.append('size', size);

    // Make request with multipart/form-data (no Content-Type header - let fetch set it with boundary)
    const response = await fetch(`${this.baseUrl}/images/edits`, {
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

    const responseData = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const outputs: GeneratedOutput[] = responseData.data
      .filter(item => item.url || item.b64_json)
      .map(item =>
        OutputBuilder.image({
          url: item.url,
          base64: item.b64_json,
          metadata: { revisedPrompt: item.revised_prompt },
        })
      );

    if (outputs.length === 0) {
      return ResponseBuilder.emptyResponse(
        'edited image',
        this.name,
        request.model,
        startTime,
        responseData
      );
    }

    const modelInfo = this.getModelInfo(request.model);
    const numImages = (parameters.numOutputs as number) ?? 1;
    const estimatedCost = CostCalculator.forImages(
      modelInfo?.pricing?.outputCost ?? 0.04,
      numImages
    );

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: numImages, estimatedCost })
      .rawResponse(responseData)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async handleTextToSpeech(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    // Validate text input
    if (!request.prompt || request.prompt.trim().length === 0) {
      return ResponseBuilder.missingInput(
        'text',
        'text-to-speech',
        this.name,
        request.model,
        startTime
      );
    }

    const response = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        input: request.prompt,
        voice: request.parameters?.voice ?? 'alloy',
        speed: request.parameters?.speed ?? 1.0,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) await this.handleApiError(response);

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const charCount = (request.prompt || '').length;
    const model = this.getModelInfo(request.model);
    const estimatedCost =
      (model?.pricing?.inputCost ?? 0.015 / 1000) * charCount;

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.audio({ base64, mimeType: 'audio/mpeg', format: 'mp3' }),
      ])
      .usage({ estimatedCost })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async handleSpeechToText(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireAudio(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const formData = new FormData();
    formData.append('model', request.model);

    const { buffer, mimeType } = await mediaInputToBuffer(
      request.inputAudio!,
      'audio/mpeg'
    );
    formData.append(
      'file',
      new Blob([buffer as unknown as BlobPart], { type: mimeType }),
      'audio.mp3'
    );

    if (request.prompt) formData.append('prompt', request.prompt);

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.credentials!.apiKey}` },
      body: formData,
    });

    if (!response.ok) await this.handleApiError(response);

    const result = (await response.json()) as {
      text: string;
      duration?: number;
    };
    const durationSeconds = result.duration ?? 60;
    const model = this.getModelInfo(request.model);
    const estimatedCost =
      (model?.pricing?.inputCost ?? 0.006 / 60) * durationSeconds;

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(result.text)])
      .usage({ durationSeconds, estimatedCost })
      .rawResponse(result)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async handleAudioAnalysis(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireAudio(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const transcriptionResult = await this.handleSpeechToText(
      { ...request, capability: 'speech-to-text', model: 'whisper-1' },
      startTime
    );
    if (!transcriptionResult.success) return transcriptionResult;

    const transcription = transcriptionResult.outputs[0]?.text || '';
    const analysisPrompt = request.prompt
      ? `${request.prompt}\n\nAudio Transcription:\n${transcription}`
      : `Analyze the following audio transcription and provide insights:\n\n${transcription}`;

    const analysisResult = await this.handleChatCompletion(
      {
        ...request,
        capability: 'text-to-text',
        model: request.model || 'gpt-4o-mini',
        prompt: analysisPrompt,
        systemPrompt:
          request.systemPrompt ||
          'You are an audio content analyst. Analyze the provided audio transcription and give detailed insights.',
      },
      startTime
    );

    if (!analysisResult.success) return analysisResult;

    const totalCost =
      (transcriptionResult.usage?.estimatedCost || 0) +
      (analysisResult.usage?.estimatedCost || 0);

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.text(analysisResult.outputs[0]?.text || '', {
          transcription,
        }),
      ])
      .usage({
        inputTokens: analysisResult.usage?.inputTokens,
        outputTokens: analysisResult.usage?.outputTokens,
        totalTokens: analysisResult.usage?.totalTokens,
        durationSeconds: transcriptionResult.usage?.durationSeconds,
        estimatedCost: totalCost,
      })
      .rawResponse({
        transcription: transcriptionResult.rawResponse,
        analysis: analysisResult.rawResponse,
      })
      .metadata(this.name, request.model || 'gpt-4o-mini', startTime)
      .build();
  }

  private async handleDocumentAnalysis(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const hasImage = request.inputImage || request.inputImages?.length;
    if (!hasImage && !request.prompt) {
      return ResponseBuilder.missingInput(
        'Document image or text content',
        request.capability,
        this.name,
        request.model,
        startTime
      );
    }

    const messages: Array<{
      role: string;
      content:
        | string
        | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [];

    messages.push({
      role: 'system',
      content:
        request.systemPrompt ||
        'You are a document analyst. Analyze the provided document and extract relevant information.',
    });

    const content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }> = [];
    content.push({
      type: 'text',
      text:
        request.prompt ||
        'Analyze this document and provide a summary of its contents.',
    });

    if (request.inputImage) {
      content.push({
        type: 'image_url',
        image_url: { url: mediaInputToUrl(request.inputImage) },
      });
    }

    if (request.inputImages) {
      for (const img of request.inputImages) {
        content.push({
          type: 'image_url',
          image_url: { url: mediaInputToUrl(img) },
        });
      }
    }

    messages.push({ role: 'user', content });

    const model = request.model || 'gpt-4o';

    const response = await this.fetchApi<{
      id: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        temperature: request.parameters?.temperature ?? 0.3,
        max_tokens: request.parameters?.maxTokens ?? 4096,
      }),
    });

    const modelInfo = this.getModelInfo(model);
    const estimatedCost = CostCalculator.forTokens(
      modelInfo?.pricing?.inputCost ?? 0,
      modelInfo?.pricing?.outputCost ?? 0,
      response.usage.prompt_tokens,
      response.usage.completion_tokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(response.choices[0].message.content)])
      .usage({
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        estimatedCost,
      })
      .rawResponse(response)
      .metadata(this.name, model, startTime, response.id)
      .build();
  }

  private async handleVideoGeneration(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const model = request.model || 'sora-2';
    const seconds = (request.parameters?.duration as number) ?? 4;

    // Determine size based on aspect ratio (Sora uses WxH format)
    // Allowed: 720x1280, 1280x720, 1024x1792, 1792x1024
    let size = '1280x720'; // 16:9 landscape
    if (request.parameters?.aspectRatio === '9:16') size = '720x1280';
    else if (request.parameters?.aspectRatio === '1:1') size = '1024x1024';

    // Validate seconds to allowed values (4, 8, 12)
    const validSeconds = [4, 8, 12];
    const closestSeconds = validSeconds.reduce((prev, curr) =>
      Math.abs(curr - seconds) < Math.abs(prev - seconds) ? curr : prev
    );

    // Step 1: Create video generation job (POST /v1/videos)
    const createResponse = await this.fetchApi<{
      id: string;
      status: string;
      created_at?: number;
    }>('/videos', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        seconds: String(closestSeconds), // Must be string: "4", "8", or "12"
        size,
      }),
    });

    const videoId = createResponse.id;

    // Step 2: Poll for completion (similar to Google adapter pattern)
    const pollResult = await this.pollVideoCompletion(videoId, 600000, 5000); // 10 min timeout, 5s interval

    if (!pollResult.completed) {
      return ResponseBuilder.error(
        'VIDEO_GENERATION_FAILED',
        pollResult.error || 'Video generation failed or timed out'
      )
        .retryable(true)
        .metadata(this.name, request.model, startTime, videoId)
        .build();
    }

    // Step 3: Get video content
    const contentResponse = await this.fetchApi<{ url: string }>(
      `/videos/${videoId}/content`,
      { method: 'GET' }
    );

    const modelInfo = this.getModelInfo(request.model);
    const estimatedCost = CostCalculator.forVideo(
      modelInfo?.pricing?.outputCost ?? 0.5,
      seconds
    );

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.video({
          url: contentResponse.url,
          duration: seconds,
          mimeType: 'video/mp4',
        }),
      ])
      .usage({ units: seconds, estimatedCost })
      .rawResponse({ createResponse, contentResponse })
      .metadata(this.name, request.model, startTime, videoId)
      .build();
  }

  /**
   * Poll OpenAI video generation until completion
   */
  private async pollVideoCompletion(
    videoId: string,
    timeoutMs: number = 600000,
    intervalMs: number = 5000
  ): Promise<{ completed: boolean; error?: string }> {
    const maxAttempts = Math.ceil(timeoutMs / intervalMs);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const statusResponse = await this.fetchApi<{
          id: string;
          status: string;
          error?: { message: string };
        }>(`/videos/${videoId}`, { method: 'GET' });

        if (statusResponse.status === 'completed') {
          return { completed: true };
        }

        if (statusResponse.status === 'failed') {
          return {
            completed: false,
            error: statusResponse.error?.message || 'Video generation failed',
          };
        }

        // Status is 'pending' or 'in_progress', continue polling
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } catch (error) {
        console.error(`[OpenAI Video] Polling error:`, error);
        // Continue polling on transient errors
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    return { completed: false, error: 'Video generation timed out' };
  }

  estimateCost(request: AIRequest): number {
    const model = this.getModelInfo(request.model);
    if (!model?.pricing) return 0;

    switch (request.capability) {
      case 'text-to-image':
        return CostCalculator.forImages(
          model.pricing.outputCost,
          (request.parameters?.numOutputs as number) ?? 1
        );
      case 'text-to-speech':
        return (model.pricing.inputCost ?? 0) * (request.prompt || '').length;
      case 'speech-to-text':
        return (model.pricing.inputCost ?? 0) * 60;
      case 'text-to-video':
        return CostCalculator.forVideo(
          model.pricing.outputCost,
          (request.parameters?.duration as number) ?? 5
        );
      case 'text-to-text':
      case 'image-analysis':
      case 'document-analysis':
        const inputTokens = Math.ceil((request.prompt || '').length / 4);
        const outputTokens = (request.parameters?.maxTokens as number) ?? 1000;
        return CostCalculator.forTokens(
          model.pricing.inputCost,
          model.pricing.outputCost,
          inputTokens,
          outputTokens
        );
      default:
        return model.pricing.inputCost + model.pricing.outputCost;
    }
  }
}
