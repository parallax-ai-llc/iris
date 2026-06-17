/**
 * Parallax Iris — integration output handlers (engine-resident parts).
 *
 *   OUTPUT_SLACK_POST — Slack chat.postMessage (Bot Token) or webhook URL.
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
