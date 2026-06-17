/**
 * Parallax Iris - Node Executor
 * Handles execution of individual nodes based on their type
 */

import type { HeaderEntry } from 'iris-nodes';
import { NODE_DEFINITIONS as SHARED_NODE_DEFINITIONS } from 'iris-nodes';
import {
  NodeDefinition,
  NodeResult,
  AssetReference,
  AIRequest,
  UsageInfo,
  AICapability,
} from './types.js';
import type { IrisNodeType } from './types.js';
import { createAdapter } from './providers/index.js';
import type { NodeExecutorHost, PublicStoreSource } from './node-host.js';
import { AppError } from './app-error.js';
import { fetchMediaAsBuffer } from './media-source.js';
import sharp from 'sharp';
import {
  DEFAULT_NODE_CONFIGS,
  getApiKeyForProvider,
  mapKlingModelToReplicate,
  validateKlingModelForTextToVideo,
} from './node-executor-config.js';

/**
 * Node type → category mapping, derived from the canonical iris-nodes catalog.
 * iris-nodes uses uppercase category names ('GENERATOR'); the executor's
 * routing expects lowercase ('generator'). Kept module-local (not re-exported
 * from the engine root) so it doesn't collide with the server's own
 * `iris.constants.NODE_TYPE_CATEGORY`.
 */
const NODE_TYPE_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(SHARED_NODE_DEFINITIONS).map(([type, def]) => [
    type,
    def.category.toLowerCase(),
  ])
);
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { JSONPath } from 'jsonpath-plus';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export interface NodeExecutionInput {
  node: NodeDefinition;
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  context: {
    executionId: string;
    workflowId: string;
    userId: string;
  };
}

export class NodeExecutor {
  private readonly host: NodeExecutorHost;

  /**
   * The node executor runs entirely against the engine's host seam (storage /
   * assets / workflow / usage / transcription + optional heavy node handlers).
   * Each host supplies its own implementation — the Parallax cloud builds one
   * from Prisma + GCS via `createServerNodeHost`, a local host wires disk + a
   * no-op meter. The executor never touches a server runtime directly.
   */
  constructor(host: NodeExecutorHost) {
    this.host = host;
  }

  /**
   * Read a config field, falling back from top-level to nodeConfig.settings.
   *
   * The editor UI saves every configField under nodeConfig.settings.{name}
   * (see web/store/iris-editor.ts updateNodeSettings). Older payloads / programmatic
   * inserts may have the value at the top level, so we look at both places.
   */
  private pickConfigField<T = unknown>(
    config: Record<string, unknown>,
    name: string
  ): T | undefined {
    const top = config[name];
    if (top !== undefined) return top as T;
    const settings = config.settings as Record<string, unknown> | undefined;
    return settings?.[name] as T | undefined;
  }

