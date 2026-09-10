/**
 * Parallax Iris - DeepSeek Provider Adapter
 * Supports: text-to-text (DeepSeek V4.1 Flash)
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

  // DeepSeek retired the `deepseek-chat` and `deepseek-reasoner` model
  // names at 2026-07-24 15:59 UTC; every call since then errors out. Both
  // entries were deleted rather than given a `deprecated` window because
  // that sunset is already past — see the ModelInfo.deprecated contract in
  // ../types.ts.
  //
  // V4.1 Flash absorbs both roles: it reasons natively (so the
  // `reasoning_content` handling below still applies) and is served by
  // `deepseek-flash`, DeepSeek's rolling alias for the current Flash
  // checkpoint — the legacy `deepseek-v4-flash` name resolves to the same
  // model. Rename the entry if DeepSeek moves the alias to a newer Flash
  // generation. `deepseek-v4-pro` is deliberately not listed: from
  // 2026-09-14 04:00 UTC every Pro request is routed to V4.1 Flash and
  // billed at Flash rates, so it would duplicate this entry at a dead id.
  //
  // Pricing is DeepSeek's **peak** cache-miss rate ($0.30 in / $1.20 out
  // per 1M tokens). Off-peak (outside 01:00-04:00 and 06:00-10:00 UTC,
  // Mon-Fri) is half of it, but CostCalculator has no time-of-day
  // awareness, so the peak rate is the side that never under-reports what
  // a run cost.
  //
  // Verified 2026-09-10 against
  // https://api-docs.deepseek.com/quick_start/pricing
  readonly models: ModelInfo[] = [
    {
      id: 'deepseek-flash',
      name: 'DeepSeek V4.1 Flash',
      provider: 'deepseek',
      capabilities: ['text-to-text'],
      inputTypes: ['text'],
      outputTypes: ['text'],
      constraints: {
        // Context window, as elsewhere in this adapter. V4.1 Flash also
        // raises the output cap to 384K, well above the 8192 default below.
        maxTokens: 1000000,
      },
      pricing: {
        unit: 'token',
        inputCost: 0.0003 / 1000,
        outputCost: 0.0012 / 1000,
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
    const model = request.model || 'deepseek-flash';

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
    const inputCostRate = modelInfo?.pricing?.inputCost ?? 0.0003 / 1000;
    const outputCostRate = modelInfo?.pricing?.outputCost ?? 0.0012 / 1000;
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
