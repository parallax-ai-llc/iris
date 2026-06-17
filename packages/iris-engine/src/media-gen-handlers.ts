/**
 * Parallax Iris — Phase 3 media generator handlers.
 *
 *   GEN_LIP_SYNC — sync a face video to a target audio track.
 *
 * Routed through Replicate which hosts SadTalker / Sync-1.6.0 /
 * etc. We surface a `provider` config that maps to a Replicate model
 * slug. For Phase 3 v1 we ship a single model per quality bucket and
 * defer multi-provider routing.
 */

import type { NodeExecutorHost } from './node-host.js';
import type {
  NodeDefinition,
  AssetReference,
  UsageInfo,
} from './types.js';

interface ExecutionContext {
  executionId: string;
  workflowId: string;
  userId: string;
}

function inputToUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.value === 'string') return obj.value;
  }
  return '';
}

/**
 * Map user-facing model id + quality to a Replicate slug.
 * Defaults to Sync-1.6.0 (best quality/feature balance as of 2026).
 */
function resolveModel(
  configModel: string | undefined,
  quality: string
): string {
  if (configModel && configModel.includes('/')) return configModel; // user provided full slug
  switch (quality) {
    case 'fast':
      return 'cjwbw/sadtalker';
    case 'high':
      return 'sync-so/sync-1.6.0';
    case 'balanced':
    default:
      return 'sync-so/sync-1.6.0';
  }
}

export async function genLipSync(
  node: NodeDefinition,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  host: NodeExecutorHost
): Promise<{
  outputs: Record<string, unknown>;
  assets: AssetReference[];
  usage?: UsageInfo;
}> {
  const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
  const quality = String(
    (settings.quality ?? node.config.quality ?? 'balanced') as string
  );
  const preserveExpression =
    (settings.preserveExpression ?? node.config.preserveExpression) !== false;
  const enhanceFace = Boolean(
    settings.enhanceFace ?? node.config.enhanceFace
  );
  const userModel = (settings.model ?? node.config.model) as string | undefined;
  const replicateModel = resolveModel(userModel, quality);

  const videoUrl = inputToUrl(inputs.video);
  const audioUrl = inputToUrl(inputs.audio);
  if (!videoUrl) throw new Error('GEN_LIP_SYNC: video input is required');
  if (!audioUrl) throw new Error('GEN_LIP_SYNC: audio input is required');

  const { createAdapter } = await import('./providers/index.js');
  const { getApiKeyForProvider } = await import('./node-executor-config.js');
  const adapter = createAdapter('replicate');
  const apiKey = getApiKeyForProvider('replicate');
  if (!apiKey) throw new Error('GEN_LIP_SYNC: REPLICATE_API_KEY not configured');
  await adapter.initialize({ apiKey });

  const response = await adapter.execute({
    capability: 'lip-sync' as never,
    model: replicateModel,
    prompt: '',
    inputVideo: { type: 'url', value: videoUrl },
    inputAudio: { type: 'url', value: audioUrl },
    parameters: {
      preserve_expression: preserveExpression,
      enhance_face: enhanceFace,
      // Sync-1.6.0 + SadTalker accept similar param names; the adapter
      // forwards what the slug needs.
    },
    metadata: {
      userId: context.userId,
      workflowId: context.workflowId,
      executionId: context.executionId,
      nodeId: node.nodeId,
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message ?? 'Lip sync failed');
  }

  const outputs: Record<string, unknown> = {};
  const assets: AssetReference[] = [];

  for (const out of response.outputs) {
    if (out.type !== 'video') continue;
    const stored = await host.media.storeOutput({
      output: {
        type: 'video',
        url: out.url,
        base64: out.base64,
        metadata: { editType: 'GEN_LIP_SYNC', quality, enhanceFace },
      },
      userId: context.userId,
      storagePath: 'iris/generated',
      workflowId: context.workflowId,
      executionId: context.executionId,
      baseName: 'lipsync-video',
      provider: 'replicate',
      model: replicateModel,
    });
    if (stored.success && stored.apiUrl && stored.asset) {
      outputs.video = stored.apiUrl;
      assets.push({
        id: stored.asset.id,
        type: 'VIDEO',
        url: stored.apiUrl,
        path: stored.asset.path,
        storagePath: stored.asset.storagePath || undefined,
        metadata: { encrypted: true, editType: 'GEN_LIP_SYNC' },
      });
    } else if (out.url) {
      outputs.video = out.url;
    }
  }

  return { outputs, assets, usage: response.usage };
}
