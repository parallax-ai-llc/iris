/**
 * Parallax Iris — integration output handlers (engine-resident parts).
 *
 *   OUTPUT_SLACK_POST — Slack chat.postMessage (Bot Token) or webhook URL.
 *   OUTPUT_DISCORD    — Discord Incoming Webhook (pure fetch, Phase 4).
 *   OUTPUT_EMAIL의 순수 절반 — 수신자 파싱 / 첨부 정규화 (발송 자체는
 *   host.handlers.sendEmail seam — SMTP 자격은 호스트 소유).
 *
 * Slack posting is pure `fetch` + an env-provided bot token, so it lives in the
 * engine (dep-light). The bot token is read from `process.env.SLACK_BOT_TOKEN`:
 * the Parallax cloud sets it from server env, a local host can populate it from
 * the user's settings.
 *
 * `OUTPUT_SHEET_APPEND` stays in the server (`googleapis` is too heavy for the
 * engine — trap #1); node-executor reaches it through the `host.handlers.sheetAppend`
 * seam instead. See `core/server/.../integration-handlers.ts`.
 */

import type { NodeDefinition, AssetReference } from './types.js';

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

// ============================================================
// OUTPUT_DISCORD (Phase 4)
// ============================================================

/** Discord hard limit on webhook `content`. */
const DISCORD_CONTENT_LIMIT = 2000;
const DISCORD_MAX_EMBEDS = 10;

export interface DiscordPostRequest {
  url: string;
  body: {
    content: string;
    username?: string;
    avatar_url?: string;
    embeds?: Array<Record<string, unknown>>;
  };
  /** True when `content` was cut down to the 2000-char Discord limit. */
  truncated: boolean;
}

/**
 * Pure request builder — validates the webhook URL (Discord webhooks only;
 * arbitrary URLs belong to OUTPUT_WEBHOOK), truncates over-limit content,
 * and resolves embeds from the input port or the config template.
 * Split from the fetch so it stays unit-testable.
 */
export function buildDiscordPostRequest(
  node: NodeDefinition,
  inputs: Record<string, unknown>
): DiscordPostRequest {
  const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
  const rawUrl = String(
    (settings.webhookUrl ?? node.config.webhookUrl ?? '') as string
  ).trim();
  const isDiscordWebhook =
    rawUrl.startsWith('https://discord.com/api/webhooks/') ||
    rawUrl.startsWith('https://discordapp.com/api/webhooks/') ||
    rawUrl.startsWith('https://ptb.discord.com/api/webhooks/') ||
    rawUrl.startsWith('https://canary.discord.com/api/webhooks/');
  if (!isDiscordWebhook) {
    throw new Error(
      'OUTPUT_DISCORD: webhookUrl must be a Discord webhook URL (https://discord.com/api/webhooks/...). For arbitrary endpoints use OUTPUT_WEBHOOK.'
    );
  }

  const message = String(inputs.message ?? '');
  const truncated = message.length > DISCORD_CONTENT_LIMIT;
  const content = truncated
    ? `${message.slice(0, DISCORD_CONTENT_LIMIT - 1)}…`
    : message;

  // embeds input port overrides the config template (Slack blocks precedent).
  let embeds: Array<Record<string, unknown>> | undefined;
  const resolveEmbeds = (raw: unknown): Array<Record<string, unknown>> | undefined => {
    if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // invalid JSON — fall through
      }
    }
    return undefined;
  };
  embeds =
    resolveEmbeds(inputs.embeds) ??
    resolveEmbeds(settings.embedsTemplate ?? node.config.embedsTemplate);
  if (embeds && embeds.length > DISCORD_MAX_EMBEDS) {
    embeds = embeds.slice(0, DISCORD_MAX_EMBEDS);
  }

  if (!content && (!embeds || embeds.length === 0)) {
    throw new Error(
      'OUTPUT_DISCORD: either `message` input or embeds is required'
    );
  }

  const username = (settings.username ?? node.config.username) as
    | string
    | undefined;
  const avatarUrl = (settings.avatarUrl ?? node.config.avatarUrl) as
    | string
    | undefined;

  const body: DiscordPostRequest['body'] = { content };
  if (embeds && embeds.length > 0) body.embeds = embeds;
  if (username) body.username = username;
  if (avatarUrl) body.avatar_url = avatarUrl;

  // `wait=true` makes Discord return the created message (id etc.).
  const url = rawUrl.includes('?') ? `${rawUrl}&wait=true` : `${rawUrl}?wait=true`;
  return { url, body, truncated };
}

