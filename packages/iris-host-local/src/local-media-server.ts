/**
 * Local media server wiring — static serving of generated/public media and the
 * engine's temp-public uploader.
 *
 * Two concerns:
 *  1. Serve `<dataDir>/public` at `/public/*` so media stored via the host's
 *     `storePublic` / temp-public uploader is reachable over HTTP.
 *  2. Serve a stored asset's bytes at `/api/iris/assets/:id/download` (the
 *     `apiUrl` the host returns from `storeOutput`).
 *  3. Inject `setTempPublicUploader` so adapters (Kling/Luma image inputs) can
 *     hand the engine bytes and get back a URL.
 *
 * ⚠️ External-reachability trap: external providers (Replicate/fal/Kling) fetch
 * temp-public URLs from THEIR servers. `http://localhost:...` is not reachable
 * by them — those specific media-input nodes need a tunnel (ngrok) or a user
 * cloud bucket to work on a local host. Text/image generation is unaffected.
 */

import path from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { setTempPublicUploader } from 'iris-engine';
import { ensureDir, readJsonOrNull } from './fs-util.js';

interface AssetMeta {
  storagePath: string;
  mimeType: string;
}

function stripDataUrl(b64: string): string {
  const comma = b64.indexOf(',');
  return b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
}

export interface MediaServerOptions {
  dataDir: string;
  getPublicBaseUrl: () => string;
}

export async function registerMediaServer(
  app: FastifyInstance,
  opts: MediaServerOptions,
): Promise<void> {
  const publicDir = path.join(opts.dataDir, 'public');
  await ensureDir(publicDir);

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/public/',
    decorateReply: false,
  });

  // Stream a stored asset's bytes by id (the host's storeOutput apiUrl).
  app.get<{ Params: { id: string } }>(
    '/api/iris/assets/:id/download',
    async (req, reply) => {
      const metaFile = path.join(
        opts.dataDir,
        'assets',
        req.params.id,
        'meta.json',
      );
      const meta = await readJsonOrNull<AssetMeta>(metaFile);
      if (!meta) {
        return reply.code(404).send({ error: 'Asset not found' });
      }
      try {
        await fs.access(meta.storagePath);
      } catch {
        return reply.code(404).send({ error: 'Asset data missing' });
      }
      reply.header('Content-Type', meta.mimeType || 'application/octet-stream');
      return reply.send(createReadStream(meta.storagePath));
    },
  );

  // Wire the engine's temp-public uploader to the local public dir.
  setTempPublicUploader(async ({ base64Data, mimeType }) => {
    try {
      const buffer = Buffer.from(stripDataUrl(base64Data), 'base64');
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
      const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
      await fs.writeFile(path.join(publicDir, fileName), buffer);
      return {
        success: true,
        signedUrl: `${opts.getPublicBaseUrl()}/public/${fileName}`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'temp public upload failed',
      };
    }
  });
}
