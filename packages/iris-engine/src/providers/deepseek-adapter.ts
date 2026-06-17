/**
 * Parallax Iris - DeepSeek Provider Adapter
 * Supports: text-to-text (DeepSeek Chat and Reasoner models)
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

export class DeepSeekAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'deepseek';
  protected baseUrl = 'https://api.deepseek.com/v1';

  readonly capabilities: AICapability[] = ['text-to-text'];

  readonly models: ModelInfo[] = [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'deepseek',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 64000,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.00014 / 1000,
        outputCost: 0.00028 / 1000,
        currency: 'USD',
      },
      defaultParameters: {
        maxTokens: 8192,
        temperature: 1,
      },
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner (R1)',
      provider: 'deepseek',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        maxTokens: 64000,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.00055 / 1000,
        outputCost: 0.00219 / 1000,
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
      throw new Error('DeepSeek API key is required');
    }
  }

  protected async pingApi(): Promise<void> {
    // DeepSeek doesn't have a dedicated ping endpoint
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
    const model = request.model || 'deepseek-chat';

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    // DeepSeek uses OpenAI-compatible format
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials!.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: parameters.maxTokens || 8192,
        temperature: parameters.temperature ?? 1,
        // Note: DeepSeek does NOT support web search
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
      choices: Array<{
        message: { content: string; reasoning_content?: string };
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const modelInfo = this.getModelInfo(model);
    const inputCostRate = modelInfo?.pricing?.inputCost ?? 0.00014 / 1000;
    const outputCostRate = modelInfo?.pricing?.outputCost ?? 0.00028 / 1000;
    const estimatedCost = CostCalculator.forTokens(
      inputCostRate,
      outputCostRate,
      data.usage.prompt_tokens,
      data.usage.completion_tokens
    );

    // Get response content
    const responseMessage = data.choices[0]?.message;
    const responseText = responseMessage?.content || '';

    // For reasoning models, include reasoning content in metadata
    const metadata: Record<string, unknown> = {};
    if (responseMessage?.reasoning_content) {
      metadata.reasoningContent = responseMessage.reasoning_content;
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