export async function outputDiscordPost(
  node: NodeDefinition,
  inputs: Record<string, unknown>
): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
  const request = buildDiscordPostRequest(node, inputs);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(
      `OUTPUT_DISCORD webhook failed: ${response.status} ${errText}`
    );
  }
  let messageId = '';
  try {
    const json = (await response.json()) as { id?: string };
    messageId = json.id ?? '';
  } catch {
    // wait=true should return JSON, but tolerate empty bodies.
  }
  const outputs: Record<string, unknown> = { sent: true, messageId };
  if (request.truncated) outputs.truncated = true;
  return { outputs, assets: [] };
}

// ============================================================
// OUTPUT_EMAIL — pure halves (Phase 4)
// ============================================================

const EMAIL_MAX_RECIPIENTS = 5;
const EMAIL_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB total

// Deliberately loose — real validation is the SMTP server's job; this only
// catches obvious config typos before a send is attempted.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma/semicolon-separated recipient list → validated, deduped array. */
export function parseEmailRecipients(raw: unknown): string[] {
  const text = String(raw ?? '').trim();
  if (!text) {
    throw new Error('OUTPUT_EMAIL: at least one recipient is required');
  }
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const part of text.split(/[,;]/)) {
    const email = part.trim();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      throw new Error(`OUTPUT_EMAIL: invalid recipient address "${email}"`);
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  if (recipients.length === 0) {
    throw new Error('OUTPUT_EMAIL: at least one recipient is required');
  }
  if (recipients.length > EMAIL_MAX_RECIPIENTS) {
    throw new Error(
      `OUTPUT_EMAIL: at most ${EMAIL_MAX_RECIPIENTS} recipients per send (got ${recipients.length})`
    );
  }
  return recipients;
}

export interface EmailAttachment {
  filename: string;
  /** Raw bytes, base64-encoded. */
  base64: string;
  mimeType: string;
}

/**
 * Normalize the `attachments` input into a typed list. Accepts a data URL
 * string, `{ file, filename }` (UTIL_FILE_CONVERT's output shape),
 * `{ base64, mimeType, filename }`, or an array of any of those.
 * Enforces the 10MB combined cap so node results / SMTP stay bounded.
 */
export function normalizeEmailAttachments(input: unknown): EmailAttachment[] {
  if (input === null || input === undefined || input === '') return [];
  const list = Array.isArray(input) ? input : [input];
  const attachments: EmailAttachment[] = [];
  let totalBytes = 0;

  const pushDataUrl = (dataUrl: string, filename?: string) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error(
        'OUTPUT_EMAIL: attachment string must be a base64 data URL'
      );
    }
    attachments.push({
      filename: filename || `attachment-${attachments.length + 1}`,
      base64: match[2],
      mimeType: match[1],
    });
  };

  for (const entry of list) {
    if (typeof entry === 'string') {
      pushDataUrl(entry);
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const filename =
        typeof obj.filename === 'string' ? obj.filename : undefined;
      if (typeof obj.file === 'string') {
        pushDataUrl(obj.file, filename);
      } else if (typeof obj.base64 === 'string') {
        attachments.push({
          filename: filename || `attachment-${attachments.length + 1}`,
          base64: obj.base64,
          mimeType:
            typeof obj.mimeType === 'string'
              ? obj.mimeType
              : 'application/octet-stream',
        });
      } else {
        throw new Error(
          'OUTPUT_EMAIL: attachment object must carry `file` (data URL) or `base64`'
        );
      }
    } else {
      throw new Error(
        'OUTPUT_EMAIL: attachments must be data URLs or {file|base64} objects'
      );
    }
  }

  for (const att of attachments) {
    // base64 → bytes: 3/4 ratio (padding makes this an over-estimate, fine).
    totalBytes += Math.floor(att.base64.length * 0.75);
  }
  if (totalBytes > EMAIL_MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `OUTPUT_EMAIL: attachments total ${Math.round(totalBytes / 1024 / 1024)}MB — the limit is ${EMAIL_MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`
    );
  }
  return attachments;
}

