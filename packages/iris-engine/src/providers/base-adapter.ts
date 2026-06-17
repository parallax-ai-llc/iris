/**
 * Parallax Iris - Base Provider Adapter
 * Abstract class for all AI provider adapters
 */

import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
  ProviderCredentials,
  ValidationResult,
  ValidationIssue,
  HealthStatus,
} from '../types.js';
import {
  ProviderNotConfiguredError,
  ProviderApiError,
  ProviderRateLimitedError,
} from '../errors.js';

export interface IProviderAdapter {
  /** Provider name */
  readonly name: ProviderName;

  /** Supported capabilities */
  readonly capabilities: AICapability[];

  /** Available models */
  readonly models: ModelInfo[];

  /** Initialize adapter with credentials */
  initialize(credentials: ProviderCredentials): Promise<void>;

  /** Check if adapter supports a capability */
  supportsCapability(capability: AICapability): boolean;

  /** Execute an AI request */
  execute(request: AIRequest): Promise<AIResponse>;

  /** Get model information */
  getModelInfo(modelId: string): ModelInfo | undefined;

  /** Validate request before execution */
  validateRequest(request: AIRequest): ValidationResult;

  /** Get estimated cost before execution */
  estimateCost(request: AIRequest): number;

  /** Cancel an ongoing request (if supported) */
  cancel?(requestId: string): Promise<boolean>;

  /** Check API health/status */
  healthCheck(): Promise<HealthStatus>;
}

export abstract class BaseProviderAdapter implements IProviderAdapter {
  abstract readonly name: ProviderName;
  abstract readonly capabilities: AICapability[];
  abstract readonly models: ModelInfo[];

  protected credentials?: ProviderCredentials;
  protected isInitialized = false;
  protected baseUrl: string = '';

  /**
   * Initialize adapter with credentials
   */
  async initialize(credentials: ProviderCredentials): Promise<void> {
    this.credentials = credentials;
    await this.validateCredentials();
    this.isInitialized = true;
  }

  /**
   * Validate credentials - must be implemented by subclasses
   */
  protected abstract validateCredentials(): Promise<void>;

  /**
   * Check if the adapter supports a capability
   */
  supportsCapability(capability: AICapability): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Get model information by ID
   */
  getModelInfo(modelId: string): ModelInfo | undefined {
    return this.models.find(m => m.id === modelId);
  }

  /**
   * Validate a request before execution
   */
  validateRequest(request: AIRequest): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: string[] = [];

    // Check initialization
    if (!this.isInitialized) {
      errors.push({
        field: 'credentials',
        message: `${this.name} adapter not initialized`,
        code: 'NOT_INITIALIZED',
      });
      return { valid: false, errors, warnings };
    }

    // Check capability support
    if (!this.supportsCapability(request.capability)) {
      errors.push({
        field: 'capability',
        message: `${this.name} does not support ${request.capability}`,
        code: 'UNSUPPORTED_CAPABILITY',
      });
    }

    // Check model exists
    const model = this.getModelInfo(request.model);
    if (!model) {
      errors.push({
        field: 'model',
        message: `Model ${request.model} not found for ${this.name}`,
        code: 'UNKNOWN_MODEL',
      });
    } else {
      // Check model supports the capability
      if (!model.capabilities.includes(request.capability)) {
        errors.push({
          field: 'model',
          message: `Model ${request.model} does not support ${request.capability}`,
          code: 'MODEL_CAPABILITY_MISMATCH',
        });
      }
    }

