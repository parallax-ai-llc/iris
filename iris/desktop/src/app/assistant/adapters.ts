/**
 * Surface adapters for the app-wide assistant.
 *
 * The image and video editor adapters reuse each editor's own `chat/`
 * modules (system prompt, command parser, executor, state snapshot). The
 * workspace adapter covers every other screen.
 *
 * These live in the app (assembly) layer because the workspace adapter reads
 * several features' stores; features stay unaware of each other.
 */

import type { AssistantAdapter } from '@/features/assistant';
import { buildEditorSnapshot } from '@/features/image-editor/chat/snapshot';
import { buildSystemPrompt, type EditorStateSnapshot } from '@/features/image-editor/chat/systemPrompt';
import { parseCommand, executeCommand, type EditorCommand } from '@/features/image-editor/chat/commandExecutor';
import { getActiveStore } from '@/features/image-editor/stores/imageEditorRegistry';
import { buildVideoSnapshot } from '@/features/video-editor/chat/snapshot';
import { buildVideoSystemPrompt, type VideoEditorStateSnapshot } from '@/features/video-editor/chat/systemPrompt';
import {
  parseVideoCommand,
  executeVideoCommand,
  type VideoEditorCommand,
} from '@/features/video-editor/chat/commandExecutor';
import { buildWorkspaceSnapshot, type WorkspaceSnapshot } from './workspace/snapshot';
import { buildWorkspaceSystemPrompt } from './workspace/systemPrompt';
import {
  parseWorkspaceCommand,
  executeWorkspaceCommand,
  type WorkspaceCommand,
} from './workspace/commandExecutor';

export const imageEditorAdapter: AssistantAdapter<EditorStateSnapshot, EditorCommand> = {
  surface: 'image-editor',
  buildSnapshot: buildEditorSnapshot,
  buildSystemPrompt,
  parseCommand,
  // Resolve the tab at execution time: the reply may land after a tab switch.
  executeCommand: (command) => executeCommand(command, getActiveStore()),
};

export const videoEditorAdapter: AssistantAdapter<VideoEditorStateSnapshot, VideoEditorCommand> = {
  surface: 'video-editor',
  buildSnapshot: buildVideoSnapshot,
  buildSystemPrompt: buildVideoSystemPrompt,
  parseCommand: parseVideoCommand,
  executeCommand: executeVideoCommand,
};

export const workspaceAdapter: AssistantAdapter<WorkspaceSnapshot, WorkspaceCommand> = {
  surface: 'workspace',
  buildSnapshot: buildWorkspaceSnapshot,
  buildSystemPrompt: buildWorkspaceSystemPrompt,
  parseCommand: parseWorkspaceCommand,
  executeCommand: executeWorkspaceCommand,
};
