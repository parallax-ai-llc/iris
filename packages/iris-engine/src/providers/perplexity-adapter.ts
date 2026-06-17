/**
 * Parallax Iris - Perplexity Provider Adapter
 * Supports: text-to-text (Sonar models with built-in web search)
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

export class PerplexityAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'perplexity';
  protected baseUrl = 'https://api.perplexity.ai';

  readonly capabilities: AICapability[] = ['text-to-text'];

  readonly models: ModelInfo[] = [
    {
      id: 'sonar-pro',
      name: 'Sonar Pro',
      provider: 'perplexity',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.003 / 1000,
        outputCost: 0.015 / 1000,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 4096,
        temperature: 0.2,
      },
    },
    {
      id: 'sonar-reasoning-pro',
      name: 'Sonar Reasoning Pro',
      provider: 'perplexity',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.003 / 1000,
        outputCost: 0.015 / 1000,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 4096,
        temperature: 0.2,
      },
    },
    {
      id: 'sonar',
      name: 'Sonar',
      provider: 'perplexity',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 8192,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.001 / 1000,
        outputCost: 0.001 / 1000,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 4096,
        temperature: 0.2,
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('Perplexity API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // Perplexity doesn't have a dedicated ping endpoint
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
    const model = request.model || 'sonar';

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    // Perplexity uses OpenAI-compatible format
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: parameters.maxTokens || 4096,
        temperature: parameters.temperature ?? 0.2,
        // Perplexity has web search built-in, no need to enable it
      }),
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
      id: string;
      choices: Array<{ message: { content: string } }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      citations?: string[];
    };

    const modelInfo = this.getModelInfo(model);
    const inputCostRate = modelInfo?.pricing?.inputCost ?? 0.001 / 1000;
    const outputCostRate = modelInfo?.pricing?.outputCost ?? 0.001 / 1000;
    const estimatedCost = CostCalculator.forTokens(
      inputCostRate,
      outputCostRate,
      data.usage.prompt_tokens,
      data.usage.completion_tokens
    );

    // Build response text, optionally including citations
    const responseText = data.choices[0]?.message?.content || '';

    // Perplexity returns citations array - we can include them in metadata
    const metadata: Record<string, unknown> = {};
    if (data.citations && data.citations.length > 0) {
      metadata.citations = data.citations;
    }

    return ResponseBuilder.success()
      .outputs([OutputBuilder.text(responseText, metadata)])
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
}