    // Validate required inputs based on capability
    this.validateInputs(request, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate inputs - can be overridden by subclasses
   */
  protected validateInputs(
    request: AIRequest,
    errors: ValidationIssue[],
    _warnings: string[]
  ): void {
    // Basic validation based on capability
    switch (request.capability) {
      case 'text-to-image':
      case 'text-to-video':
      case 'text-to-text':
      case 'text-to-music':
        if (!request.prompt) {
          errors.push({
            field: 'prompt',
            message: 'Prompt is required',
            code: 'MISSING_PROMPT',
          });
        }
        break;

      case 'image-to-image':
      case 'image-to-video':
      case 'image-upscale':
      case 'background-remove':
        if (
          !request.inputImage &&
          (!request.inputImages || request.inputImages.length === 0)
        ) {
          errors.push({
            field: 'inputImage',
            message: 'Input image is required',
            code: 'MISSING_INPUT_IMAGE',
          });
        }
        break;

      case 'inpaint':
        if (!request.inputImage) {
          errors.push({
            field: 'inputImage',
            message: 'Input image is required',
            code: 'MISSING_INPUT_IMAGE',
          });
        }
        if (!request.maskImage) {
          errors.push({
            field: 'maskImage',
            message: 'Mask image is required for inpainting',
            code: 'MISSING_MASK_IMAGE',
          });
        }
        if (!request.prompt) {
          errors.push({
            field: 'prompt',
            message: 'Prompt is required for inpainting',
            code: 'MISSING_PROMPT',
          });
        }
        break;

      case 'text-to-speech':
        if (!request.prompt) {
          errors.push({
            field: 'prompt',
            message: 'Text input is required',
            code: 'MISSING_TEXT',
          });
        }
        break;

      case 'speech-to-text':
        if (!request.inputAudio) {
          errors.push({
            field: 'inputAudio',
            message: 'Audio input is required',
            code: 'MISSING_INPUT_AUDIO',
          });
        }
        break;

      case 'style-transfer':
        if (!request.inputImage) {
          errors.push({
            field: 'inputImage',
            message: 'Content image is required',
            code: 'MISSING_INPUT_IMAGE',
          });
        }
        if (!request.inputImages || request.inputImages.length === 0) {
          errors.push({
            field: 'inputImages',
            message: 'Style reference image is required',
            code: 'MISSING_STYLE_IMAGE',
          });
        }
        break;
    }
  }

  /**
   * Execute the request - must be implemented by subclasses
   */
  abstract execute(request: AIRequest): Promise<AIResponse>;

  /**
   * Estimate cost for a request
   */
  estimateCost(request: AIRequest): number {
    const model = this.getModelInfo(request.model);
    if (!model?.pricing) return 0;

    // Base estimation - can be overridden by subclasses
    return model.pricing.inputCost + model.pricing.outputCost;
  }

  /**
   * Health check - can be overridden by subclasses
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.isInitialized) {
      return {
        healthy: false,
        message: 'Adapter not initialized',
      };
    }

    try {
      const start = Date.now();
      await this.pingApi();
      return {
        healthy: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Ping API to check health - must be implemented by subclasses
   */
  protected abstract pingApi(): Promise<void>;

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Ensure adapter is initialized
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized || !this.credentials) {
      throw new ProviderNotConfiguredError(this.name);
    }
  }

  /**
   * Make an HTTP request to the provider API
   */
  protected async fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    this.ensureInitialized();

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth header based on credential type
    if (this.credentials?.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    } else if (this.credentials?.accessToken) {
      headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return response.json();
  }

  /**
   * Handle API error responses
   */
  protected async handleApiError(response: Response): Promise<never> {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }

    // Log full error response for debugging
    console.error(`[${this.name}] API Error Response:`, {
      status: response.status,
      statusText: response.statusText,
      errorData: JSON.stringify(errorData, null, 2),
    });

    let errorMessage: string;
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;
      // Handle OpenAI format: {error: {message: "...", type: "..."}}
      if (data.error && typeof data.error === 'object') {
        const errorObj = data.error as Record<string, unknown>;
        errorMessage = String(errorObj.message || JSON.stringify(errorObj));
      } else {
        errorMessage = String(
          data.message || data.error || JSON.stringify(errorData)
        );
      }
    } else {
      errorMessage = String(errorData);
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new ProviderRateLimitedError(
        this.name,
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    throw new ProviderApiError(this.name, String(errorMessage), errorData);
  }

  /**
   * Poll for async operation completion
   */
  protected async pollForCompletion<T>(
    checkStatus: () => Promise<{
      completed: boolean;
      result?: T;
      error?: string;
    }>,
    options: {
      interval?: number;
      maxWait?: number;
      onProgress?: (status: string) => void;
    } = {}
  ): Promise<T> {
    const { interval = 2000, maxWait = 300000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await checkStatus();

      if (status.completed) {
        if (status.error) {
          throw new ProviderApiError(this.name, status.error);
        }
        return status.result as T;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new ProviderApiError(this.name, 'Operation timed out');
  }

  /**
   * Create error response
   */
  protected createErrorResponse(
    error: Error,
    request: AIRequest,
    startTime: number
  ): AIResponse {
    const isRateLimited = error instanceof ProviderRateLimitedError;

    return {
      success: false,
      outputs: [],
      usage: { estimatedCost: 0 },
      error: {
        code: isRateLimited ? 'RATE_LIMITED' : 'EXECUTION_ERROR',
        message: error.message,
        retryable: isRateLimited,
        retryAfter: isRateLimited ? error.retryAfter : undefined,
      },
      metadata: {
        provider: this.name,
        model: request.model,
        duration: Date.now() - startTime,
      },
    };
  }
}
