/**
 * Parallax Iris - xAI (Grok) Provider Adapter
 * Supports: text-to-text, image-analysis, text-to-image, image-to-image
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
import { mediaInputToUrl, mediaInputToBase64 } from './media-utils.js';

/**
 * xAI error bodies are not uniform: schema rejections (422) come back as
 * `{"detail": [...]}` or `{"code": "...", "error": "<string>"}`, and only the
 * chat paths use the OpenAI-shaped `{"error": {"message": "..."}}`. Reading
 * `error.message` alone collapsed every other shape into "Unknown error",
 * which is exactly what surfaced to chat users when a request was rejected.
 */
async function readXAIErrorMessage(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw.trim()) return response.statusText || 'Unknown error';

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.slice(0, 500);
  }

  if (typeof parsed === 'string') return parsed.slice(0, 500);
  if (!parsed || typeof parsed !== 'object') return raw.slice(0, 500);

  const body = parsed as Record<string, unknown>;
  const stringify = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const message = (value as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
      return JSON.stringify(value).slice(0, 500);
    }
    return undefined;
  };

  for (const key of ['error', 'message', 'detail', 'code']) {
    const message = stringify(body[key]);
    if (message) return message;
  }

  return raw.slice(0, 500);
}

export class XAIAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'xai';
  protected baseUrl = 'https://api.x.ai/v1';

  readonly capabilities: AICapability[] = [
    'text-to-text',
    'image-analysis',
    'text-to-image',
    'image-to-image',
  ];

  readonly models: ModelInfo[] = [
    {
      id: 'grok-4',
      name: 'Grok 4',
      provider: 'xai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 131072 },
      pricing: {
        unit: 'token',
        inputCost: 0.003,
        outputCost: 0.015,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 32000, temperature: 0.7 },
    },
    {
      id: 'grok-4-fast-reasoning',
      name: 'Grok 4 Fast Reasoning',
      provider: 'xai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 131072 },
      pricing: {
        unit: 'token',
        inputCost: 0.0005,
        outputCost: 0.0025,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 32000, temperature: 0.7 },
    },
    {
      id: 'grok-3',
      name: 'Grok 3',
      provider: 'xai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 131072 },
      pricing: {
        unit: 'token',
        inputCost: 0.003,
        outputCost: 0.015,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 32000, temperature: 0.7 },
    },
    {
      id: 'grok-3-fast',
      name: 'Grok 3 Fast',
      provider: 'xai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 131072 },
      pricing: {
        unit: 'token',
        inputCost: 0.0005,
        outputCost: 0.0025,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 32000, temperature: 0.7 },
    },
    {
      id: 'grok-2-vision-1212',
      name: 'Grok 2 Vision',
      provider: 'xai',
      capabilities: ['text-to-text', 'image-analysis'],
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      constraints: { maxTokens: 32768 },
      pricing: {
        unit: 'token',
        inputCost: 0.002,
        outputCost: 0.01,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 16000, temperature: 0.7 },
    },
    {
      id: 'grok-imagine-image-2.0',
      name: 'Grok Imagine Image 2.0',
      provider: 'xai',
      capabilities: ['text-to-image', 'image-to-image'],
      inputTypes: ['text', 'image'],
      outputTypes: ['image'],
      constraints: {
        maxImageSize: 1024,
        supportedAspectRatios: ['1:1', '16:9', '9:16'],
      },
      pricing: {
        unit: 'image',
        inputCost: 0,
        outputCost: 0.04,
        currency: 'USD',
      },
      defaultParameters: { numOutputs: 1 },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('xAI API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.credentials!.apiKey!}` },
    });
    if (!response.ok) {
      throw new Error('Failed to connect to xAI API');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-text':
        case 'image-analysis':
          return this.textToText(request, startTime);
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

  private async textToText(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, systemPrompt, inputImage, parameters = {} } = request;
    const model = request.model || 'grok-3';

    const messages: Array<{
      role: string;
      content:
        | string
        | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Build user message with optional image
    if (request.capability === 'image-analysis' && inputImage) {
      const content: Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
      }> = [];
      if (prompt) content.push({ type: 'text', text: prompt });
      content.push({
        type: 'image_url',
        image_url: { url: mediaInputToUrl(inputImage) },
      });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: prompt || '' });
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: parameters.maxTokens || 32000,
      temperature: parameters.temperature ?? 0.7,
    };

    // Add web search if enabled (xAI/Grok uses search_enabled parameter)
    if (parameters.enableWebSearch) {
      requestBody.search_enabled = true;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        await readXAIErrorMessage(response),
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const modelInfo = this.getModelInfo(model);
    const inputCostRate = (modelInfo?.pricing?.inputCost ?? 0.003) / 1000;
    const outputCostRate = (modelInfo?.pricing?.outputCost ?? 0.015) / 1000;
    const estimatedCost = CostCalculator.forTokens(
      inputCostRate,
      outputCostRate,
      data.usage.prompt_tokens,
      data.usage.completion_tokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(data.choices[0]?.message?.content || '')])
      .usage({
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        estimatedCost,
      })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime, data.id)
      .build();
  }

  private async textToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;
    const model = request.model || 'grok-imagine-image-2.0';
    const numOutputs = (parameters.numOutputs as number) || 1;

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: prompt || '',
        n: numOutputs,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        await readXAIErrorMessage(response),
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const outputs: GeneratedOutput[] = data.data.map(item =>
      OutputBuilder.image({
        url: item.url,
        base64: item.b64_json,
        metadata: { revisedPrompt: item.revised_prompt },
      })
    );

    const modelInfo = this.getModelInfo(model);
    const estimatedCost = CostCalculator.forImages(
      modelInfo?.pricing?.outputCost ?? 0.04,
      numOutputs
    );

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async imageToImage(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const validationError = InputValidator.requireImage(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    const { prompt, inputImage } = request;
    const model = request.model || 'grok-imagine-image-2.0';

    // Get image as base64 data URL
    const imageData = await mediaInputToBase64(inputImage!);
    const imageDataUrl = `data:${imageData.mimeType};base64,${imageData.base64}`;

    // `image` is an object (`{ url, type }`), not a bare string — sending the
    // data URL directly is a schema violation and xAI answers 422. Only
    // model/prompt/image are documented for this endpoint, so nothing else is
    // sent: `n` and `response_format` would have matched the defaults anyway
    // (1 image, url), and the response reader below accepts either form.
    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: prompt || 'Edit this image',
        image: { url: imageDataUrl, type: 'image_url' },
      }),
    });

    if (!response.ok) {
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        await readXAIErrorMessage(response),
        request.model,
        startTime
      );
    }

    const data = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    const outputs: GeneratedOutput[] = data.data.map(item =>
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
        data
      );
    }

    // Bill what came back, not what was asked for: the edits call always
    // returns the API default of one image.
    const modelInfo = this.getModelInfo(model);
    const estimatedCost = CostCalculator.forImages(
      modelInfo?.pricing?.outputCost ?? 0.04,
      outputs.length
    );

    return ResponseBuilder.success()
      .outputs(outputs)
      .usage({ units: outputs.length, estimatedCost })
      .rawResponse(data)
      .metadata(this.name, request.model, startTime)
      .build();
  }
}