// ============================================================
// OUTPUT_SLACK_POST
// ============================================================

export async function outputSlackPost(
  node: NodeDefinition,
  inputs: Record<string, unknown>
): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
  const settings = (node.config?.settings ?? {}) as Record<string, unknown>;
  const channel = String(
    (settings.channel ?? node.config.channel ?? '') as string
  );
  const username = (settings.username ?? node.config.username) as
    | string
    | undefined;
  const iconEmoji = (settings.iconEmoji ?? node.config.iconEmoji) as
    | string
    | undefined;
  const threadTs = (settings.threadTs ?? node.config.threadTs) as
    | string
    | undefined;
  const text = String(inputs.text ?? '');
  if (!text && !inputs.blocks) {
    throw new Error(
      'OUTPUT_SLACK_POST: either `text` input or `blocks` input is required'
    );
  }

  // blocks input port overrides config template.
  let blocks: SlackBlock[] | undefined;
  if (Array.isArray(inputs.blocks)) {
    blocks = inputs.blocks as SlackBlock[];
  } else if (typeof inputs.blocks === 'string' && inputs.blocks.trim()) {
    try {
      const parsed = JSON.parse(inputs.blocks);
      if (Array.isArray(parsed)) blocks = parsed;
    } catch {
      // ignore — fall through to template
    }
  }
  if (!blocks) {
    const template = (settings.blocksTemplate ??
      node.config.blocksTemplate) as string | undefined;
    if (template && template.trim()) {
      try {
        const parsed = JSON.parse(template);
        if (Array.isArray(parsed)) blocks = parsed;
      } catch {
        // invalid template — surface but not fatal; fall back to text-only.
      }
    }
  }

  // Channel can be either a webhook URL or a channel name/id.
  const isWebhook =
    channel.startsWith('https://hooks.slack.com/') ||
    channel.startsWith('http://hooks.slack.com/');

  if (isWebhook) {
    return postViaWebhook(channel, text, blocks, username, iconEmoji);
  }
  return postViaApi(channel, text, blocks, username, iconEmoji, threadTs);
}

async function postViaWebhook(
  url: string,
  text: string,
  blocks: SlackBlock[] | undefined,
  username: string | undefined,
  iconEmoji: string | undefined
): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
  const body: Record<string, unknown> = { text };
  if (blocks) body.blocks = blocks;
  if (username) body.username = username;
  if (iconEmoji) body.icon_emoji = iconEmoji;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(
      `OUTPUT_SLACK_POST webhook failed: ${response.status} ${errText}`
    );
  }
  // Webhooks don't return message timestamps or permalinks — output what we can.
  return {
    outputs: {
      messageTs: '',
      channelId: '',
      permalink: '',
      via: 'webhook',
    },
    assets: [],
  };
}

async function postViaApi(
  channel: string,
  text: string,
  blocks: SlackBlock[] | undefined,
  username: string | undefined,
  iconEmoji: string | undefined,
  threadTs: string | undefined
): Promise<{ outputs: Record<string, unknown>; assets: AssetReference[] }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'OUTPUT_SLACK_POST: SLACK_BOT_TOKEN not configured. ' +
        'Either set the env var or supply a webhook URL in the `channel` field.'
    );
  }
  const body: Record<string, unknown> = { channel, text };
  if (blocks) body.blocks = blocks;
  if (username) body.username = username;
  if (iconEmoji) body.icon_emoji = iconEmoji;
  if (threadTs) body.thread_ts = threadTs;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `OUTPUT_SLACK_POST chat.postMessage HTTP ${response.status}`
    );
  }
  const json = (await response.json()) as {
    ok: boolean;
    error?: string;
    ts?: string;
    channel?: string;
    message?: { permalink?: string };
  };
  if (!json.ok) {
    throw new Error(`OUTPUT_SLACK_POST slack error: ${json.error}`);
  }
  return {
    outputs: {
      messageTs: json.ts ?? '',
      channelId: json.channel ?? '',
      permalink: json.message?.permalink ?? '',
      via: 'api',
    },
    assets: [],
  };
}
