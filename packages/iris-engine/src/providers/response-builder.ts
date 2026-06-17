/**
 * Parallax Iris - Response Builder
 * Fluent API for building standardized AIResponse objects
 * Eliminates duplicated response construction across all adapters
 */

import {
  AIResponse,
  AIRequest,
  GeneratedOutput,
  ProviderName,
} from '../types.js';

// ============================================================
// TYPES
// ============================================================

export interface ResponseMetadata {
  provider: ProviderName;
  model: string;
  duration: number;
  requestId?: string;
}

export interface BuilderUsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  units?: number;
  durationSeconds?: number;
  estimatedCost: number;
}

// ============================================================
// RESPONSE BUILDER CLASS
// ============================================================

/**
 * Fluent builder for AIResponse objects
 *
 * @example
 * // Success response
 * return ResponseBuilder.success()
 *   .outputs([{ type: 'image', url: '...' }])
 *   .usage({ units: 1, estimatedCost: 0.04 })
 *   .metadata(this.name, request.model, startTime)
 *   .build();
 *
 * @example
 * // Error response
 * return ResponseBuilder.error('API_ERROR', 'Something went wrong')
 *   .retryable(true)
 *   .metadata(this.name, request.model, startTime)
 *   .build();
 */
export class ResponseBuilder {
  private response: Partial<AIResponse> = {};

  private constructor() {}

  // ============================================================
  // STATIC FACTORY METHODS
  // ============================================================

  /**
   * Start building a success response
   */
  static success(): ResponseBuilder {
    const builder = new ResponseBuilder();
    builder.response.success = true;
    builder.response.outputs = [];
    builder.response.usage = { estimatedCost: 0 };
    return builder;
  }

  /**
   * Start building an error response
   */
  static error(code: string, message: string): ResponseBuilder {
    const builder = new ResponseBuilder();
    builder.response.success = false;
    builder.response.outputs = [];
    builder.response.usage = { estimatedCost: 0 };
    builder.response.error = {
      code,
      message,
      retryable: false,
    };
    return builder;
  }

  // ============================================================
  // BUILDER METHODS
  // ============================================================

  /**
   * Set the outputs
   */
  outputs(outputs: GeneratedOutput[]): ResponseBuilder {
    this.response.outputs = outputs;
    return this;
  }

  /**
   * Add a single output
   */
  addOutput(output: GeneratedOutput): ResponseBuilder {
    if (!this.response.outputs) {
      this.response.outputs = [];
    }
    this.response.outputs.push(output);
    return this;
  }

  /**
   * Set usage information
   */
  usage(usage: Partial<BuilderUsageInfo>): ResponseBuilder {
    this.response.usage = {
      ...this.response.usage,
      ...usage,
      estimatedCost:
        usage.estimatedCost ?? this.response.usage?.estimatedCost ?? 0,
    };
    return this;
  }

  /**
   * Set metadata
   */
  metadata(
    provider: ProviderName,
    model: string,
    startTime: number,
    requestId?: string
  ): ResponseBuilder {
    this.response.metadata = {
      provider,
      model,
      duration: Date.now() - startTime,
      requestId,
    };
    return this;
  }

  /**
   * Set raw response for debugging
   */
  rawResponse(data: unknown): ResponseBuilder {
    this.response.rawResponse = data;
    return this;
  }

  /**
   * Set retryable flag (for error responses)
   */
  retryable(retryable: boolean, retryAfter?: number): ResponseBuilder {
    if (this.response.error) {
      this.response.error.retryable = retryable;
      if (retryAfter !== undefined) {
        this.response.error.retryAfter = retryAfter;
      }
    }
    return this;
  }

  /**
   * Build the final response
   */
  build(): AIResponse {
    return this.response as AIResponse;
  }

  // ============================================================
  // CONVENIENCE STATIC METHODS
  // ============================================================

  /**
   * Create a validation error response
   */
  static validationError(
    field: string,
    message: string,
    provider: ProviderName,
    model: string,
    startTime: number
  ): AIResponse {
    return ResponseBuilder.error('VALIDATION_ERROR', `${field}: ${message}`)
      .metadata(provider, model, startTime)
      .build();
  }

  /**
   * Create a missing input error response
   */
  static missingInput(
    inputName: string,
    capability: string,
    provider: ProviderName,
    model: string,
    startTime: number
  ): AIResponse {
    return ResponseBuilder.error(
      'MISSING_INPUT',
      `${inputName} is required for ${capability}`
    )
      .metadata(provider, model, startTime)
      .build();
  }

  /**
   * Create an unsupported capability error response
   */
  static unsupportedCapability(
    capability: string,
    provider: ProviderName,
    model: string,
    startTime: number
  ): AIResponse {
    return ResponseBuilder.error(
      'UNSUPPORTED_CAPABILITY',
      `Capability ${capability} is not supported by ${provider}`
    )
      .metadata(provider, model, startTime)
      .build();
  }

  /**
   * Create an API error response
   */
  static apiError(
    provider: ProviderName,
    status: number,
    errorMessage: string,
    model: string,
    startTime: number
  ): AIResponse {
    const code = `${provider.toUpperCase()}_API_ERROR`;
    const isRetryable = status >= 500 || status === 429;
    const retryAfter = status === 429 ? 60 : undefined;

    return ResponseBuilder.error(
      code,
      `${provider} API error: ${status} - ${errorMessage}`
    )
      .retryable(isRetryable, retryAfter)
      .metadata(provider, model, startTime)
      .build();
  }

