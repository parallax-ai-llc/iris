/**
 * Local video-editor project store (self-host replacement for the cloud
 * `/api/video-projects`). Each project is a JSON file at
 * `<dataDir>/projects/<id>.json` holding the full project incl. the opaque
 * `timelineData` blob and the `mediaPool` rows. Media references (`externalId`
 * → IrisAsset id, `mediaId`) are stored verbatim; the editor + asset routes
 * resolve them to local files. Export is NOT here — the desktop renders locally
 * via Electron FFmpeg IPC.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  ensureDir,
  readJsonOrNull,
  writeJson,
  withFileLock,
} from './fs-util.js';

type Json = Record<string, unknown>;

export interface StoredMedia {
  id: string;
  projectId: string;
  mediaType: string;
  externalId: string | null;
  fileUrl: string | null;
  name: string;
  thumbnailUrl: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  proxyStatus?: string | null;
  proxyPath?: string | null;
  proxyGeneratedAt?: string | null;
  proxyError?: string | null;
  originalHash?: string | null;
  addedAt: string;
}

export interface StoredProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  width: number;
  height: number;
  frameRate: number;
  timelineData: Json;
  duration: number;
  thumbnailUrl: string | null;
  status: string;
  lastExportedAt: string | null;
  exportedVideoId: string | null;
  createdAt: string;
  updatedAt: string;
  mediaPool: StoredMedia[];
}

function defaultTimeline(): Json {
  return {
    version: 1,
    settings: {
      backgroundColor: '#000000',
      defaultTransitionDuration: 0.5,
      audioFadeDefault: 0.1,
    },
    tracks: [],
    markers: [],
  };
}

function toListItem(p: StoredProject) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    width: p.width,
    height: p.height,
    duration: p.duration,
    thumbnailUrl: p.thumbnailUrl,
    status: p.status,
    mediaCount: p.mediaPool.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export class LocalProjectStore {
  constructor(
    private dataDir: string,
    private userId = 'local',
  ) {}

  private dir(): string {
    return path.join(this.dataDir, 'projects');
  }
  private file(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  async get(id: string): Promise<StoredProject | null> {
    return readJsonOrNull<StoredProject>(this.file(id));
  }

  async list(): Promise<{ projects: ReturnType<typeof toListItem>[]; total: number }> {
    let files: string[];
    try {
      files = await fs.readdir(this.dir());
    } catch {
      return { projects: [], total: 0 };
    }
    const projects: StoredProject[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const p = await readJsonOrNull<StoredProject>(path.join(this.dir(), f));
      if (p) projects.push(p);
    }
    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { projects: projects.map(toListItem), total: projects.length };
  }

  async findByAsset(externalId: string): Promise<StoredProject | null> {
    const { projects } = await this.list();
    for (const item of projects) {
      const p = await this.get(item.id);
      if (p?.mediaPool.some(m => m.externalId === externalId)) return p;
    }
    return null;
  }

  async create(input: Json): Promise<StoredProject> {
    await ensureDir(this.dir());
    const id = randomUUID();
    const now = new Date().toISOString();
    const project: StoredProject = {
      id,
      userId: this.userId,
      name: (input.name as string) || 'Untitled project',
      description: (input.description as string) ?? null,
      width: (input.width as number) ?? 1920,
      height: (input.height as number) ?? 1080,
      frameRate: (input.frameRate as number) ?? 30,
      timelineData: defaultTimeline(),
      duration: 0,
      thumbnailUrl: null,
      status: 'draft',
      lastExportedAt: null,
      exportedVideoId: null,
      createdAt: now,
      updatedAt: now,
      mediaPool: [],
    };
    await withFileLock(this.file(id), () => writeJson(this.file(id), project));
    return project;
  }

  private async patch(
    id: string,
    mutate: (p: StoredProject) => void,
  ): Promise<StoredProject | null> {
    return withFileLock(this.file(id), async () => {
      const p = await this.get(id);
      if (!p) return null;
      mutate(p);
      p.updatedAt = new Date().toISOString();
      await writeJson(this.file(id), p);
      return p;
    });
  }

  async update(id: string, input: Json): Promise<StoredProject | null> {
    return this.patch(id, p => {
      const row = p as unknown as Json;
      for (const key of ['name', 'description', 'width', 'height', 'frameRate'] as const) {
        if (input[key] !== undefined) row[key] = input[key];
      }
    });
  }

  async saveTimeline(id: string, input: Json): Promise<StoredProject | null> {
    return this.patch(id, p => {
      if (input.timelineData !== undefined) p.timelineData = input.timelineData as Json;
      if (typeof input.duration === 'number') p.duration = input.duration;
      if (typeof input.thumbnail === 'string') p.thumbnailUrl = input.thumbnail;
    });
  }

  async remove(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.file(id));
      return true;
    } catch {
      return false;
    }
  }

  async duplicate(id: string): Promise<StoredProject | null> {
    const src = await this.get(id);
    if (!src) return null;
    await ensureDir(this.dir());
    const newId = randomUUID();
    const now = new Date().toISOString();
    const copy: StoredProject = {
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      mediaPool: src.mediaPool.map(m => ({ ...m, projectId: newId })),
    };
    await withFileLock(this.file(newId), () => writeJson(this.file(newId), copy));
    return copy;
  }

  async getMediaPool(id: string): Promise<StoredMedia[]> {
    const p = await this.get(id);
    return p?.mediaPool ?? [];
  }

  async addMedia(id: string, input: Json): Promise<StoredMedia | null> {
    const media: StoredMedia = {
      id: randomUUID(),
      projectId: id,
      mediaType: (input.mediaType as string) || 'video',
      externalId: (input.externalId as string) ?? null,
      fileUrl: (input.fileUrl as string) ?? null,
      name: (input.name as string) || 'media',
      thumbnailUrl: (input.thumbnailUrl as string) ?? null,
      duration: (input.duration as number) ?? null,
      width: (input.width as number) ?? null,
      height: (input.height as number) ?? null,
      fileSize: (input.fileSize as number) ?? null,
      proxyStatus: 'none',
      addedAt: new Date().toISOString(),
    };
    const updated = await this.patch(id, p => {
      p.mediaPool.unshift(media);
    });
    return updated ? media : null;
  }

  async removeMedia(id: string, mediaId: string): Promise<boolean> {
    const updated = await this.patch(id, p => {
      p.mediaPool = p.mediaPool.filter(m => m.id !== mediaId);
    });
    return !!updated;
  }

  async updateMediaProxy(
    id: string,
    mediaId: string,
    input: Json,
  ): Promise<StoredMedia | null> {
    let result: StoredMedia | null = null;
    await this.patch(id, p => {
      const m = p.mediaPool.find(x => x.id === mediaId);
      if (m) {
        Object.assign(m, input);
        result = m;
      }
    });
    return result;
  }
}
