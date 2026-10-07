/**
 * Assistant feature types.
 *
 * The assistant is one prompt panel shared by the whole app. What it can do
 * depends on the screen the user is looking at (the "surface"); each surface
 * plugs in an adapter that knows how to describe its state to the model and
 * how to run the commands the model returns.
 */

/** Screen the prompt was sent from. */
export type AssistantSurface = 'image-editor' | 'video-editor' | 'workspace';

/** A parsed `<command>{...}</command>` block. Surfaces narrow `action`. */
export interface AssistantCommand {
  action: string;
}

export type CommandStatus = 'pending' | 'running' | 'success' | 'error';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Surface the conversation turn belongs to. */
  surface: AssistantSurface;
  command?: AssistantCommand;
  commandStatus?: CommandStatus;
  commandError?: string;
  /** Optional short note an executor returns on success (e.g. "queued"). */
  commandNote?: string;
}

/**
 * Surface adapter. `buildSnapshot` reads live editor/app state at send time,
 * `buildSystemPrompt` turns it into the system prompt (state + command
 * schema), and `parseCommand` / `executeCommand` handle the reply.
 *
 * `executeCommand` may resolve with a short note to show next to the
 * success badge.
 *
 * Declared with method syntax on purpose: a concrete adapter (e.g.
 * `AssistantAdapter<EditorStateSnapshot, EditorCommand>`) must be assignable
 * to the plain `AssistantAdapter` the shell passes around.
 */
export interface AssistantAdapter<
  TSnapshot = unknown,
  TCommand extends AssistantCommand = AssistantCommand,
> {
  surface: AssistantSurface;
  buildSnapshot(): TSnapshot;
  buildSystemPrompt(snapshot: TSnapshot): string;
  parseCommand(text: string): TCommand | null;
  executeCommand(command: TCommand): Promise<string | void>;
}
