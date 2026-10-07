/**
 * Parallax Iris - Anthropic Provider Adapter
 * Supports: text-to-text (Claude models)
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
  CostCalculator,
} from './response-builder.js';

/**
 * Models that still accept non-default `temperature` / `top_p` / `top_k`.
 * From Claude Opus 4.7 on, the API returns 400 when they are set to a
 * non-default value (platform.claude.com model-deprecations, "API parameter
 * deprecations", checked 2026-10-07), so the request leaves them out for any
 * model not matched here — including unknown future ids.
 */
const SAMPLING_PARAM_MODELS =
  /^claude-(?:3-|haiku-4-5|sonnet-4-|opus-4-(?:[0-6](?:\D|$)|\d{8}))/;

function acceptsSamplingParams(model: string): boolean {
  return SAMPLING_PARAM_MODELS.test(model);
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';

export class AnthropicAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'anthropic';
  protected baseUrl = 'https://api.anthropic.com/v1';

  readonly capabilities: AICapability[] = ['text-to-text'];

  readonly models: ModelInfo[] = [
    // Current lineup (platform.claude.com models overview, 2026-10-07).
    // Thinking is adaptive on all three 5.x models and always on for Fable 5.1
    // and Opus 5.5, so they get a larger default output budget.
    {
      id: 'claude-fable-5-1',
      name: 'Claude Fable 5.1',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 10 / 1_000_000,
        outputCost: 50 / 1_000_000,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 16000 },
    },
    {
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 4 / 1_000_000,
        outputCost: 20 / 1_000_000,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 16000 },
    },
    {
      id: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: { maxTokens: 128000 },
      pricing: {
        unit: 'token',
        inputCost: 2 / 1_000_000,
        outputCost: 10 / 1_000_000,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 16000 },
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: { maxTokens: 64000 },
      pricing: {
        unit: 'token',
        inputCost: 1 / 1_000_000,
        outputCost: 5 / 1_000_000,
        currency: 'USD',
      },
      defaultParameters: { maxTokens: 8192, temperature: 1 },
    },
    {
      id: 'claude-opus-4-5-20251101',
      name: 'Claude Opus 4.5',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.000015,
        outputCost: 0.000075,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.000003,
        outputCost: 0.000015,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'claude-opus-4-1-20250805',
      name: 'Claude Opus 4.1',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.000015,
        outputCost: 0.000075,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.000003,
        outputCost: 0.000015,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude Opus 4',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.000015,
        outputCost: 0.000075,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.0000008,
        outputCost: 0.000004,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // Anthropic doesn't have a dedicated ping endpoint
    // Credentials are validated on first request
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-text':
          return this.textToText(request, startTime);
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
    const { prompt, systemPrompt, parameters = {} } = request;
    const model = request.model || DEFAULT_MODEL;
    const legacySampling = acceptsSamplingParams(model);

    const messages = [];
    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    // Build request body. The 5.x models think adaptively and the thinking
    // tokens count against max_tokens, hence the larger default.
    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: parameters.maxTokens || (legacySampling ? 8192 : 16000),
      system: systemPrompt,
      messages,
    };
    if (legacySampling) {
      requestBody.temperature = parameters.temperature ?? 1;
    }

    // Add web search tool if enabled (Anthropic uses web_search tool)
    if (parameters.enableWebSearch) {
      requestBody.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        },
      ];
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.credentials!.apiKey!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

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
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    const modelInfo = this.getModelInfo(model);
    const inputCostRate = modelInfo?.pricing?.inputCost ?? 0.000003;
    const outputCostRate = modelInfo?.pricing?.outputCost ?? 0.000015;
    const estimatedCost = CostCalculator.forTokens(
      inputCostRate,
      outputCostRate,
      data.usage.input_tokens,
      data.usage.output_tokens
    );

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(textContent)])
      .usage({
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        estimatedCost,
      })
      .metadata(this.name, request.model, startTime)
      .build();
  }
}