  /**
   * Create an empty response error
   */
  static emptyResponse(
    outputType: string,
    provider: ProviderName,
    model: string,
    startTime: number,
    rawResponse?: unknown
  ): AIResponse {
    const builder = ResponseBuilder.error(
      'EMPTY_RESPONSE',
      `No ${outputType} was generated. The API returned an empty response.`
    )
      .retryable(true)
      .metadata(provider, model, startTime);

    if (rawResponse) {
      builder.rawResponse(rawResponse);
    }

    return builder.build();
  }

  /**
   * Create a generic provider error response
   */
  static providerError(
    provider: ProviderName,
    error: Error | string,
    model: string,
    startTime: number
  ): AIResponse {
    const message = error instanceof Error ? error.message : error;
    return ResponseBuilder.error(`${provider.toUpperCase()}_ERROR`, message)
      .metadata(provider, model, startTime)
      .build();
  }
}

// ============================================================
// OUTPUT BUILDERS
// ============================================================

/**
 * Helper functions to create GeneratedOutput objects
 */
export const OutputBuilder = {
  /**
   * Create an image output
   */
  image(options: {
    url?: string;
    base64?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    format?: string;
    metadata?: Record<string, unknown>;
  }): GeneratedOutput {
    return {
      type: 'image',
      url: options.url,
      base64: options.base64,
      width: options.width,
      height: options.height,
      metadata: {
        mimeType: options.mimeType || 'image/png',
        format: options.format || 'png',
        ...options.metadata,
      },
    };
  },

  /**
   * Create a video output
   */
  video(options: {
    url?: string;
    base64?: string;
    duration?: number;
    mimeType?: string;
    format?: string;
    metadata?: Record<string, unknown>;
  }): GeneratedOutput {
    return {
      type: 'video',
      url: options.url,
      base64: options.base64,
      duration: options.duration,
      metadata: {
        mimeType: options.mimeType || 'video/mp4',
        format: options.format || 'mp4',
        duration: options.duration,
        ...options.metadata,
      },
    };
  },

  /**
   * Create a text output
   */
  text(text: string, metadata?: Record<string, unknown>): GeneratedOutput {
    return {
      type: 'text',
      text,
      metadata,
    };
  },

  /**
   * Create an audio output
   */
  audio(options: {
    url?: string;
    base64?: string;
    duration?: number;
    mimeType?: string;
    format?: string;
    metadata?: Record<string, unknown>;
  }): GeneratedOutput {
    return {
      type: 'audio',
      url: options.url,
      base64: options.base64,
      duration: options.duration,
      metadata: {
        mimeType: options.mimeType || 'audio/mpeg',
        format: options.format || 'mp3',
        ...options.metadata,
      },
    };
  },
};

// ============================================================
// COST CALCULATOR
// ============================================================

/**
 * Helper to calculate estimated costs
 */
export const CostCalculator = {
  /**
   * Calculate cost for image generation
   */
  forImages(costPerImage: number, count: number): number {
    return costPerImage * count;
  },

  /**
   * Calculate cost for video generation (per second)
   */
  forVideo(costPerSecond: number, durationSeconds: number): number {
    return costPerSecond * durationSeconds;
  },

  /**
   * Calculate cost for tokens (LLM)
   */
  forTokens(
    inputCostPerToken: number,
    outputCostPerToken: number,
    inputTokens: number,
    outputTokens: number
  ): number {
    return inputCostPerToken * inputTokens + outputCostPerToken * outputTokens;
  },

  /**
   * Calculate cost for audio (per second or per character)
   */
  forAudio(costPerUnit: number, units: number): number {
    return costPerUnit * units;
  },
};

// ============================================================
// INPUT VALIDATORS
// ============================================================

/**
 * Input validation helpers that return early error responses
 */
export const InputValidator = {
  /**
   * Require an image input, return error response if missing
   */
  requireImage(
    request: AIRequest,
    provider: ProviderName,
    startTime: number
  ): AIResponse | null {
    if (!request.inputImage) {
      return ResponseBuilder.missingInput(
        'Input image',
        request.capability,
        provider,
        request.model,
        startTime
      );
    }
    return null;
  },

  /**
   * Require a video input, return error response if missing
   */
  requireVideo(
    request: AIRequest,
    provider: ProviderName,
    startTime: number
  ): AIResponse | null {
    if (!request.inputVideo) {
      return ResponseBuilder.missingInput(
        'Input video',
        request.capability,
        provider,
        request.model,
        startTime
      );
    }
    return null;
  },

  /**
   * Require an audio input, return error response if missing
   */
  requireAudio(
    request: AIRequest,
    provider: ProviderName,
    startTime: number
  ): AIResponse | null {
    if (!request.inputAudio) {
      return ResponseBuilder.missingInput(
        'Audio input',
        request.capability,
        provider,
        request.model,
        startTime
      );
    }
    return null;
  },

  /**
   * Require a prompt, return error response if missing
   */
  requirePrompt(
    request: AIRequest,
    provider: ProviderName,
    startTime: number
  ): AIResponse | null {
    if (!request.prompt) {
      return ResponseBuilder.missingInput(
        'Prompt',
        request.capability,
        provider,
        request.model,
        startTime
      );
    }
    return null;
  },

  /**
   * Require a mask image, return error response if missing
   */
  requireMask(
    request: AIRequest,
    provider: ProviderName,
    startTime: number
  ): AIResponse | null {
    if (!request.maskImage) {
      return ResponseBuilder.missingInput(
        'Mask image',
        request.capability,
        provider,
        request.model,
        startTime
      );
    }
    return null;
  },
};
