/**
 * Single-node local generation for the desktop image/video galleries.
 *
 * The cloud handles `POST /api/iris/assets/generate` server-side; locally we run
 * one `GEN_TEXT_TO_IMAGE` / `GEN_TEXT_TO_VIDEO` node through the engine's
 * `NodeExecutor` against the disk-backed host. The host's `storeOutput` writes
 * `<dataDir>/assets/<id>/` + meta.json — exactly what the gallery list/single
 * endpoints read — so a generated asset shows up in the gallery automatically.
 *
 * Requires the relevant provider key in the environment (BYOK). With no key the
 * node runs but the provider call fails; the error is surfaced to the caller.
 */

import { randomUUID } from 'node:crypto';
import { NodeExecutor, type NodeDefinition, type NodeResult } from 'iris-engine';
import { createLocalNodeHost } from './local-node-host.js';
import type { LocalWorkflowStore } from './local-workflow-store.js';

export interface GenerateAssetInput {
  prompt?: string;
  assetType?: string;
  provider?: string;
  providerId?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  referenceImageBase64?: string;
  settings?: Record<string, unknown>;
}

export interface LocalGeneratorOptions {
  dataDir: string;
  store: LocalWorkflowStore;
  getPublicBaseUrl: () => string;
  userId?: string;
}

export function createLocalGenerator(
  opts: LocalGeneratorOptions,
): (input: GenerateAssetInput) => Promise<NodeResult> {
  const host = createLocalNodeHost({
    dataDir: opts.dataDir,
    store: opts.store,
    getPublicBaseUrl: opts.getPublicBaseUrl,
    userId: opts.userId,
  });
  const executor = new NodeExecutor(host);
  const userId = opts.userId ?? 'local';

  return async function generate(input: GenerateAssetInput): Promise<NodeResult> {
    const isVideo = (input.assetType ?? 'IMAGE').toUpperCase() === 'VIDEO';
    const config: Record<string, unknown> = {
      ...(input.settings ?? {}),
      provider: input.provider ?? input.providerId,
      model: input.model,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      duration: input.duration,
    };
    const inputs: Record<string, unknown> = { prompt: input.prompt ?? '' };
    if (input.referenceImageBase64) {
      const b64 = input.referenceImageBase64;
      inputs.image = b64.startsWith('data:')
        ? b64
        : `data:image/png;base64,${b64}`;
    }
    const node: NodeDefinition = {
      type: isVideo ? 'GEN_TEXT_TO_VIDEO' : 'GEN_TEXT_TO_IMAGE',
      nodeId: randomUUID(),
      label: isVideo ? 'Text to Video' : 'Text to Image',
      config,
      inputPorts: [],
      outputPorts: [],
    };
    return executor.execute({
      node,
      inputs,
      variables: {},
      context: {
        executionId: randomUUID(),
        workflowId: 'adhoc-generate',
        userId,
      },
    });
  };
}
