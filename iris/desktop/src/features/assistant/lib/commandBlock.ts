/**
 * Helpers for the `<command>{...}</command>` reply convention.
 *
 * Every surface asks the model to embed at most one JSON command block in its
 * reply. The block is executed and never shown to the user.
 */

import type { AssistantCommand } from '../types';

const COMMAND_BLOCK = /<command>([\s\S]*?)<\/command>/;
const COMMAND_BLOCKS = /<command>[\s\S]*?<\/command>/g;
/** A block that has started streaming but not closed yet. */
const OPEN_COMMAND_BLOCK = /<command>[\s\S]*$/;

/** Parse the first command block, or null when there is none or it is invalid. */
export function parseCommandBlock(text: string): AssistantCommand | null {
  const match = text.match(COMMAND_BLOCK);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { action?: unknown }).action === 'string'
    ) {
      return parsed as AssistantCommand;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove command blocks (finished or still streaming) from display text. */
export function stripCommandBlocks(text: string): string {
  return text.replace(COMMAND_BLOCKS, '').replace(OPEN_COMMAND_BLOCK, '').trim();
}