  /**
   * Execute a node and return the result
   */
  async execute(input: NodeExecutionInput): Promise<NodeResult> {
    const { node, inputs, variables, context } = input;
    const startTime = Date.now();

    try {
      // Route to appropriate handler based on node type category
      const category = NODE_TYPE_CATEGORY[node.type];

      // Check token balance for generator and analyzer nodes BEFORE execution
      if (category === 'generator' || category === 'analyzer') {
        const defaults = DEFAULT_NODE_CONFIGS[node.type];
        const modelId =
          this.pickConfigField<string>(node.config, 'model') || defaults?.model;
        const duration =
          this.pickConfigField<number>(node.config, 'duration') ??
          ((node.config.parameters as Record<string, unknown>)?.duration as
            | number
            | undefined);
        const promptText = (inputs.prompt || inputs.text || '') as string;
        const tokenCheck = await this.host.usage.checkNodeTokens(
          context.userId,
          node.type,
          modelId,
          { durationSeconds: duration, textLength: promptText.length }
        );

        if (!tokenCheck.allowed) {
          return {
            nodeId: node.nodeId,
            status: 'failed',
            outputs: {},
            assets: [],
            duration: Date.now() - startTime,
            error: {
              message: tokenCheck.message ?? 'Insufficient tokens',
              code: 'INSUFFICIENT_TOKENS',
              requiredTokens: tokenCheck.requiredTokens,
              remainingTokens: tokenCheck.remainingTokens,
            },
          };
        }
      }

      let result: {
        outputs: Record<string, unknown>;
        assets: AssetReference[];
        usage?: UsageInfo;
      };

      switch (category) {
        case 'trigger':
          result = await this.executeTrigger(node, inputs, variables);
          break;
        case 'generator':
          result = await this.executeGenerator(
            node,
            inputs,
            variables,
            context
          );
          break;
        case 'analyzer':
          result = await this.executeAnalyzer(node, inputs, variables, context);
          break;
        case 'editor':
          result = await this.executeEditor(node, inputs, variables, context);
          // Consume tokens for AI-powered editor nodes
          if (this.isAIEditorNode(node.type)) {
            const editorModel = this.pickConfigField<string>(
              node.config,
              'model'
            );
            const editorPrompt = (inputs.prompt || '') as string;
            const editorTokens = await this.host.usage.consumeNodeTokens(
              context.userId,
              node.type,
              editorModel,
              { textLength: editorPrompt.length }
            );
            result.usage = { estimatedCost: 0, tokensConsumed: editorTokens };
          }
          break;
        case 'utility':
          result = await this.executeUtility(node, inputs, variables);
          break;
        case 'web':
          // WEB category nodes (WEB_SEARCH, future WEB_SCRAPER…) share the
          // utility executor's dispatch table; their cost accounting comes
          // back via `result.usage.estimatedCost` like generators do.
          result = await this.executeUtility(node, inputs, variables);
          break;
        case 'output':
          result = await this.executeOutput(node, inputs, variables, context);
          break;
        default:
          throw new Error(`Unknown node category for type: ${node.type}`);
      }

      // Consume tokens after successful execution for generator and analyzer nodes
      let tokensConsumed = 0;
      if (category === 'generator' || category === 'analyzer') {
        const defaults = DEFAULT_NODE_CONFIGS[node.type];
        const effectiveModelId =
          this.pickConfigField<string>(node.config, 'model') || defaults?.model;
        const duration =
          result.usage?.durationSeconds ??
          this.pickConfigField<number>(node.config, 'duration') ??
          ((node.config.parameters as Record<string, unknown>)?.duration as
            | number
            | undefined);
        const promptText = (inputs.prompt || inputs.text || '') as string;
        tokensConsumed = await this.host.usage.consumeNodeTokens(
          context.userId,
          node.type,
          effectiveModelId,
          { durationSeconds: duration, textLength: promptText.length }
        );
      } else if (category === 'web') {
        // WEB nodes return a USD cost (e.g. WEB_SEARCH adapter returns
        // $0.005 on cache miss, $0 on hit). Convert via the project-wide
        // ratio defined in docs/plan/IRIS_NODES_EXPANSION_PLAN.md §11:
        //   1 vendor USD ≈ 130,039 tokens deducted.
        const usdCost = result.usage?.estimatedCost ?? 0;
        if (usdCost > 0) {
          const tokens = Math.ceil(usdCost * 130_039);
          try {
            await this.host.usage.addTokensToCurrentPeriod(
              context.userId,
              tokens
            );
            tokensConsumed = tokens;
          } catch (err) {
            // Token deduction failures shouldn't kill the workflow — log and
            // surface zero so the engine moves on.
            console.error(
              '[NodeExecutor] WEB token deduction failed',
              (err as Error).message
            );
          }
        }
      }

      // Include token cost in usage info
      const usage: UsageInfo = {
        ...result.usage,
        estimatedCost: result.usage?.estimatedCost ?? 0,
        tokensConsumed,
      };

      return {
        nodeId: node.nodeId,
        status: 'completed',
        outputs: result.outputs,
        assets: result.assets,
        usage,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        nodeId: node.nodeId,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: (error as Error).message,
          code: 'EXECUTION_ERROR',
          stack: (error as Error).stack,
        },
      };
    }
  }

  /**
   * Execute trigger nodes
   */
  private async executeTrigger(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    // Trigger nodes pass through their configuration and user inputs
    const outputs: Record<string, unknown> = {
      trigger: true,
    };

    // For manual triggers, output the user's input value based on input type
    // This comes from variables._triggerInput which is set from trigger.data.inputValue
    // For batch jobs, variables can contain mapped columns like { prompt: "...", text: "..." }
    if (node.type === 'TRIGGER_MANUAL') {
      const inputType = variables._triggerType ?? 'text';

      // When inputType is 'none', emit only the trigger signal (no payload fields)
      if (inputType !== 'none') {
        // Try multiple sources for text input: _triggerInput, prompt, text, inputs.text
        const userInput =
          variables._triggerInput ??
          variables.prompt ??
          variables.text ??
          inputs.text ??
          '';
        // For image input from batch: imageUrl or image variable
        const imageInput =
          variables.imageUrl ?? variables.image ?? inputs.image ?? null;

        // Output to all relevant ports so connections work regardless of type
        outputs.text = inputType === 'text' ? userInput : '';
        outputs.prompt = inputType === 'text' ? userInput : ''; // Also expose as 'prompt' for convenience
        outputs.image = inputType === 'image' ? imageInput : imageInput || null;
        outputs.file =
          inputType === 'file' ? (variables.file ?? inputs.file ?? null) : null;
      }
    }

    // For schedule triggers, use static input from config
    if (node.type === 'TRIGGER_SCHEDULE') {
      const settings = node.config.settings as
        | Record<string, unknown>
        | undefined;
      const inputType = (settings?.inputType as string) ?? 'text';
      const inputValue = (settings?.inputValue as string) ?? '';

      if (inputType === 'text') {
        outputs.text = inputValue;
        outputs.prompt = inputValue; // Also expose as 'prompt' for convenience
      } else if (inputType === 'image') {
        outputs.image = inputValue;
      }
    }

    // For webhook triggers, include payload
    if (node.type === 'TRIGGER_WEBHOOK') {
      outputs.payload = inputs.payload ?? node.config.payload ?? {};
      // Also expose as text/prompt for LLM nodes
      const payloadText =
        typeof outputs.payload === 'string'
          ? outputs.payload
          : ((outputs.payload as Record<string, unknown>)?.text ?? '');
      outputs.text = payloadText;
      outputs.prompt = payloadText;
    }

    // For directory triggers, include file info
    if (node.type === 'TRIGGER_DIRECTORY') {
      outputs.file = inputs.file ?? null;
    }

    // ─── Phase 3 triggers — passthrough scaffolds ─────────────────────────
    // All three are "entry points" whose payload arrives via an external
    // channel (websocket / form POST / Gmail push). The server route that
    // accepts the channel call stuffs the relevant fields into `variables`
    // before invoking the workflow engine; this handler just forwards them
    // onto the declared output ports so downstream nodes find them in
    // `gatherInputs`.
    //
    // The actual ingestion infrastructure (websocket gateway for CHAT,
    // form submission API for FORM, Gmail Pub/Sub or IMAP poller for
    // EMAIL_RECEIVED) is out of scope here — those are tracked separately
    // in the SERVER.md handoff Phase 3 OAuth/credential section.

    if (node.type === 'TRIGGER_CHAT') {
      outputs.message =
        (variables._triggerMessage as string | undefined) ??
        (variables.message as string | undefined) ??
        (inputs.message as string | undefined) ??
        '';
      outputs.text = outputs.message; // alias for LLM nodes
      outputs.prompt = outputs.message;
      outputs.history =
        (variables._triggerHistory as unknown) ??
        (variables.history as unknown) ??
        [];
      outputs.sessionId =
        (variables._triggerSessionId as string | undefined) ??
        (variables.sessionId as string | undefined) ??
        '';
    }

    if (node.type === 'TRIGGER_FORM') {
      outputs.fields =
        (variables._triggerFields as unknown) ??
        (variables.fields as unknown) ??
        inputs.fields ??
        {};
      outputs.submittedBy =
        (variables._triggerSubmittedBy as string | undefined) ??
        (variables.submittedBy as string | undefined) ??
        '';
    }

    if (node.type === 'TRIGGER_EMAIL_RECEIVED') {
      // Email ingestion places the parsed message under conventional keys
      // (`_triggerEmail.*`). Fall back to top-level so direct invocations
      // (e.g. tests) work without the prefix.
      const triggerEmail = (variables._triggerEmail ?? variables) as Record<
        string,
        unknown
      >;
      outputs.from = triggerEmail.from ?? '';
      outputs.subject = triggerEmail.subject ?? '';
      outputs.body = triggerEmail.body ?? triggerEmail.text ?? '';
      outputs.bodyHtml = triggerEmail.bodyHtml ?? triggerEmail.html ?? '';
      outputs.attachments = triggerEmail.attachments ?? [];
      outputs.messageId = triggerEmail.messageId ?? triggerEmail.id ?? '';
      // Convenience aliases for downstream LLM/analysis nodes.
      outputs.text = outputs.body;
      outputs.prompt = outputs.body;
    }

    return { outputs, assets: [] };
  }

  /**
   * Execute generator nodes (AI-powered)
   */
  private async executeGenerator(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    // Special-case: GEN_VIDEO_SUBTITLE uses Whisper directly, not the AI adapter
    if (node.type === 'GEN_VIDEO_SUBTITLE') {
      return this.executeVideoSubtitleGeneration(node, inputs, context);
    }

    // Phase 3: GEN_LIP_SYNC uses dedicated provider handlers (Replicate-routed
    // SadTalker / Sync-1.6.0 / etc) rather than the unified adapter pipeline.
    if (node.type === 'GEN_LIP_SYNC') {
      return this.executeLipSync(node, inputs, context);
    }

    // GEN_TEXT_TO_TEXT with mode='agent' has its own tool-use loop runtime.
    // Branches off here so the rest of executeGenerator (which assumes a
    // single-shot LLM call) doesn't have to know about iterations / tool
    // dispatch.
    if (node.type === 'GEN_TEXT_TO_TEXT') {
      const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
      const mode = (settings.mode ?? node.config.mode) as string | undefined;
      if (mode === 'agent') {
        return this.executeAgentMode(node, inputs, variables, context);
      }
    }

    // Get provider and model configuration (with fallback to defaults for ANALYZE_* nodes)
    const config = node.config;
    const defaults = DEFAULT_NODE_CONFIGS[node.type];
    const providerName =
      this.pickConfigField<string>(config, 'provider') || defaults?.provider;
    const modelId =
      this.pickConfigField<string>(config, 'model') || defaults?.model;

    if (!providerName || !modelId) {
      throw new Error(
        'Provider and model must be configured for generator nodes'
      );
    }

    // Route Kling provider through Replicate for video generation
    // Kling models are available via Replicate without needing direct Kling API keys
    let effectiveProviderName = providerName.toLowerCase();
    let effectiveModelId = modelId;

    // Determine capability for Kling validation
    const nodeCapability = this.mapNodeTypeToCapability(node.type);
    const isTextToVideo = nodeCapability === 'text-to-video';

    if (effectiveProviderName === 'kling') {
      effectiveProviderName = 'replicate';

      // Validate Kling model for text-to-video capability
      validateKlingModelForTextToVideo(modelId, isTextToVideo);

      // Map Kling model names to Replicate-compatible model IDs
      effectiveModelId = mapKlingModelToReplicate(modelId);
    }

    // Build adapter with effective provider
    const adapter = createAdapter(effectiveProviderName);

    // Get API key from environment variables
    const apiKey = getApiKeyForProvider(effectiveProviderName);
    if (!apiKey) {
      throw new Error(
        `No API key found for provider: ${effectiveProviderName}. Set ${effectiveProviderName.toUpperCase()}_API_KEY environment variable.`
      );
    }
    await adapter.initialize({ apiKey });

    // Build AI request (nodeCapability already computed above for Kling routing)
    // Check multiple possible input names for prompt (prompt, text, input)
    // Also check config.inputs for static input values set in the node config panel
    // Use || instead of ?? to handle both null and undefined values
    const configInputs = (config.inputs as Record<string, unknown>) ?? {};
    const settingsInputs =
      ((config.settings as Record<string, unknown>)?.inputs as Record<
        string,
        unknown
      >) ?? {};

    // Helper to extract value from InputConfig objects (which have { source, value, nodeId, outputName })
    const extractInputValue = (input: unknown): string | undefined => {
      if (!input) return undefined;
      if (typeof input === 'string') return input;
      if (typeof input === 'object' && input !== null) {
        const inputObj = input as Record<string, unknown>;
        // InputConfig format: { source: 'manual', value: 'actual text' }
        if (inputObj.value && typeof inputObj.value === 'string') {
          return inputObj.value;
        }
      }
      return undefined;
    };

    const promptValue =
      inputs.prompt ||
      inputs.text ||
      inputs.input ||
      extractInputValue(configInputs.prompt) ||
      extractInputValue(configInputs.text) ||
      extractInputValue(configInputs.input) ||
      extractInputValue(settingsInputs.prompt) ||
      extractInputValue(settingsInputs.text) ||
      extractInputValue(settingsInputs.input) ||
      config.prompt ||
      config.text;

    // Process JSON inputs (e.g., from HTTP Request node, which may emit parsed objects/arrays)
    // Convert to text-friendly format so downstream LLM APIs receive a plain string
    let processedPrompt: unknown = promptValue;
    if (typeof promptValue === 'string') {
      const trimmed = promptValue.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            processedPrompt = `Here is the data from HTTP request:\n\n${JSON.stringify(parsed, null, 2)}`;
          }
        } catch {
          // Parse failed, use original
        }
      }
    } else if (Array.isArray(promptValue)) {
      processedPrompt = `Here is the data from HTTP request:\n\n${JSON.stringify(promptValue, null, 2)}`;
    } else if (promptValue !== null && typeof promptValue === 'object') {
      processedPrompt = `Here is the data from HTTP request:\n\n${JSON.stringify(promptValue, null, 2)}`;
    } else if (promptValue !== undefined && promptValue !== null) {
      processedPrompt = String(promptValue);
    }

    // Build parameters from config - include TTS-specific params (voice, speed) and other settings.
    // pickConfigField falls back from top-level to nodeConfig.settings to match the
    // editor UI's storage layout (see web/store/iris-editor.ts updateNodeSettings).
    const configParams: Record<string, unknown> = {
      ...((config.parameters as Record<string, unknown>) ?? {}),
      ...((inputs.parameters as Record<string, unknown>) ?? {}),
    };

    // Add TTS-specific parameters from config if present
    const voice = this.pickConfigField<string>(config, 'voice');
    const speed = this.pickConfigField<number>(config, 'speed');
    if (voice) configParams.voice = voice;
    if (speed !== undefined) configParams.speed = speed;
    // Add image generation parameters
    const aspectRatio = this.pickConfigField<string>(config, 'aspectRatio');
    const duration = this.pickConfigField<number>(config, 'duration');
    const cameraAngle = this.pickConfigField<string>(config, 'cameraAngle');
    if (aspectRatio) configParams.aspectRatio = aspectRatio;
    if (duration) configParams.duration = duration;
    if (cameraAngle) configParams.cameraAngle = cameraAngle;
    // Add text generation parameters (use !== undefined so 0 is preserved)
    const temperature = this.pickConfigField<number>(config, 'temperature');
    const maxTokens = this.pickConfigField<number>(config, 'maxTokens');
    if (temperature !== undefined) configParams.temperature = temperature;
    if (maxTokens !== undefined) configParams.maxTokens = maxTokens;
    // Add web search parameter
    const enableWebSearch = this.pickConfigField<boolean>(
      config,
      'enableWebSearch'
    );
    if (enableWebSearch) configParams.enableWebSearch = enableWebSearch;
    // Add speech-to-text parameters
    const language = this.pickConfigField<string>(config, 'language');
    if (language) configParams.language = language;

    const request: AIRequest = {
      capability: nodeCapability,
      model: effectiveModelId,
      prompt: this.resolveValue(processedPrompt, variables) as string,
      negativePrompt: this.resolveValue(
        inputs.negative ?? this.pickConfigField(config, 'negativePrompt'),
        variables
      ) as string | undefined,
      systemPrompt: this.resolveValue(
        this.pickConfigField<string>(config, 'systemPrompt'),
        variables
      ) as string | undefined,
      parameters: configParams,
      metadata: {
        userId: context.userId,
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: node.nodeId,
      },
    };

    // Add image input if needed (convert to public URL for external API access)
    if (inputs.image) {
      request.inputImage = await this.toMediaInputForExternalApi(
        inputs.image,
        context.userId,
        `${effectiveProviderName}-generator`
      );
    }

    // Add document input (treated as image for vision analysis)
    if (inputs.document) {
      request.inputImage = await this.toMediaInputForExternalApi(
        inputs.document,
        context.userId,
        `${effectiveProviderName}-generator`
      );
    }

    // Add mask if needed
    if (inputs.mask) {
      request.maskImage = await this.toMediaInputForExternalApi(
        inputs.mask,
        context.userId,
        `${effectiveProviderName}-generator`
      );
    }

    // Add audio if needed
    if (inputs.audio) {
      request.inputAudio = await this.toMediaInputForExternalApi(
        inputs.audio,
        context.userId,
        `${effectiveProviderName}-generator`
      );
    }

    // Add video if needed
    if (inputs.video) {
      request.inputVideo = await this.toMediaInputForExternalApi(
        inputs.video,
        context.userId,
        `${effectiveProviderName}-generator`
      );
    }

    // Add query input as prompt for analyzers
    if (inputs.query && !request.prompt) {
      request.prompt = inputs.query as string;
    }

    // Handle face swap inputs (source and target images)
    if (node.type === 'GEN_FACE_SWAP' || node.type === 'EDIT_IMAGE_FACE_SWAP') {
      const sourceImage = inputs.source ?? inputs.image;
      const targetImage = inputs.target;
      if (sourceImage && targetImage) {
        request.inputImages = [
          await this.toMediaInputForExternalApi(
            sourceImage,
            context.userId,
            `${effectiveProviderName}-generator`
          ),
          await this.toMediaInputForExternalApi(
            targetImage,
            context.userId,
            `${effectiveProviderName}-generator`
          ),
        ];
      }
    }

    // Handle image-to-video with first/last frame support (Kling)
    if (node.type === 'GEN_IMAGE_TO_VIDEO' && inputs.image) {
      const startFrame = await this.toMediaInputForExternalApi(
        inputs.image,
        context.userId,
        `${effectiveProviderName}-generator`
      );

      // Check for end frame (last frame for Kling first/last frame feature)
      if (inputs.endFrame) {
        const endFrame = await this.toMediaInputForExternalApi(
          inputs.endFrame,
          context.userId,
          `${effectiveProviderName}-generator`
        );
        request.inputImages = [startFrame, endFrame];
        // Clear inputImage since we're using inputImages array
        request.inputImage = undefined;
      } else {
        // Single image (start frame only)
        request.inputImages = [startFrame];
        request.inputImage = undefined;
      }

      // Add mode parameter for Kling (std or pro)
      const mode = config.mode as string;
      if (mode) {
        request.parameters = {
          ...request.parameters,
          mode,
        };
      }
    }

    // Execute request
    const response = await adapter.execute(request);

    if (!response.success) {
      throw new Error(response.error?.message ?? 'Generation failed');
    }

    // Process outputs
    const outputs: Record<string, unknown> = {};
    const assets: AssetReference[] = [];

    // Get output configs for storage paths
    const outputConfigs = config.outputs as
      | Record<string, { storagePath?: string }>
      | undefined;
    const getStoragePath = (outputType: string): string => {
      const outputConfig = outputConfigs?.[outputType];
      return outputConfig?.storagePath || '/';
    };

    for (const output of response.outputs) {
      if (output.type === 'text') {
        outputs.text = output.text;
        outputs.response = output.text;
        // For analyzer nodes, also provide analysis output
        outputs.analysis = output.text;
        // Check for transcription in metadata (for audio analysis)
        const metadata = output.metadata as
          | { transcription?: string }
          | undefined;
        if (metadata?.transcription) {
          outputs.transcription = metadata.transcription;
        }
      } else if (
        output.type === 'image' ||
        output.type === 'video' ||
        output.type === 'audio'
      ) {
        // Use unified storage function for all media types
        const storagePath = getStoragePath(output.type);
        const cleanStoragePath =
          storagePath === '/' ? '/' : storagePath.replace(/^\/|\/$/g, '');

        // Store media using unified function. When the host has no storage,
        // storeOutput returns success:false and the data-URI fallback kicks in.
        if (output.url || output.base64) {
          const storeResult = await this.host.media.storeOutput({
            output: {
              type: output.type,
              url: output.url,
              base64: output.base64,
              metadata: output.metadata,
            },
            userId: context.userId,
            storagePath: cleanStoragePath,
            workflowId: context.workflowId,
            executionId: context.executionId,
            // Use title from metadata for audio (e.g., Suno generated title), fallback to generic name
            baseName:
              output.type === 'audio' &&
              (output.metadata as { title?: string })?.title
                ? (output.metadata as { title?: string }).title!
                : `generated-${output.type}`,
            // AI generation metadata
            prompt: request.prompt,
            negativePrompt: request.negativePrompt,
            model: effectiveModelId,
            provider: effectiveProviderName,
          });

          if (storeResult.success && storeResult.apiUrl && storeResult.asset) {
            // Set output based on type
            if (output.type === 'image') {
              outputs.image = storeResult.apiUrl;
            } else if (output.type === 'video') {
              outputs.video = storeResult.apiUrl;
            } else if (output.type === 'audio') {
              outputs.audio = storeResult.apiUrl;
            }

            // Add to assets
            assets.push({
              id: storeResult.asset.id,
              type: storeResult.assetType || 'IMAGE',
              url: storeResult.apiUrl,
              path: storeResult.asset.path,
              storagePath: storeResult.asset.storagePath || undefined,
              metadata: { ...output.metadata, encrypted: true },
            });
          } else {
            // Fallback to data URI if storage fails
            console.error('[NodeExecutor] Storage failed:', storeResult.error);
            const mimeType =
              (output.metadata as { mimeType?: string })?.mimeType ||
              (output.type === 'video'
                ? 'video/mp4'
                : output.type === 'audio'
                  ? 'audio/mpeg'
                  : 'image/png');

            if (output.base64) {
              const dataUri = `data:${mimeType};base64,${output.base64}`;
              if (output.type === 'image') outputs.image = dataUri;
              else if (output.type === 'video') outputs.video = dataUri;
              else if (output.type === 'audio') outputs.audio = dataUri;
            } else if (output.url) {
              if (output.type === 'image') outputs.image = output.url;
              else if (output.type === 'video') outputs.video = output.url;
              else if (output.type === 'audio') outputs.audio = output.url;
            }
          }
        } else if (output.url) {
          // No storage service, use URL directly
          if (output.type === 'image') outputs.image = output.url;
          else if (output.type === 'video') outputs.video = output.url;
          else if (output.type === 'audio') outputs.audio = output.url;

          assets.push({
            id: `asset-${Date.now()}`,
            type: output.type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'AUDIO',
            url: output.url,
            path: storagePath,
            storagePath,
            metadata: output.metadata,
          });
        }
      }
    }

    return { outputs, assets, usage: response.usage };
  }

  /**
   * Execute analyzer nodes
   */
  private async executeAnalyzer(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    // ─── Phase 2 analyzer short-circuits ─────────────────────────────────
    if (node.type === 'DOC_LONG_CONTEXT') {
      const r = await this.executeDocLongContext(node, inputs);
      return {
        outputs: {
          answer: r.text,
          response: r.text,
          analysis: r.text,
          usedCache: r.cached,
        },
        assets: [],
        usage: {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          estimatedCost: r.estimatedCostUsd,
        },
      };
    }
    if (node.type === 'AI_STRUCTURED_EXTRACT') {
      const r = await this.executeStructuredExtractNode(node, inputs);
      return {
        outputs: { data: r.data, valid: r.valid },
        assets: [],
        usage: {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          estimatedCost: r.estimatedCostUsd,
        },
      };
    }
    if (node.type === 'AI_CATEGORIZE') {
      const r = await this.executeCategorizeNode(node, inputs);
      return {
        outputs: {
          category: r.category,
          categories: r.matched,
          confidence: r.confidence,
        },
        assets: [],
        usage: {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          estimatedCost: r.estimatedCostUsd,
        },
      };
    }
    // Legacy analyzers reuse the generator pipeline (vision models / Whisper).
    return this.executeGenerator(node, inputs, variables, context);
  }

  /**
   * Execute editor nodes
   */
  private async executeEditor(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    _variables: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    // node.config contains type-specific configuration
    const outputs: Record<string, unknown> = {};
    const assets: AssetReference[] = [];

    switch (node.type) {
      case 'EDIT_IMAGE_CROP': {
        // Apply crop using Sharp library
        const imageInput = inputs.image as string;
        if (!imageInput) {
          throw new Error('No image input provided for crop');
        }

        // Get crop parameters from config or inputs
        const cropConfig =
          (node.config.crop as {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }) ?? {};
        const cropX = (inputs.x as number) ?? cropConfig.x ?? 0;
        const cropY = (inputs.y as number) ?? cropConfig.y ?? 0;
        const cropWidth = (inputs.width as number) ?? cropConfig.width;
        const cropHeight = (inputs.height as number) ?? cropConfig.height;

        if (!cropWidth || !cropHeight) {
          throw new Error('Crop width and height are required');
        }

        // Fetch image as buffer
        let dataSource:
          | { type: 'url'; value: string }
          | { type: 'base64'; value: string; mimeType?: string };
        if (imageInput.startsWith('data:')) {
          const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            dataSource = {
              type: 'base64',
              value: match[2],
              mimeType: match[1],
            };
          } else {
            throw new Error('Invalid data URL format');
          }
        } else if (
          imageInput.startsWith('http') ||
          imageInput.startsWith('/api/')
        ) {
          // For relative API URLs, we need to get the actual content
          if (imageInput.startsWith('/api/iris/assets/')) {
            const assetIdMatch = imageInput.match(
              /\/api\/iris\/assets\/([^/]+)/
            );
            if (assetIdMatch) {
              const asset = await this.host.assets.getAssetById(
                assetIdMatch[1]
              );
              if (asset?.storagePath) {
                const downloadResult = await this.host.media.downloadDecrypted({
                  userId: asset.userId,
                  storagePath: asset.storagePath,
                });
                const base64 = downloadResult.buffer.toString('base64');
                dataSource = {
                  type: 'base64',
                  value: base64,
                  mimeType: asset.mimeType || 'image/png',
                };
              } else {
                throw new Error('Asset not found or missing storage path');
              }
            } else {
              throw new Error(
                'Cannot fetch asset: missing storage service or invalid URL'
              );
            }
          } else {
            dataSource = { type: 'url', value: imageInput };
          }
        } else {
          // Assume it's base64 without data URL prefix
          dataSource = { type: 'base64', value: imageInput };
        }

        const fetchResult = await fetchMediaAsBuffer(dataSource);
        if ('error' in fetchResult) {
          throw new Error(`Failed to fetch image: ${fetchResult.error}`);
        }

        // Apply crop using Sharp
        const croppedBuffer = await sharp(fetchResult.buffer)
          .extract({
            left: Math.round(cropX),
            top: Math.round(cropY),
            width: Math.round(cropWidth),
            height: Math.round(cropHeight),
          })
          .toBuffer();

        // Store the cropped image. With no host storage, storeOutput returns
        // success:false and the inner data-URI fallback below handles it.
        {
          const storeResult = await this.host.media.storeOutput({
            output: {
              type: 'image',
              base64: croppedBuffer.toString('base64'),
              metadata: {
                editType: 'crop',
                cropParams: {
                  x: cropX,
                  y: cropY,
                  width: cropWidth,
                  height: cropHeight,
                },
              },
            },
            userId: context.userId,
            storagePath: 'iris/edited',
            workflowId: context.workflowId,
            executionId: context.executionId,
            baseName: 'cropped-image',
          });

          if (storeResult.success && storeResult.apiUrl && storeResult.asset) {
            outputs.image = storeResult.apiUrl;
            assets.push({
              id: storeResult.asset.id,
              type: 'IMAGE',
              url: storeResult.apiUrl,
              path: storeResult.asset.path,
              storagePath: storeResult.asset.storagePath || undefined,
              metadata: { encrypted: true, editType: 'crop' },
            });
          } else {
            // Fallback to base64 data URI
            outputs.image = `data:image/png;base64,${croppedBuffer.toString('base64')}`;
          }
        }
        break;
      }

      case 'EDIT_IMAGE_FILTER': {
        // Apply filter from config.filter - in production, use Sharp or similar
        outputs.image = inputs.image; // Placeholder
        break;
      }

      case 'EDIT_VIDEO_TRIM': {
        // Trim video using config.startTime and config.endTime - use ffmpeg or similar
        outputs.video = inputs.video; // Placeholder
        break;
      }

      case 'EDIT_MASK_DEFINE': {
        // Define mask based on prompt or parameters
        const image = inputs.image as string;
        // Use segmentation model
        outputs.mask = image; // Placeholder - would be mask image
        break;
      }

      // AI-powered image editor nodes - delegate to AI provider
      case 'EDIT_IMAGE_INPAINT':
      case 'EDIT_IMAGE_OUTPAINT':
      case 'EDIT_IMAGE_STYLE':
      case 'EDIT_IMAGE_FACE_SWAP':
      case 'EDIT_IMAGE_BG_REMOVE':
      case 'EDIT_IMAGE_UPSCALE':
      case 'EDIT_IMAGE_SKY_REPLACE':
      case 'EDIT_IMAGE_AUTO_ENHANCE': {
        const capability = this.mapNodeTypeToCapability(node.type);
        const config = node.config;

        // Build AI request - use Google for inpaint (Gemini nano-banana model)
        const isInpaint = node.type === 'EDIT_IMAGE_INPAINT';
        const defaultProvider = isInpaint ? 'google' : 'stability';
        const defaultModel = isInpaint
          ? 'gemini-3-pro-image-preview'
          : 'stable-diffusion-3';

        // Convert inputs to public URLs for external API access (handles encrypted assets)
        const providerNameForUrl =
          this.pickConfigField<string>(config, 'provider') || defaultProvider;
        const imageInput = inputs.image
          ? await this.toMediaInputForExternalApi(
              inputs.image,
              context.userId,
              `${providerNameForUrl}-image`
            )
          : undefined;
        const maskInput = inputs.mask
          ? await this.toMediaInputForExternalApi(
              inputs.mask,
              context.userId,
              `${providerNameForUrl}-image`
            )
          : undefined;

        const aiRequest: AIRequest = {
          capability,
          model: this.pickConfigField<string>(config, 'model') || defaultModel,
          prompt:
            this.pickConfigField<string>(config, 'prompt') ||
            (inputs.prompt as string),
          negativePrompt: this.pickConfigField<string>(
            config,
            'negativePrompt'
          ),
          inputImage: imageInput,
          maskImage: maskInput,
          parameters: {
            direction: this.pickConfigField<string>(config, 'direction'),
            scale: this.pickConfigField<number>(config, 'scale'),
            style: this.pickConfigField<string>(config, 'style'),
            strength: this.pickConfigField<number>(config, 'strength'),
          },
        };

        // Create adapter for the provider
        const providerName =
          this.pickConfigField<string>(config, 'provider') || defaultProvider;
        const adapter = createAdapter(providerName);

        // Initialize adapter with API key
        const apiKey = getApiKeyForProvider(providerName);

        if (!apiKey) {
          throw new Error(
            `API key not configured for provider: ${providerName}`
          );
        }

        await adapter.initialize({ apiKey });

        // Execute AI request
        const aiResponse = await adapter.execute(aiRequest);

        if (!aiResponse.success) {
          throw new Error(aiResponse.error?.message || 'AI execution failed');
        }

        // Map AI outputs to node outputs using unified storage
        for (const output of aiResponse.outputs) {
          if (output.type === 'image' || output.type === 'video') {
            const storeResult = await this.host.media.storeOutput({
              output: {
                type: output.type,
                url: output.url,
                base64: output.base64,
                metadata: { editType: node.type },
              },
              userId: context.userId,
              storagePath: 'iris/edited',
              baseName: `edited-${output.type}`,
              // AI generation metadata for editor nodes
              prompt: aiRequest.prompt,
              negativePrompt: aiRequest.negativePrompt,
              model: aiRequest.model,
              provider: providerName,
            });

            if (
              storeResult.success &&
              storeResult.apiUrl &&
              storeResult.asset
            ) {
              if (output.type === 'image') {
                outputs.image = storeResult.apiUrl;
              } else {
                outputs.video = storeResult.apiUrl;
              }
              assets.push({
                id: storeResult.asset.id,
                type: storeResult.assetType || 'IMAGE',
                url: storeResult.apiUrl,
                path: storeResult.asset.path,
                storagePath: storeResult.asset.storagePath || undefined,
                metadata: { encrypted: true, editType: node.type },
              });
            } else if (output.url) {
              outputs.image = output.url;
            } else if (output.base64) {
              const mimeType =
                output.type === 'video' ? 'video/mp4' : 'image/png';
              outputs.image = `data:${mimeType};base64,${output.base64}`;
            }
          }
        }
        break;
      }

      // Relight - uses fal provider (IC-Light)
      case 'EDIT_IMAGE_RELIGHT': {
        const config = node.config;
        const imageInput = inputs.image
          ? await this.toMediaInputForExternalApi(
              inputs.image,
              context.userId,
              'fal-image'
            )
          : undefined;

        const aiRequest: AIRequest = {
          capability: 'relight',
          model:
            this.pickConfigField<string>(config, 'model') ||
            'fal-ai/iclight-v2',
          prompt:
            this.pickConfigField<string>(config, 'prompt') ||
            (inputs.prompt as string) ||
            'soft natural lighting',
          inputImage: imageInput,
        };

        const relightAdapter = createAdapter('fal');
        const relightApiKey = getApiKeyForProvider('fal');
        if (!relightApiKey)
          throw new Error('API key not configured for provider: fal');
        await relightAdapter.initialize({ apiKey: relightApiKey });

        const relightResponse = await relightAdapter.execute(aiRequest);
        if (!relightResponse.success)
          throw new Error(relightResponse.error?.message || 'Relight failed');

        for (const output of relightResponse.outputs) {
          if (output.type === 'image') {
            const storeResult = await this.host.media.storeOutput({
              output: {
                type: 'image',
                url: output.url,
                base64: output.base64,
                metadata: { editType: node.type },
              },
              userId: context.userId,
              storagePath: 'iris/edited',
              baseName: 'relight',
              prompt: aiRequest.prompt,
              model: aiRequest.model,
              provider: 'fal',
            });
            if (
              storeResult.success &&
              storeResult.apiUrl &&
              storeResult.asset
            ) {
              outputs.image = storeResult.apiUrl;
              assets.push({
                id: storeResult.asset.id,
                type: 'IMAGE',
                url: storeResult.apiUrl,
                path: storeResult.asset.path,
                storagePath: storeResult.asset.storagePath || undefined,
                metadata: { encrypted: true, editType: node.type },
              });
            } else if (output.url) {
              outputs.image = output.url;
            }
          }
        }
        break;
      }

      // AI-powered video editor nodes
      case 'EDIT_VIDEO_UPSCALE':
      case 'EDIT_VIDEO_INPAINT': {
        const capability = this.mapNodeTypeToCapability(node.type);
        const config = node.config;

        // Default to Replicate for video editing
        const defaultModel =
          node.type === 'EDIT_VIDEO_INPAINT'
            ? 'jd7h/propainter'
            : 'topazlabs/video-upscale';

        // Convert inputs to public URLs for external API access (handles encrypted assets)
        const videoInput = inputs.video
          ? await this.toMediaInputForExternalApi(
              inputs.video,
              context.userId,
              'replicate-video'
            )
          : undefined;
        const maskInput = inputs.mask
          ? await this.toMediaInputForExternalApi(
              inputs.mask,
              context.userId,
              'replicate-video'
            )
          : undefined;

        const aiRequest: AIRequest = {
          capability,
          model: this.pickConfigField<string>(config, 'model') || defaultModel,
          prompt:
            this.pickConfigField<string>(config, 'prompt') ||
            (inputs.prompt as string),
          inputVideo: videoInput,
          maskImage: maskInput,
          parameters: {
            dilateRadius: this.pickConfigField<number>(config, 'dilateRadius'),
            targetResolution: this.pickConfigField<string>(
              config,
              'targetResolution'
            ),
            targetFps: this.pickConfigField<string>(config, 'targetFps'),
          },
        };

        // Create adapter for the provider (Replicate for video editing)
        const providerName =
          this.pickConfigField<string>(config, 'provider') || 'replicate';
        const adapter = createAdapter(providerName);

        const apiKey = getApiKeyForProvider('replicate');
        if (!apiKey) {
          throw new Error('Replicate API key not configured');
        }

        await adapter.initialize({ apiKey });

        // Execute AI request
        const aiResponse = await adapter.execute(aiRequest);

        if (!aiResponse.success) {
          throw new Error(aiResponse.error?.message || 'Video editing failed');
        }

        // Map AI outputs to node outputs using unified storage
        for (const output of aiResponse.outputs) {
          if (output.type === 'video') {
            const storeResult = await this.host.media.storeOutput({
              output: {
                type: 'video',
                url: output.url,
                base64: output.base64,
                metadata: { editType: node.type },
              },
              userId: context.userId,
              storagePath: 'iris/edited',
              baseName: 'edited-video',
              // AI generation metadata for video editor nodes
              prompt: aiRequest.prompt,
              model: aiRequest.model,
              provider: providerName,
            });

            if (
              storeResult.success &&
              storeResult.apiUrl &&
              storeResult.asset
            ) {
              outputs.video = storeResult.apiUrl;
              assets.push({
                id: storeResult.asset.id,
                type: 'VIDEO',
                url: storeResult.apiUrl,
                path: storeResult.asset.path,
                storagePath: storeResult.asset.storagePath || undefined,
                metadata: { encrypted: true, editType: node.type },
              });
            } else if (output.url) {
              outputs.video = output.url;
            }
          }
        }
        break;
      }

      // Motion Control - transfer motion from reference video to image
      case 'EDIT_MOTION_CONTROL': {
        const config = node.config;
        const settings = (config.settings as Record<string, unknown>) || {};

        // Convert inputs to public URLs for external API access (handles encrypted assets)
        const refImageInput = inputs.referenceImage
          ? await this.toMediaInputForExternalApi(
              inputs.referenceImage,
              context.userId,
              'replicate-motion'
            )
          : undefined;
        const refVideoInput = inputs.referenceVideo
          ? await this.toMediaInputForExternalApi(
              inputs.referenceVideo,
              context.userId,
              'replicate-motion'
            )
          : undefined;

        // Handle 'auto' orientation: start with 'image', retry with 'video' if duration error
        let characterOrientation =
          (settings.characterOrientation as string) || 'auto';
        const isAutoMode = characterOrientation === 'auto';
        if (isAutoMode) {
          characterOrientation = 'image'; // Start with image mode (max 10s)
        }

        const aiRequest: AIRequest = {
          capability: 'motion-control',
          model: 'kwaivgi/kling-v2.6-motion-control',
          prompt: (settings.prompt as string) || (inputs.prompt as string),
          inputImage: refImageInput,
          inputVideo: refVideoInput,
          parameters: {
            characterOrientation,
            mode: settings.mode || 'std',
            keepOriginalSound: settings.keepOriginalSound !== false,
          },
        };

        // Create Replicate adapter
        const adapter = createAdapter('replicate');
        const apiKey = getApiKeyForProvider('replicate');
        if (!apiKey) {
          throw new Error('Replicate API key not configured');
        }

        await adapter.initialize({ apiKey });

        let aiResponse = await adapter.execute(aiRequest);

        // Auto-retry with 'video' orientation if duration error occurs in auto mode
        if (isAutoMode && !aiResponse.success && aiResponse.error?.message) {
          const errorMessage = aiResponse.error.message.toLowerCase();
          // Check for duration-related errors (e.g., "video duration must not exceed 10 seconds")
          if (
            errorMessage.includes('duration') &&
            errorMessage.includes('10 second')
          ) {
            // Wait 3 seconds to avoid rate limiting (Replicate allows 6 req/min with burst of 1)
            await new Promise(resolve => setTimeout(resolve, 3000));

            aiRequest.parameters = {
              ...aiRequest.parameters,
              characterOrientation: 'video', // Retry with video mode (max 30s)
            };
            aiResponse = await adapter.execute(aiRequest);
          }
        }

        if (!aiResponse.success) {
          throw new Error(aiResponse.error?.message || 'Motion control failed');
        }

        // Map AI outputs to node outputs
        for (const output of aiResponse.outputs) {
          if (output.type === 'video') {
            const storeResult = await this.host.media.storeOutput({
              output: {
                type: 'video',
                url: output.url,
                base64: output.base64,
                metadata: { editType: node.type },
              },
              userId: context.userId,
              storagePath: 'iris/motion-control',
              baseName: 'motion-video',
              // AI generation metadata for motion control
              prompt: aiRequest.prompt,
              model: aiRequest.model,
              provider: 'replicate',
            });

            if (
              storeResult.success &&
              storeResult.apiUrl &&
              storeResult.asset
            ) {
              outputs.video = storeResult.apiUrl;
              assets.push({
                id: storeResult.asset.id,
                type: 'VIDEO',
                url: storeResult.apiUrl,
                path: storeResult.asset.path,
                storagePath: storeResult.asset.storagePath || undefined,
                metadata: { encrypted: true, editType: node.type },
              });
            } else if (output.url) {
              outputs.video = output.url;
            }
          }
        }
        break;
      }

      // ─── Phase 3: media editors ───────────────────────────────────────
      case 'EDIT_VIDEO_MERGE': {
        const r = await this.executeVideoMerge(node, inputs, context);
        Object.assign(outputs, r.outputs);
        assets.push(...r.assets);
        break;
      }
      case 'EDIT_VIDEO_OVERLAY': {
        const r = await this.executeVideoOverlay(node, inputs, context);
        Object.assign(outputs, r.outputs);
        assets.push(...r.assets);
        break;
      }
      case 'EDIT_AUDIO_SEPARATE': {
        const r = await this.executeAudioSeparate(node, inputs, context);
        Object.assign(outputs, r.outputs);
        assets.push(...r.assets);
        break;
      }

      default:
        outputs.result = inputs.image ?? inputs.video ?? inputs.audio;
    }

    return { outputs, assets };
  }

  /**
   * Execute utility nodes
   */
  private async executeUtility(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    const config = node.config;
    const outputs: Record<string, unknown> = {};

    switch (node.type) {
      case 'UTIL_DELAY': {
        const delayMs = (config.delay as number) ?? 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        outputs.output = inputs.input;
        break;
      }

      case 'UTIL_CONDITIONAL': {
        const value = inputs.value;
        const condition = config.condition as string;

        // Simple condition evaluation
        let conditionMet = false;
        try {
          conditionMet = this.evaluateCondition(value, condition, variables);
        } catch {
          conditionMet = Boolean(value);
        }

        outputs.true = conditionMet ? value : null;
        outputs.false = conditionMet ? null : value;
        break;
      }

      case 'UTIL_CONDITION': {
        // iris/iris-desktop's "Condition" node — preset comparison operators
        // (distinct from UTIL_CONDITIONAL, which evaluates a JS expression).
        const settings = config?.settings as
          | Record<string, unknown>
          | undefined;
        const operator =
          ((settings?.condition ?? config.condition) as string) || 'equals';
        const compareValue =
          ((settings?.compareValue ?? config.compareValue) as string) ?? '';
        const value = inputs.input;

        const isEmptyVal = (v: unknown): boolean =>
          v === null ||
          v === undefined ||
          v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (typeof v === 'object' && v !== null && Object.keys(v).length === 0);

        let conditionMet = false;
        try {
          switch (operator) {
            case 'equals':
              conditionMet = String(value ?? '') === String(compareValue);
              break;
            case 'contains':
              conditionMet = String(value ?? '').includes(String(compareValue));
              break;
            case 'startsWith':
              conditionMet = String(value ?? '').startsWith(
                String(compareValue)
              );
              break;
            case 'endsWith':
              conditionMet = String(value ?? '').endsWith(String(compareValue));
              break;
            case 'greaterThan':
              conditionMet = Number(value) > Number(compareValue);
              break;
            case 'lessThan':
              conditionMet = Number(value) < Number(compareValue);
              break;
            case 'isEmpty':
              conditionMet = isEmptyVal(value);
              break;
            case 'isNotEmpty':
              conditionMet = !isEmptyVal(value);
              break;
            default:
              conditionMet = false;
          }
        } catch {
          conditionMet = false;
        }

        outputs.true = conditionMet ? value : null;
        outputs.false = conditionMet ? null : value;
        break;
      }

      case 'UTIL_MERGE': {
        // iris/iris-desktop store config under `settings`; fall back to top-level.
        const settings = config?.settings as
          | Record<string, unknown>
          | undefined;
        const mode = ((settings?.mode ?? config.mode) as string) || 'object';

        const values: unknown[] = [];
        for (const key of ['input1', 'input2', 'input3', 'input4']) {
          const v = inputs[key];
          if (v !== null && v !== undefined) values.push(v);
        }

        switch (mode) {
          case 'array':
            // Always emit an array, even with one element — the node's contract.
            outputs.merged = values;
            break;

          case 'concat':
            // Stringify non-strings so the result is always a single string.
            outputs.merged = values
              .map(v => (typeof v === 'string' ? v : JSON.stringify(v)))
              .join('');
            break;

          case 'object':
          default: {
            // Spread plain objects into a single object. Non-object values are
            // keyed by their input index so nothing is silently dropped.
            const merged: Record<string, unknown> = {};
            values.forEach((v, i) => {
              if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                Object.assign(merged, v as Record<string, unknown>);
              } else {
                merged[`input${i + 1}`] = v;
              }
            });
            outputs.merged = merged;
            break;
          }
        }
        break;
      }

      case 'UTIL_SPLIT': {
        const input = inputs.input;
        if (Array.isArray(input)) {
          outputs.output1 = input[0];
          outputs.output2 = input.slice(1);
        } else if (typeof input === 'string') {
          const parts = input.split((config.separator as string) ?? ',');
          outputs.output1 = parts[0];
          outputs.output2 = parts
            .slice(1)
            .join((config.separator as string) ?? ',');
        } else {
          outputs.output1 = input;
          outputs.output2 = null;
        }
        break;
      }

      case 'UTIL_VARIABLE_SET': {
        const name = config.name as string;
        const value = inputs.value;
        variables[name] = value;
        outputs.value = value;
        break;
      }

      case 'UTIL_VARIABLE_GET': {
        const name = config.name as string;
        outputs.value = variables[name];
        break;
      }

      case 'UTIL_TEMPLATE': {
        const template =
          (inputs.template as string) ?? (config.template as string) ?? '';
        const data = (inputs.data as Record<string, unknown>) ?? {};

        // Simple template replacement
        let result = template;
        for (const [key, value] of Object.entries({ ...variables, ...data })) {
          result = result.replace(
            new RegExp(`\\{${key}\\}`, 'g'),
            String(value)
          );
        }
        outputs.result = result;
        break;
      }

      case 'UTIL_HTTP_REQUEST': {
        const settings = config?.settings as
          | Record<string, unknown>
          | undefined;
        // Do NOT pre-resolve via this.resolveValue here — it would replace
        // unknown {{key}} tokens with empty strings, eating any token that
        // we plan to substitute from pathParams/query below.
        // Coerce the URL: accept plain strings, objects with a `.url` field
        // (common when wired from another node's response), or anything
        // String()-able.
        const rawUrlValue = inputs.url ?? settings?.url ?? config.url;
        let rawUrl: string;
        if (typeof rawUrlValue === 'string') {
          rawUrl = rawUrlValue;
        } else if (
          rawUrlValue !== null &&
          typeof rawUrlValue === 'object' &&
          typeof (rawUrlValue as Record<string, unknown>).url === 'string'
        ) {
          rawUrl = (rawUrlValue as Record<string, unknown>).url as string;
        } else if (rawUrlValue == null) {
          rawUrl = '';
        } else {
          rawUrl = String(rawUrlValue);
        }

        if (!rawUrl) {
          outputs.status = 0;
          outputs.response =
            'No URL provided. Configure it or connect a value to the URL input.';
          outputs.request = {
            url: '',
            method: (settings?.method ?? config.method ?? 'GET') as string,
            headers: {},
            body: null,
          };
          break;
        }
        const method = ((settings?.method ?? config.method) as string) ?? 'GET';
        // Headers may be stored either as an object (legacy) or as an array
        // of `{ key, value, enabled? }` entries (new UI). Coerce to a flat
        // Record<string,string>, dropping entries that are disabled, blank,
        // or have a non-string value.
        const rawHeaders = settings?.headers ?? config.headers;
        const headers: Record<string, string> = {};
        if (Array.isArray(rawHeaders)) {
          for (const entry of rawHeaders as Partial<HeaderEntry>[]) {
            if (!entry || typeof entry !== 'object') continue;
            if (entry.enabled === false) continue;
            const k = typeof entry.key === 'string' ? entry.key.trim() : '';
            if (!k) continue;
            const v = entry.value;
            headers[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
          }
        } else if (rawHeaders && typeof rawHeaders === 'object') {
          for (const [k, v] of Object.entries(
            rawHeaders as Record<string, unknown>
          )) {
            if (!k) continue;
            headers[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
          }
        }
        const body = inputs.body ?? config.body;
        const pathParams = inputs.pathParams;
        const query = inputs.query;

        const isPlainObject = (v: unknown): v is Record<string, unknown> =>
          v !== null && typeof v === 'object' && !Array.isArray(v);

        // Build a key-based substitution map for URL templating. pathParams
        // takes precedence over query on conflict.
        const subs: Record<string, unknown> = {};
        if (isPlainObject(query)) Object.assign(subs, query);
        if (isPlainObject(pathParams)) Object.assign(subs, pathParams);

        // Substitute {{key}} tokens; track which keys were consumed so we
        // don't also emit them in the query string. Falls back to the global
        // variables map (e.g. `loop-id.item`), and leaves unmatched tokens
        // intact for the scalar-fallback pass below.
        const consumed = new Set<string>();
        let url = rawUrl.replace(/\{\{(\w+)\}\}/g, (match, name) => {
          if (Object.prototype.hasOwnProperty.call(subs, name)) {
            consumed.add(name);
            return encodeURIComponent(String(subs[name]));
          }
          if (Object.prototype.hasOwnProperty.call(variables, name)) {
            return encodeURIComponent(String(variables[name]));
          }
          return match;
        });

        // If exactly one token remains AND a scalar was connected to
        // pathParams or query, use it. Makes "loop.item → query" work when
        // the URL has a single placeholder.
        const remainingTokens = Array.from(url.matchAll(/\{\{(\w+)\}\}/g)).map(
          m => m[1]
        );
        const uniqueRemaining = Array.from(new Set(remainingTokens));
        if (uniqueRemaining.length === 1) {
          const scalarFallback =
            pathParams != null && !isPlainObject(pathParams)
              ? pathParams
              : query != null && !isPlainObject(query)
                ? query
                : undefined;
          if (scalarFallback !== undefined) {
            const encoded = encodeURIComponent(String(scalarFallback));
            url = url.replace(/\{\{(\w+)\}\}/g, () => encoded);
          }
        }

        // Append remaining query params (object only, skip consumed keys).
        if (isPlainObject(query)) {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(query)) {
            if (consumed.has(k)) continue;
            if (v === undefined || v === null) continue;
            qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
          }
          const qsStr = qs.toString();
          if (qsStr) {
            url += url.includes('?') ? `&${qsStr}` : `?${qsStr}`;
          }
        }

        const methodUpper = method.toUpperCase();
        const fetchBody = ['GET', 'HEAD'].includes(methodUpper)
          ? undefined
          : body
            ? JSON.stringify(body)
            : undefined;
        const finalHeaders = {
          'Content-Type': 'application/json',
          ...headers,
        };

        // Expose what was actually sent so users can debug from the node
        // output preview. Strip auth-bearing headers from the echo.
        const safeHeaders = Object.fromEntries(
          Object.entries(finalHeaders).filter(
            ([k]) =>
              !['authorization', 'cookie', 'x-api-key'].includes(
                k.toLowerCase()
              )
          )
        );
        outputs.request = {
          url,
          method: methodUpper,
          headers: safeHeaders,
          body: fetchBody ?? null,
        };

        try {
          const response = await fetch(url, {
            method: methodUpper,
            headers: finalHeaders,
            body: fetchBody,
          });

          outputs.status = response.status;
          outputs.response = await response.text();

          try {
            outputs.response = JSON.parse(outputs.response as string);
          } catch {
            // Keep as string
          }
        } catch (error) {
          outputs.status = 0;
          outputs.response = (error as Error).message;
        }
        break;
      }

      case 'UTIL_LOOP': {
        // Loop nodes are handled specially by the execution engine
        const items = inputs.items as unknown[];
        outputs.item = Array.isArray(items) ? items[0] : items;
        break;
      }

      case 'UTIL_TRANSFORM': {
        // iris/iris-desktop store config under `settings`; fall back to
        // top-level for workflows authored before the settings split.
        const settings = config?.settings as
          | Record<string, unknown>
          | undefined;
        const transformation = (settings?.transformation ??
          config.transformation) as string | undefined;
        const input = inputs.input;

        // Echo what the node actually received and decided to do — surfaced
        // in the node inspector so a passthrough or wrong-type result is
        // immediately diagnosable instead of silently surprising the user.
        outputs.debug = {
          transformation: transformation ?? null,
          inputType: input === null ? 'null' : typeof input,
          inputPreview:
            typeof input === 'string'
              ? input.slice(0, 200)
              : (() => {
                  try {
                    return JSON.stringify(input)?.slice(0, 200) ?? null;
                  } catch {
                    return String(input).slice(0, 200);
                  }
                })(),
        };

        let result: unknown;
        try {
          switch (transformation) {
            case 'toUpperCase':
              result = (
                typeof input === 'string' ? input : String(input ?? '')
              ).toUpperCase();
              break;
            case 'toLowerCase':
              result = (
                typeof input === 'string' ? input : String(input ?? '')
              ).toLowerCase();
              break;
            case 'trim':
              result = (
                typeof input === 'string' ? input : String(input ?? '')
              ).trim();
              break;
            case 'parseJson':
              if (typeof input === 'string') {
                // LLMs frequently wrap JSON in ```json ... ``` fences or surround
                // it with prose. Strip fences first, then fall back to scanning
                // for the first balanced JSON object/array if a direct parse fails.
                let candidate = input.trim();
                const fenceMatch = candidate.match(
                  /^```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```\s*$/
                );
                if (fenceMatch) {
                  candidate = fenceMatch[1].trim();
                }
                try {
                  result = JSON.parse(candidate);
                } catch (firstErr) {
                  const extracted = ((): string | null => {
                    for (let i = 0; i < candidate.length; i++) {
                      const open = candidate[i];
                      if (open !== '{' && open !== '[') continue;
                      const close = open === '{' ? '}' : ']';
                      let depth = 0;
                      let inString = false;
                      let escape = false;
                      for (let j = i; j < candidate.length; j++) {
                        const c = candidate[j];
                        if (escape) {
                          escape = false;
                          continue;
                        }
                        if (inString) {
                          if (c === '\\') {
                            escape = true;
                            continue;
                          }
                          if (c === '"') {
                            inString = false;
                          }
                          continue;
                        }
                        if (c === '"') {
                          inString = true;
                          continue;
                        }
                        if (c === open) depth++;
                        else if (c === close) {
                          depth--;
                          if (depth === 0) return candidate.slice(i, j + 1);
                        }
                      }
                    }
                    return null;
                  })();
                  if (extracted === null) {
                    throw firstErr;
                  }
                  result = JSON.parse(extracted);
                }
              } else if (input !== null && typeof input === 'object') {
                // Already parsed — pass through unchanged.
                result = input;
              } else {
                // Numbers/booleans/null/undefined aren't useful targets for
                // parseJson; surface that as an error so the user notices.
                throw new Error(
                  `parseJson received ${input === null ? 'null' : typeof input}, expected a JSON string`
                );
              }
              break;
            case 'stringify':
              // Strings stay as-is so the node is idempotent on already-encoded values.
              result =
                typeof input === 'string' ? input : JSON.stringify(input);
              break;
            default:
              // Unknown / empty transformation — DON'T silently passthrough
              // (that's what made the previous behaviour look like a bug:
              // user picked "Parse JSON" but value never reached the server,
              // so input flowed through and looked unchanged).
              throw new Error(
                transformation
                  ? `Unknown transformation: ${transformation}`
                  : 'No transformation selected — pick one of toUpperCase/toLowerCase/trim/parseJson/stringify'
              );
          }
        } catch (error) {
          outputs.error = (error as Error).message;
          result = null;
        }

        outputs.output = result;
        break;
      }

      // ─── Phase 1: flow control ────────────────────────────────────────
      case 'UTIL_ROUTER': {
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const rawRoutes = (settings.routes ?? config.routes) as unknown;
        const routes = this.parseRouterRoutes(rawRoutes);
        const input = inputs.input;

        // Always emit `default` — but only carries a value if no route matched.
        outputs.default = null;
        // Pre-seed every declared route port with null so unmatched routes are
        // explicitly inert (downstream `gatherInputs` checks port presence).
        for (const route of routes) {
          outputs[route.name] = null;
        }

        let matched: string | null = null;
        for (const route of routes) {
          if (!route.condition) continue;
          if (this.evalUserExpression(route.condition, { input, variables })) {
            matched = route.name;
            break;
          }
        }

        if (matched) {
          outputs[matched] = input;
          outputs.__matchedRoute = matched;
        } else {
          outputs.default = input;
          outputs.__matchedRoute = 'default';
        }
        break;
      }

      case 'UTIL_FILTER': {
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const condition = (settings.condition ?? config.condition) as
          | string
          | undefined;
        const input = inputs.input;

        const passes = condition
          ? this.evalUserExpression(condition, { input, variables })
          : Boolean(input);

        outputs.passed = passes ? input : null;
        outputs.rejected = passes ? null : input;
        break;
      }

      case 'UTIL_AGGREGATE': {
        // AGGREGATE runs inside a UTIL_LOOP body — invoked once per iteration.
        // Maintains a per-node buffer across iterations via state.variables,
        // re-emitting the running collection as `collected` each call. The
        // workflow engine's loop wrap-up keeps the LAST iteration's collected
        // value as the final aggregator output for post-loop consumers.
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const mode =
          ((settings.mode ?? config.mode) as string | undefined) ?? 'array';
        const keyField = (settings.keyField ?? config.keyField) as
          | string
          | undefined;
        const separator =
          ((settings.separator ?? config.separator) as string | undefined) ??
          '\n';

        const bufferKey = `__util_aggregate_buffer_${node.nodeId}`;
        const prev = variables[bufferKey];
        const buffer: unknown[] = Array.isArray(prev) ? [...prev] : [];
        if (inputs.item !== undefined) buffer.push(inputs.item);

        // Persist buffer for the next iteration. Mutating the variables map
        // in place is safe — the engine passes us a fresh shallow copy each
        // call but also propagates outputs back into state.variables under
        // `${nodeId}.${output}` keys; the engine separately holds the master
        // map. We expose the buffer via an output so the engine re-reads it
        // on the next iteration via the dedicated bufferKey we control.
        variables[bufferKey] = buffer;

        let collected: unknown;
        switch (mode) {
          case 'object': {
            const obj: Record<string, unknown> = {};
            for (const it of buffer) {
              if (it && typeof it === 'object' && !Array.isArray(it)) {
                const rec = it as Record<string, unknown>;
                const k = keyField ? String(rec[keyField]) : undefined;
                if (k) obj[k] = it;
              }
            }
            collected = obj;
            break;
          }
          case 'concat':
            collected = buffer
              .map(v => (typeof v === 'string' ? v : JSON.stringify(v)))
              .join(separator);
            break;
          case 'array':
          default:
            collected = [...buffer];
            break;
        }

        outputs.collected = collected;
        // Mirror buffer as a hidden output so the engine writes it back into
        // state.variables under `${nodeId}.__buffer`, but we read it from
        // the top-level bufferKey for symmetry across iterations.
        outputs.__buffer = buffer;
        break;
      }

      case 'UTIL_TRY_CATCH': {
        // Node-local semantics — see workflow-engine for the upstream-error
        // capture half. Here, we recognize the engine's error envelope shape
        // and route accordingly; everything else flows to `success`.
        const input = inputs.input;
        const errorEnvelope = this.coerceErrorEnvelope(input);
        if (errorEnvelope) {
          outputs.success = null;
          outputs.error = errorEnvelope;
        } else {
          outputs.success = input;
          outputs.error = null;
        }
        break;
      }

      case 'UTIL_SUB_WORKFLOW': {
        // Sub-workflow runtime is owned by the workflow engine (depth
        // bookkeeping + recursion guards). The bare node handler is only
        // reached when no engine wired it up — surface that clearly so it
        // never silently succeeds with stale data.
        outputs.output = null;
        outputs.executionId = null;
        outputs.error =
          'UTIL_SUB_WORKFLOW must be executed via the workflow engine. ' +
          'Direct invocation (e.g. from a unit test) bypasses recursion ' +
          'and depth-limit safety checks.';
        break;
      }

      // ─── Phase 1: data formatters ─────────────────────────────────────
      case 'UTIL_REGEX': {
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const text = String(inputs.text ?? '');
        // Input port `pattern` overrides config (lets workflows pass dynamic
        // patterns from upstream).
        const pattern = String(
          (inputs.pattern as string | undefined) ??
            settings.pattern ??
            config.pattern ??
            ''
        );
        const flags = String((settings.flags ?? config.flags ?? 'g') as string);
        const mode =
          ((settings.mode ?? config.mode) as string | undefined) ?? 'extract';
        const replacement = String(
          (settings.replacement ?? config.replacement ?? '') as string
        );

        if (!pattern) {
          outputs.matches = [];
          outputs.firstMatch = '';
          outputs.replaced = text;
          outputs.error = 'Pattern is required (input port or config)';
          break;
        }

        let regex: RegExp;
        try {
          regex = new RegExp(pattern, flags);
        } catch (err) {
          outputs.matches = [];
          outputs.firstMatch = '';
          outputs.replaced = text;
          outputs.error = `Invalid regex: ${(err as Error).message}`;
          break;
        }

        try {
          if (mode === 'replace') {
            outputs.replaced = text.replace(regex, replacement);
            outputs.matches = [];
            outputs.firstMatch = '';
          } else if (mode === 'match') {
            const m = text.match(
              regex.global ? new RegExp(pattern, flags.replace('g', '')) : regex
            );
            outputs.firstMatch = m ? m[0] : '';
            outputs.matches = m ? [m[0]] : [];
            outputs.replaced = text;
          } else {
            // extract: collect all matches (each as the full match string).
            // Use matchAll for global flag, fallback to repeated exec otherwise.
            const all: string[] = [];
            if (regex.global) {
              for (const m of text.matchAll(regex)) all.push(m[0]);
            } else {
              const m = text.match(regex);
              if (m) all.push(m[0]);
            }
            outputs.matches = all;
            outputs.firstMatch = all[0] ?? '';
            outputs.replaced = text;
          }
        } catch (err) {
          outputs.error = (err as Error).message;
          outputs.matches = [];
          outputs.firstMatch = '';
          outputs.replaced = text;
        }
        break;
      }

      case 'UTIL_DATE': {
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const operation =
          ((settings.operation ?? config.operation) as string | undefined) ??
          'format';
        const format = String(
          (settings.format ?? config.format ?? 'YYYY-MM-DD HH:mm:ss') as string
        );
        const unit = String(
          (settings.unit ?? config.unit ?? 'd') as string
        ) as dayjs.ManipulateType;
        const tz = (settings.timezone ?? config.timezone) as string | undefined;
        const dateInput = inputs.date as string | undefined;
        const secondDate = inputs.secondDate as string | undefined;
        const amount = Number(
          (inputs.amount as number | string | undefined) ?? 0
        );

        try {
          const applyTz = (d: dayjs.Dayjs): dayjs.Dayjs => (tz ? d.tz(tz) : d);

          switch (operation) {
            case 'now': {
              const d = applyTz(dayjs());
              outputs.result = d.format(format);
              outputs.iso = d.toISOString();
              outputs.unix = d.valueOf();
              break;
            }
            case 'parse': {
              const d = applyTz(dayjs(dateInput, format));
              if (!d.isValid()) throw new Error('Unparseable date');
              outputs.result = d.format(format);
              outputs.iso = d.toISOString();
              outputs.unix = d.valueOf();
              break;
            }
            case 'format': {
              const d = applyTz(dayjs(dateInput));
              if (!d.isValid()) throw new Error('Invalid date');
              outputs.result = d.format(format);
              outputs.iso = d.toISOString();
              outputs.unix = d.valueOf();
              break;
            }
            case 'add': {
              const d = applyTz(dayjs(dateInput).add(amount, unit));
              outputs.result = d.format(format);
              outputs.iso = d.toISOString();
              outputs.unix = d.valueOf();
              break;
            }
            case 'diff': {
              const a = dayjs(dateInput);
              const b = dayjs(secondDate);
              if (!a.isValid() || !b.isValid())
                throw new Error('Invalid date for diff');
              const diff = a.diff(b, unit);
              outputs.result = String(diff);
              outputs.iso = a.toISOString();
              outputs.unix = diff;
              break;
            }
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
        } catch (err) {
          outputs.error = (err as Error).message;
          outputs.result = '';
          outputs.iso = '';
          outputs.unix = 0;
        }
        break;
      }

      case 'UTIL_JSON_PATH': {
        const settings = (config?.settings ?? {}) as Record<string, unknown>;
        const data = inputs.data;
        const path = String(
          (inputs.path as string | undefined) ??
            settings.path ??
            config.path ??
            ''
        );
        const multiple = Boolean(
          (settings.multiple ?? config.multiple) as boolean | undefined
        );
        const defaultValueRaw = (settings.defaultValue ??
          config.defaultValue) as string | undefined;

        if (!path || data === undefined || data === null) {
          outputs.found = false;
          outputs.result = this.parseDefaultValue(defaultValueRaw);
          break;
        }

        try {
          if (path.startsWith('$.') || path.startsWith('$[')) {
            const matches = JSONPath({
              path,
              json: data as object,
              wrap: true,
            }) as unknown[];
            if (matches.length === 0) {
              outputs.found = false;
              outputs.result = this.parseDefaultValue(defaultValueRaw);
            } else {
              outputs.found = true;
              outputs.result = multiple ? matches : matches[0];
            }
          } else {
            // Dot/bracket notation — single-value lookup.
            const value = this.getByDotBracket(data, path);
            if (value === undefined) {
              outputs.found = false;
              outputs.result = this.parseDefaultValue(defaultValueRaw);
            } else {
              outputs.found = true;
              outputs.result = multiple ? [value] : value;
            }
          }
        } catch (err) {
          outputs.found = false;
          outputs.result = this.parseDefaultValue(defaultValueRaw);
          outputs.error = (err as Error).message;
        }
        break;
      }

      // ─── Phase 1: web data collection ─────────────────────────────────
      // WEB_SEARCH lives in the WEB category but its handler is small enough
      // to inline here. (It's also legal because executeUtility is reached
      // explicitly by name in the WEB branch added to the category switch.)
      case 'WEB_SEARCH': {
        const result = await this.executeWebSearch(node, inputs);
        outputs.results = result.results;
        outputs.fromCache = result.fromCache;
        return {
          outputs,
          assets: [],
          usage: { estimatedCost: result.estimatedCostUsd },
        };
      }

      // ─── Phase 2: document utilities ──────────────────────────────────
      case 'DOC_GREP': {
        const result = await this.executeDocGrep(node, inputs);
        outputs.matches = result.matches;
        outputs.context = result.context;
        outputs.count = result.count;
        if (result.truncated) outputs.truncated = true;
        break;
      }

      // ─── Phase 2: web scrapers / extractors ───────────────────────────
      case 'WEB_SCRAPER': {
        const result = await this.executeWebScraper(node, inputs);
        outputs.markdown = result.markdown;
        outputs.metadata = result.metadata;
        outputs.rawHtml = result.rawHtml;
        return {
          outputs,
          assets: [],
          usage: { estimatedCost: result.estimatedCostUsd },
        };
      }
      case 'WEB_YOUTUBE_TRANSCRIPT': {
        const result = await this.executeYoutubeTranscript(node, inputs);
        outputs.transcript = result.transcript;
        outputs.segments = result.segments;
        outputs.videoId = result.videoId;
        return {
          outputs,
          assets: [],
          usage: { estimatedCost: result.estimatedCostUsd },
        };
      }

      default:
        outputs.result = inputs;
    }

    return { outputs, assets: [] };
  }

  // ============================================================
  // PHASE 1 UTILITY HELPERS
  // ============================================================

  /**
   * Parse `routes` config into a typed array. Accepts:
   * - Already-parsed array of `{ name, condition }`
   * - JSON string
   * Returns `[]` on any error so the router falls through to `default`.
   */
  private parseRouterRoutes(
    raw: unknown
  ): Array<{ name: string; condition: string }> {
    if (!raw) return [];
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) return [];
    const routes: Array<{ name: string; condition: string }> = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      const condition =
        typeof e.condition === 'string' ? e.condition.trim() : '';
      if (!name || name === 'default') continue;
      routes.push({ name, condition });
    }
    return routes;
  }

  /**
   * Evaluate a user-supplied JS expression in a sandboxed-ish Function.
   *
   * NOT a true sandbox — workflow authors are trusted to provide their own
   * expressions, same trust level as UTIL_SCRIPT. We just isolate the
   * expression's lexical scope to `input` and `variables` and swallow
   * errors so a busted condition can't crash the workflow.
   */
  private evalUserExpression(
    expression: string,
    scope: { input: unknown; variables: Record<string, unknown> }
  ): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function(
        'input',
        'variables',
        `"use strict"; return (${expression});`
      );
      return Boolean(fn(scope.input, scope.variables));
    } catch {
      return false;
    }
  }

  /**
   * Detect engine-injected error envelopes routed into UTIL_TRY_CATCH.
   * The workflow engine wraps upstream failures into a discriminated
   * object before re-running into a TRY_CATCH so the node knows to route
   * to `error` rather than `success`.
   */
  private coerceErrorEnvelope(
    value: unknown
  ): { message: string; stack?: string; retryCount?: number } | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    if (v.__irisError === true && typeof v.message === 'string') {
      return {
        message: v.message,
        stack: typeof v.stack === 'string' ? v.stack : undefined,
        retryCount: typeof v.retryCount === 'number' ? v.retryCount : undefined,
      };
    }
    return null;
  }

  /**
   * Parse the `defaultValue` config for UTIL_JSON_PATH. Tries JSON first
   * (so users can specify `null`, `[]`, `{"k":1}`, etc.); falls back to
   * the raw string. Returns `null` when undefined.
   */
  private parseDefaultValue(raw: string | undefined): unknown {
    if (raw === undefined || raw === null) return null;
    const trimmed = String(raw).trim();
    if (trimmed === '') return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  /**
   * Minimal dot/bracket path resolver. Supports:
   *   users.0.name
   *   users[0].name
   *   users[0]['email']
   * No wildcards / filter expressions — use `$.…` JSONPath for those.
   */
  private getByDotBracket(data: unknown, path: string): unknown {
    if (data === null || data === undefined) return undefined;
    // Split on `.` and `[…]` segments. `users[0].name` → ["users","0","name"]
    const tokens = path
      .replace(/\[(['"]?)([^\]'"]+)\1\]/g, '.$2')
      .split('.')
      .map(s => s.trim())
      .filter(Boolean);
    let cur: unknown = data;
    for (const tok of tokens) {
      if (cur === null || cur === undefined) return undefined;
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[tok];
    }
    return cur;
  }

  /**
   * WEB_SEARCH handler. Stubbed until the Perplexity Search API adapter
   * lands — keeping the surface here so the graph engine has a stable
   * call site to wire into.
   */
  private async executeWebSearch(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    results: Array<{ title: string; url: string; snippet: string }>;
    fromCache: boolean;
    estimatedCostUsd: number;
  }> {
    const { perplexitySearch } = await import(
      './providers/perplexity-search-adapter.js'
    );
    const query = String(inputs.query ?? '');
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const maxResults = Math.min(
      20,
      Math.max(
        1,
        Number(
          (settings.maxResults ?? node.config.maxResults ?? 5) as number
        ) || 5
      )
    );
    return perplexitySearch({ query, maxResults });
  }

  // ============================================================
  // PHASE 2 HANDLERS
  // ============================================================

  private async executeDocGrep(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    matches: Array<{ line: string; lineNumber: number; context: string[] }>;
    context: string;
    count: number;
    truncated: boolean;
  }> {
    const { extractFileText, docGrep } = await import('./doc-handlers.js');
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const file = inputs.file;
    const pattern = String(
      (inputs.pattern as string | undefined) ??
        settings.pattern ??
        node.config.pattern ??
        ''
    );
    const mode =
      ((settings.mode ?? node.config.mode) as
        | 'literal'
        | 'literal-ci'
        | 'regex'
        | undefined) ?? 'literal';
    const contextLines = Math.max(
      0,
      Math.min(
        50,
        Number(
          (settings.contextLines ?? node.config.contextLines ?? 2) as number
        ) || 0
      )
    );
    const maxMatches = Math.max(
      1,
      Math.min(
        10000,
        Number(
          (settings.maxMatches ?? node.config.maxMatches ?? 200) as number
        ) || 200
      )
    );
    const extracted = await extractFileText(file, this.host);
    return docGrep(extracted.text, {
      mode,
      pattern,
      contextLines,
      maxMatches,
    });
  }

  private async executeDocLongContext(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    text: string;
    cached: boolean;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }> {
    const { executeDocLongContext } = await import('./analyzer-handlers.js');
    const { extractFileText } = await import('./doc-handlers.js');
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const provider = String(
      (settings.provider ?? node.config.provider ?? 'anthropic') as string
    );
    const model = String(
      (settings.model ?? node.config.model ?? '') as string
    );
    if (!model) throw new Error('DOC_LONG_CONTEXT: model is required');
    const enableCache =
      (settings.enableCache ?? node.config.enableCache) !== false;
    const maxAnswerTokens =
      Number(
        (settings.maxAnswerTokens ??
          node.config.maxAnswerTokens ??
          1024) as number
      ) || 1024;
    const query = String(inputs.query ?? '');
    if (!query) throw new Error('DOC_LONG_CONTEXT: query is required');
    // Resolve the file → plain text through the host-coupled extractor first,
    // then hand the extracted text to the (host-independent) engine analyzer.
    const extracted = await extractFileText(inputs.file, this.host);
    const result = await executeDocLongContext(extracted.text, query, {
      provider,
      model,
      enableCache,
      maxAnswerTokens,
    });
    return {
      text: result.text,
      cached: result.cached,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    };
  }

  private async executeStructuredExtractNode(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    data: unknown;
    valid: boolean;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }> {
    const { executeStructuredExtract } = await import('./analyzer-handlers.js');
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const provider = String(
      (settings.provider ?? node.config.provider ?? 'openai') as string
    );
    const model = String(
      (settings.model ?? node.config.model ?? '') as string
    );
    if (!model) throw new Error('AI_STRUCTURED_EXTRACT: model is required');
    let schema: object | undefined = inputs.schema as object | undefined;
    if (!schema) {
      const raw = (settings.schema ?? node.config.schema) as
        | string
        | object
        | undefined;
      if (typeof raw === 'string') {
        try {
          schema = JSON.parse(raw);
        } catch (err) {
          throw new Error(
            `AI_STRUCTURED_EXTRACT: schema config is not valid JSON: ${
              (err as Error).message
            }`
          );
        }
      } else if (raw && typeof raw === 'object') {
        schema = raw as object;
      }
    }
    if (!schema) throw new Error('AI_STRUCTURED_EXTRACT: schema is required');
    const instructions = (settings.instructions ??
      node.config.instructions) as string | undefined;
    const result = await executeStructuredExtract(inputs.input, {
      provider,
      model,
      schema,
      instructions,
    });
    return {
      data: result.data,
      valid: result.valid,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
    };
  }

  private async executeCategorizeNode(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    category: string | null;
    matched: string[];
    confidence: number | null;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }> {
    const { executeCategorize } = await import('./analyzer-handlers.js');
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const provider = String(
      (settings.provider ?? node.config.provider ?? 'openai') as string
    );
    const model = String(
      (settings.model ?? node.config.model ?? '') as string
    );
    if (!model) throw new Error('AI_CATEGORIZE: model is required');
    let categories: string[] = [];
    if (Array.isArray(inputs.categories)) {
      categories = (inputs.categories as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      const raw = (settings.categories ?? node.config.categories) as
        | string
        | undefined;
      if (typeof raw === 'string') {
        categories = raw
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    if (categories.length === 0) {
      throw new Error('AI_CATEGORIZE: at least one category is required');
    }
    const allowMultiple = Boolean(
      settings.allowMultiple ?? node.config.allowMultiple
    );
    return executeCategorize(inputs.input, {
      provider,
      model,
      categories,
      allowMultiple,
    });
  }

  private async executeWebScraper(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    markdown: string;
    metadata: Record<string, unknown>;
    rawHtml: string;
    estimatedCostUsd: number;
  }> {
    const { webScrape } = await import(
      './providers/web-scraper-adapter.js'
    );
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const url = String(inputs.url ?? '');
    if (!url) throw new Error('WEB_SCRAPER: url is required');
    const provider =
      ((settings.provider ?? node.config.provider) as
        | 'readability'
        | 'jina'
        | 'firecrawl'
        | undefined) ?? 'readability';
    const waitForSelector = (settings.waitForSelector ??
      node.config.waitForSelector) as string | undefined;
    const includeRawHtml = Boolean(
      settings.includeRawHtml ?? node.config.includeRawHtml
    );
    return webScrape({ url, provider, waitForSelector, includeRawHtml });
  }

  private async executeYoutubeTranscript(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{
    transcript: string;
    segments: Array<{ start: number; end: number; text: string }>;
    videoId: string;
    estimatedCostUsd: number;
  }> {
    const { fetchYoutubeTranscript } = await import(
      './providers/youtube-transcript-adapter.js'
    );
    const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
    const url = String(inputs.url ?? '');
    if (!url) throw new Error('WEB_YOUTUBE_TRANSCRIPT: url is required');
    const language = String(
      (settings.language ?? node.config.language ?? 'auto') as string
    );
    const withTimestamps = Boolean(
      settings.withTimestamps ?? node.config.withTimestamps
    );
    const fallbackWhisper =
      (settings.fallbackWhisper ?? node.config.fallbackWhisper) !== false;
    return fetchYoutubeTranscript({
      url,
      language,
      withTimestamps,
      fallbackWhisper,
    });
  }

  // ============================================================
  // PHASE 3 HANDLERS
  // ============================================================

  /**
   * EDIT_VIDEO_MERGE — ffmpeg concat of N video clips with optional
   * transitions. cut = simple concat demuxer (fastest); fade /
   * crossfade / wipe = filter_complex with xfade.
   */
  private async executeVideoMerge(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    if (!this.host.handlers?.videoMerge) {
      throw new AppError(
        'EDIT_VIDEO_MERGE is not supported by this host',
        501,
        'NODE_NOT_SUPPORTED'
      );
    }
    return this.host.handlers.videoMerge(node, inputs, context);
  }

  /** EDIT_VIDEO_OVERLAY — ffmpeg overlay (image) or drawtext (text). */
  private async executeVideoOverlay(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    if (!this.host.handlers?.videoOverlay) {
      throw new AppError(
        'EDIT_VIDEO_OVERLAY is not supported by this host',
        501,
        'NODE_NOT_SUPPORTED'
      );
    }
    return this.host.handlers.videoOverlay(node, inputs, context);
  }

  /**
   * EDIT_AUDIO_SEPARATE — stem separation via Replicate (Demucs).
   * Spleeter models surface a clear "not deployed" error.
   */
  private async executeAudioSeparate(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    if (!this.host.handlers?.audioSeparate) {
      throw new AppError(
        'EDIT_AUDIO_SEPARATE is not supported by this host',
        501,
        'NODE_NOT_SUPPORTED'
      );
    }
    return this.host.handlers.audioSeparate(node, inputs, context);
  }

  /**
   * GEN_LIP_SYNC — provider-routed (typically Replicate hosting
   * SadTalker / Sync-1.6.0).
   */
  private async executeLipSync(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    const { genLipSync } = await import('./media-gen-handlers.js');
    return genLipSync(node, inputs, context, this.host);
  }

  /** OUTPUT_SLACK_POST — chat.postMessage via webhook URL or Bot Token. */
  private async executeSlackPost(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    const { outputSlackPost } = await import('./integration-handlers.js');
    return outputSlackPost(node, inputs);
  }

  /**
   * OUTPUT_SHEET_APPEND — Google Sheets spreadsheets.values.append. Delegated
   * to the host (`googleapis` is too heavy for the dep-light engine).
   */
  private async executeSheetAppend(
    node: NodeDefinition,
    inputs: Record<string, unknown>
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    if (!this.host.handlers?.sheetAppend) {
      throw new AppError(
        'OUTPUT_SHEET_APPEND is not supported by this host',
        501,
        'NODE_NOT_SUPPORTED'
      );
    }
    return this.host.handlers.sheetAppend(node, inputs);
  }

  private async executeOutput(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
    const config = node.config;
    const outputs: Record<string, unknown> = {};
    const assets: AssetReference[] = [];

    switch (node.type) {
      case 'OUTPUT_STORAGE': {
        // Save to GCS storage in user-specific folder (matching existing storage structure)
        const data = inputs.data;
        const customFolder =
          (this.resolveValue(
            config.folder ?? config.path,
            variables
          ) as string) || '';
        // Match existing storage path: {env}/storage/{userId}/{customFolder}
        const environment =
          process.env.NODE_ENV === 'production' ? 'production' : 'dev';
        const folder = `${environment}/storage/${context.userId}${customFolder ? `/${customFolder}` : ''}`;
        const timestamp = Date.now();

        // Handle empty or missing data
        if (!data) {
          console.error('[OUTPUT_STORAGE] No data received to save');
          outputs.error =
            'No data received to save. Check that the input is properly connected.';
          outputs.url = '';
          break;
        }

        try {
          // Classify the input string into a public-store source. The actual
          // GCS put (path layout, makePublic, cross-bucket copy, http/gs
          // passthrough on failure) lives in the host's storePublic.
          let source: PublicStoreSource | null = null;
          if (typeof data === 'string') {
            if (data.startsWith('data:')) {
              const match = data.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                source = {
                  kind: 'bytes',
                  buffer: Buffer.from(match[2], 'base64'),
                  contentType: match[1],
                };
              }
            } else if (data.startsWith('gs://')) {
              source = { kind: 'gcsUri', uri: data };
            } else if (data.startsWith('http')) {
              source = { kind: 'url', url: data };
            } else {
              source = { kind: 'text', text: data };
            }
          }

          let savedUrl = '';
          let assetType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER' = 'OTHER';

          if (source) {
            const result = await this.host.media.storePublic({
              source,
              userId: context.userId,
              folder: customFolder || undefined,
            });
            if (result.success && result.publicUrl) {
              savedUrl = result.publicUrl;
              assetType = result.assetType ?? 'OTHER';
            } else if (result.error) {
              throw new Error(result.error);
            }
          }

          outputs.url = savedUrl;
          outputs.savedAt = new Date().toISOString();

          if (savedUrl) {
            assets.push({
              id: `output-${timestamp}`,
              type: assetType,
              url: savedUrl,
              path: folder,
            });
          }
        } catch (error) {
          console.error('[OUTPUT_STORAGE] Failed to save:', error);
          outputs.error = (error as Error).message;
          // Pass through original data URL if save fails
          if (typeof data === 'string' && data.startsWith('http')) {
            outputs.url = data;
          }
        }
        break;
      }

      case 'OUTPUT_WEBHOOK': {
        const settings = config.settings as Record<string, unknown> | undefined;
        const url = this.resolveValue(
          settings?.url ?? config.url,
          variables
        ) as string;
        const method = (settings?.method ?? config.method ?? 'POST') as string;
        const data = inputs.data;

        if (!url) {
          outputs.response = JSON.stringify({
            error: 'Webhook URL is not configured',
          });
          break;
        }

        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          outputs.response = await response.text();
        } catch (error) {
          outputs.response = JSON.stringify({
            error: (error as Error).message,
          });
        }
        break;
      }

      case 'OUTPUT_EMAIL': {
        // TODO: Send email using your email service with inputs.content
        // Will use: this.resolveValue(config.to, variables), this.resolveValue(config.subject, variables)
        outputs.sent = true;
        break;
      }

      // ─── Phase 3: first-class integrations ────────────────────────────
      case 'OUTPUT_SLACK_POST': {
        const r = await this.executeSlackPost(node, inputs);
        Object.assign(outputs, r.outputs);
        assets.push(...r.assets);
        break;
      }
      case 'OUTPUT_SHEET_APPEND': {
        const r = await this.executeSheetAppend(node, inputs);
        Object.assign(outputs, r.outputs);
        assets.push(...r.assets);
        break;
      }
    }

    return { outputs, assets };
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private isAIEditorNode(nodeType: string): boolean {
    const aiEditorNodes = [
      'EDIT_IMAGE_INPAINT',
      'EDIT_IMAGE_OUTPAINT',
      'EDIT_IMAGE_STYLE',
      'EDIT_IMAGE_FACE_SWAP',
      'EDIT_IMAGE_BG_REMOVE',
      'EDIT_IMAGE_UPSCALE',
      'EDIT_IMAGE_SKY_REPLACE',
      'EDIT_IMAGE_RELIGHT',
      'EDIT_IMAGE_AUTO_ENHANCE',
      'EDIT_VIDEO_UPSCALE',
      'EDIT_VIDEO_INPAINT',
      'EDIT_MOTION_CONTROL',
    ];
    return aiEditorNodes.includes(nodeType);
  }

  private mapNodeTypeToCapability(nodeType: IrisNodeType): AICapability {
    const mapping: Partial<Record<IrisNodeType, AICapability>> = {
      GEN_TEXT_TO_IMAGE: 'text-to-image',
      GEN_IMAGE_TO_IMAGE: 'image-to-image',
      GEN_IMAGE_TO_VIDEO: 'image-to-video',
      GEN_TEXT_TO_VIDEO: 'text-to-video',
      GEN_TEXT_TO_SPEECH: 'text-to-speech',
      GEN_SPEECH_TO_TEXT: 'speech-to-text',
      GEN_TEXT_TO_MUSIC: 'text-to-music',
      GEN_TEXT_TO_TEXT: 'text-to-text',
      GEN_INPAINT: 'inpaint',
      GEN_OUTPAINT: 'outpaint',
      GEN_STYLE_TRANSFER: 'style-transfer',
      GEN_FACE_SWAP: 'face-swap',
      GEN_VIDEO_SUBTITLE: 'speech-to-text',
      // Editor nodes (same capabilities as GEN_ counterparts)
      EDIT_IMAGE_INPAINT: 'inpaint',
      EDIT_IMAGE_OUTPAINT: 'outpaint',
      EDIT_IMAGE_STYLE: 'style-transfer',
      EDIT_IMAGE_FACE_SWAP: 'face-swap',
      // Image AI editor nodes
      EDIT_IMAGE_SKY_REPLACE: 'sky-replace',
      EDIT_IMAGE_RELIGHT: 'relight',
      EDIT_IMAGE_AUTO_ENHANCE: 'image-enhance',
      // Video editor nodes
      EDIT_VIDEO_UPSCALE: 'video-upscale',
      EDIT_VIDEO_INPAINT: 'video-inpaint',
      EDIT_MOTION_CONTROL: 'motion-control',
      // Analyzer nodes
      ANALYZE_IMAGE: 'image-analysis',
      ANALYZE_VIDEO: 'video-analysis',
      ANALYZE_AUDIO: 'audio-analysis',
      ANALYZE_TEXT: 'text-to-text',
      ANALYZE_DOCUMENT: 'document-analysis',
    };

    return mapping[nodeType] ?? 'text-to-text';
  }

  /**
   * Execute GEN_VIDEO_SUBTITLE: download video, call Whisper, return SRT/VTT/text
   */
  /**
   * Execute GEN_TEXT_TO_TEXT mode='agent': tool-using loop where the LLM
   * may call other workflow nodes (filtered by canBeTool) as tools.
   *
   * Provider scope: OpenAI only for Phase 1. Anthropic/Perplexity tool-use
   * follow-up is tracked in IRIS_NODES_EXPANSION_PLAN.md.
   */
  private async executeAgentMode(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    variables: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    const { runAgent, selectTools, createOpenAIChatClient } = await import(
      './agent-runtime.js'
    );
    const config = node.config;
    const settings = (config.settings ?? {}) as Record<string, unknown>;

    const providerName = (
      this.pickConfigField<string>(config, 'provider') ?? 'openai'
    ).toLowerCase();
    if (providerName !== 'openai') {
      throw new Error(
        `Agent mode currently supports provider=openai only (got ${providerName}). ` +
          `Anthropic / Perplexity tool-use is planned for a follow-up phase.`
      );
    }

    const apiKey = getApiKeyForProvider('openai');
    if (!apiKey) {
      throw new Error(
        'Agent mode requires OPENAI_API_KEY to be configured on the server.'
      );
    }

    const model =
      this.pickConfigField<string>(config, 'model') ?? 'gpt-4o-mini';
    const systemPrompt = this.pickConfigField<string>(config, 'systemPrompt');
    const temperature = this.pickConfigField<number>(config, 'temperature');
    const maxTokens = this.pickConfigField<number>(config, 'maxTokens');
    const maxIterations = Number(
      (settings.maxIterations ?? config.maxIterations ?? 10) as number
    );

    const configuredToolIds = (settings.tools ?? config.tools) as
      | string[]
      | undefined;
    if (!Array.isArray(configuredToolIds) || configuredToolIds.length === 0) {
      throw new Error(
        'Agent mode requires at least one tool node selected. Edit the node ' +
          "to pick from the workflow's canBeTool nodes."
      );
    }

    const promptValue =
      (inputs.prompt as string | undefined) ??
      (inputs.text as string | undefined) ??
      '';
    if (!promptValue.trim()) {
      throw new Error('Agent mode requires a `prompt` input.');
    }

    // Load workflow nodes so we can validate and execute the configured tools.
    const workflowNodes = await this.host.workflow.listNodes(
      context.workflowId
    );
    if (workflowNodes.length === 0) {
      throw new Error(
        `Agent mode: workflow ${context.workflowId} not found for tool lookup`
      );
    }

    const { tools, rejected } = selectTools(
      configuredToolIds,
      workflowNodes,
      node.nodeId
    );
    if (tools.length === 0) {
      throw new Error(
        `Agent mode: no usable tools after safety filtering. ` +
          `Rejections: ${rejected.map(r => `${r.nodeId} (${r.reason})`).join('; ')}`
      );
    }

    const client = createOpenAIChatClient(apiKey);

    // The tool dispatcher executes a tool node by re-entering this executor.
    // We don't recurse into the *whole* graph — we just run the single
    // tool node with the LLM-supplied args as its inputs.
    const dispatchTool = async (
      tool: {
        nodeId: string;
        type: string;
        label: string;
        config: Record<string, unknown>;
      },
      args: Record<string, unknown>
    ): Promise<unknown> => {
      // Build a NodeDefinition shape — same as what executeNode produces.
      const toolDef: NodeDefinition = {
        type: tool.type as IrisNodeType,
        nodeId: tool.nodeId,
        label: tool.label,
        config: tool.config,
        inputPorts: [],
        outputPorts: [],
      };
      // JSON ports came back as strings (we annotated the schema that way);
      // try to parse so downstream nodes see structured data when intended.
      const parsedInputs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
          ) {
            try {
              parsedInputs[k] = JSON.parse(trimmed);
              continue;
            } catch {
              /* leave as string */
            }
          }
        }
        parsedInputs[k] = v;
      }
      const result = await this.execute({
        node: toolDef,
        inputs: parsedInputs,
        variables,
        context,
      });
      if (result.status === 'failed') {
        throw new Error(result.error?.message ?? 'tool execution failed');
      }
      return result.outputs;
    };

    const agentResult = await runAgent({
      client,
      model,
      systemPrompt,
      userPrompt: promptValue,
      tools,
      maxIterations,
      dispatchTool,
      temperature,
      maxTokens,
    });

    // Compute USD cost from OpenAI token pricing on the configured model.
    // Falls back to 0 if we don't have a pricing entry — token-service
    // will still apply node-level credit charges via consumeNodeTokens.
    const { OpenAIAdapter } = await import('./providers/openai-adapter.js');
    const adapter = new OpenAIAdapter();
    const modelInfo = adapter.getModelInfo(model);
    const inputRate = modelInfo?.pricing?.inputCost ?? 0;
    const outputRate = modelInfo?.pricing?.outputCost ?? 0;
    const estimatedCost =
      inputRate * agentResult.inputTokensTotal +
      outputRate * agentResult.outputTokensTotal;

    return {
      outputs: {
        text: agentResult.text,
        response: agentResult.text,
        __agentTrace: {
          iterations: agentResult.iterations,
          truncated: agentResult.truncated,
          toolCalls: agentResult.toolCalls,
          rejectedTools: rejected,
        },
      },
      assets: [],
      usage: {
        inputTokens: agentResult.inputTokensTotal,
        outputTokens: agentResult.outputTokensTotal,
        totalTokens:
          agentResult.inputTokensTotal + agentResult.outputTokensTotal,
        estimatedCost,
      },
    };
  }

  private async executeVideoSubtitleGeneration(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: { executionId: string; workflowId: string; userId: string }
  ): Promise<{
    outputs: Record<string, unknown>;
    assets: AssetReference[];
    usage?: UsageInfo;
  }> {
    const config = node.config;
    const model =
      this.pickConfigField<string>(config, 'model') ?? 'gpt-4o-mini-transcribe';
    const language = this.pickConfigField<string>(config, 'language') ?? 'auto';
    const prompt = this.pickConfigField<string>(config, 'prompt');

    // Resolve video input to a public URL
    const videoUrl = await this.toMediaInputForExternalApi(
      inputs.video,
      context.userId,
      'whisper-subtitle'
    );

    if (!videoUrl?.value) {
      throw new Error('GEN_VIDEO_SUBTITLE: video input is required');
    }

    // Download video buffer
    const response = await globalThis.fetch(videoUrl.value);
    if (!response.ok) {
      throw new Error(
        `GEN_VIDEO_SUBTITLE: failed to download video (${response.status})`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') ?? 'video/mp4';

    // Transcribe via the host (cloud uses OpenAI Whisper; the engine never
    // imports the OpenAI SDK itself).
    const result = await this.host.transcription.transcribe(buffer, mimeType, {
      model,
      language,
      prompt,
    });

    // Consume tokens
    const tokensConsumed = await this.host.usage.consumeNodeTokens(
      context.userId,
      'GEN_SPEECH_TO_TEXT',
      model,
      { durationSeconds: result.duration }
    );

    return {
      outputs: { srt: result.srt, vtt: result.vtt, text: result.text },
      assets: [],
      usage: { estimatedCost: 0, tokensConsumed },
    };
  }

  private resolveValue(
    value: unknown,
    variables: Record<string, unknown>
  ): unknown {
    if (typeof value !== 'string') return value;

    // Replace variable references like {{variableName}}
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      return String(variables[name] ?? '');
    });
  }

  private evaluateCondition(
    value: unknown,
    condition: string,
    variables: Record<string, unknown>
  ): boolean {
    // Simple condition evaluation
    // Format: "value > 10", "value == 'test'", etc.

    const operators = ['===', '!==', '>=', '<=', '>', '<', '==', '!='];

    for (const op of operators) {
      if (condition.includes(op)) {
        const [left, right] = condition.split(op).map(s => s.trim());
        const leftVal = left === 'value' ? value : (variables[left] ?? left);
        const rightVal = variables[right] ?? this.parseValue(right);

        switch (op) {
          case '===':
          case '==':
            return leftVal === rightVal;
          case '!==':
          case '!=':
            return leftVal !== rightVal;
          case '>':
            return Number(leftVal) > Number(rightVal);
          case '<':
            return Number(leftVal) < Number(rightVal);
          case '>=':
            return Number(leftVal) >= Number(rightVal);
          case '<=':
            return Number(leftVal) <= Number(rightVal);
        }
      }
    }

    // If no operator found, just check truthiness
    return Boolean(value);
  }

  private parseValue(str: string): unknown {
    // Remove quotes
    if (
      (str.startsWith("'") && str.endsWith("'")) ||
      (str.startsWith('"') && str.endsWith('"'))
    ) {
      return str.slice(1, -1);
    }

    // Try number
    const num = Number(str);
    if (!isNaN(num)) return num;

    // Boolean
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;

    return str;
  }

  /**
   * Convert a relative Iris API URL to a temporary public URL for external API consumption.
   * This is needed because external APIs (Replicate, etc.) cannot access our internal API routes.
   *
   * @param url - The URL to convert (may be relative like '/api/iris/assets/{id}/download')
   * @param userId - The user ID for asset lookup
   * @param provider - Provider name for temp file organization
   * @returns Public URL if conversion was needed, original URL otherwise
   */
  private async getPublicUrlForExternalApi(
    url: string,
    _userId: string, // Used for logging context; actual userId comes from asset lookup
    provider: string
  ): Promise<string> {
    // Check if this is a relative Iris API URL
    const irisApiMatch = url.match(/^\/api\/iris\/assets\/([^/]+)\/download/);
    if (!irisApiMatch) {
      // Not a relative URL, return as-is
      return url;
    }

    const assetId = irisApiMatch[1];

    // Look up the asset to get storage path
    const asset = await this.host.assets.getAssetById(assetId);

    if (!asset?.storagePath) {
      console.warn(
        `[NodeExecutor] Asset not found or missing storage path: ${assetId}`
      );
      return url;
    }

    // Get temp public URL using the host media seam. A host without storage
    // returns success:false here and we fall through to the original URL.
    const result = await this.host.media.getTempPublicUrlForAsset({
      userId: asset.userId,
      storagePath: asset.storagePath,
      provider,
      contentType: asset.mimeType || undefined,
    });

    if (result.success && result.publicUrl) {
      return result.publicUrl;
    }

    console.warn(`[NodeExecutor] Failed to get public URL: ${result.error}`);
    return url;
  }

  /**
   * Convert media input to a format suitable for external APIs.
   * If the input is a relative Iris API URL, converts it to a temp public URL.
   *
   * @param value - The media input value
   * @param userId - The user ID for asset lookup
   * @param provider - Provider name for temp file organization
   * @returns Media input object with URL or base64
   */
  private async toMediaInputForExternalApi(
    value: unknown,
    userId: string,
    provider: string
  ): Promise<{
    type: 'url' | 'base64';
    value: string;
    mimeType?: string;
  }> {
    if (typeof value === 'string') {
      // Check if it's a relative Iris API URL that needs conversion
      if (value.startsWith('/api/iris/assets/')) {
        const publicUrl = await this.getPublicUrlForExternalApi(
          value,
          userId,
          provider
        );
        return { type: 'url', value: publicUrl };
      }

      if (value.startsWith('http')) {
        return { type: 'url', value };
      } else if (value.startsWith('data:')) {
        const [header, data] = value.split(',');
        const mimeType = header.match(/data:([^;]+)/)?.[1];
        return { type: 'base64', value: data, mimeType };
      } else {
        return { type: 'base64', value };
      }
    }

    // Handle object input
    const obj = value as {
      type?: string;
      value?: string;
      url?: string;
      base64?: string;
      mimeType?: string;
    };

    // Check if url is a relative path
    if (obj.url?.startsWith('/api/iris/assets/')) {
      const publicUrl = await this.getPublicUrlForExternalApi(
        obj.url,
        userId,
        provider
      );
      return { type: 'url', value: publicUrl, mimeType: obj.mimeType };
    }

    return {
      type: obj.type === 'url' || obj.url ? 'url' : 'base64',
      value: obj.value ?? obj.url ?? obj.base64 ?? '',
      mimeType: obj.mimeType,
    };
  }
}
