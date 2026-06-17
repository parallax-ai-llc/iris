/**
 * Parallax Iris — Agent Runtime (GEN_TEXT_TO_TEXT mode='agent').
 *
 * Implements an OpenAI-compatible tool-use loop. The LLM is given a set of
 * workflow nodes (filtered by `canBeTool: true`) as callable tools and may
 * invoke them repeatedly until it decides to answer in plain text or hits
 * `maxIterations`.
 *
 * Why a standalone module: node-executor.ts is already ~2600 lines, and
 * tool-loop bookkeeping (message history, tool-call dispatch, recursive
 * node execution) has enough surface area to warrant separation.
 *
 * Safety rails (all enforced before the first LLM call):
 *  - Tools must be canBeTool=true in iris-nodes.
 *  - The agent node itself cannot be in its own tools list (no self-loop).
 *  - maxIterations is clamped to [1, 50].
 */

import { NODE_DEFINITIONS as SHARED_NODE_DEFINITIONS } from 'iris-nodes';
import type { EngineWorkflowNode } from './node-host.js';

/**
 * Minimal structural shape of an OpenAI-compatible chat-completions client.
 *
 * Defined structurally so this module never imports the OpenAI SDK (the engine
 * is deliberately dep-light). The Parallax cloud injects an `OpenAI` instance —
 * which satisfies this shape — while a local host can inject a thin raw-`fetch`
 * wrapper. Only the fields the agent loop actually reads are typed.
 */
export interface ChatCompletionMessageLike {
  role?: string;
  content?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ChatCompletionResponse {
  choices?: Array<{ message?: ChatCompletionMessageLike }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ChatCompletionClient {
  chat: {
    completions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(params: any): Promise<ChatCompletionResponse>;
    };
  };
}

/**
 * Build a minimal raw-`fetch` OpenAI chat-completions client. This is what the
 * engine injects instead of importing the `openai` SDK (the engine is
 * deliberately dep-light — trap #1). It implements only the one method the
 * agent loop calls, hitting the standard `/v1/chat/completions` endpoint.
 *
 * `baseUrl` defaults to OpenAI's API; an OpenAI-compatible gateway can override
 * it. The api key is passed in by the caller (resolved from `process.env` via
 * `getApiKeyForProvider`).
 */
export function createOpenAIChatClient(
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1'
): ChatCompletionClient {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    chat: {
      completions: {
        async create(params: unknown): Promise<ChatCompletionResponse> {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
          });
          if (!response.ok) {
            const errText = await response
              .text()
              .catch(() => response.statusText);
            throw new Error(
              `OpenAI chat.completions HTTP ${response.status}: ${errText}`
            );
          }
          return (await response.json()) as ChatCompletionResponse;
        },
      },
    },
  };
}

export interface ToolNode {
  /** Workflow-local node id (the `nodeId`, not the DB id). */
  nodeId: string;
  /** IrisNodeType value (e.g. "WEB_SEARCH"). */
  type: string;
  /** Human-readable label as the workflow author named the node. */
  label: string;
  /** The node's full config payload. */
  config: Record<string, unknown>;
}

/**
 * Result returned to the executor after the agent loop terminates.
 */
export interface AgentRunResult {
  /** Final assistant message — what the agent surfaces as its answer. */
  text: string;
  /**
   * Total prompt + completion tokens summed across every LLM round. The
   * caller turns this into `estimatedCost` via the model pricing table.
   */
  inputTokensTotal: number;
  outputTokensTotal: number;
  /** Total iterations performed (1 = single round, no tool calls). */
  iterations: number;
  /** Whether the run terminated by hitting the maxIterations cap. */
  truncated: boolean;
  /** Trace of each tool call made — useful for logs and UI inspector. */
  toolCalls: Array<{
    name: string;
    nodeId: string;
    args: Record<string, unknown>;
    result: unknown;
    error?: string;
  }>;
}

export type ToolDispatchFn = (
  tool: ToolNode,
  args: Record<string, unknown>
) => Promise<unknown>;

export interface RunAgentOptions {
  client: ChatCompletionClient;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  tools: ToolNode[];
  maxIterations: number;
  /**
   * Called when the LLM emits a tool_call. Implementations should execute
   * the corresponding node and return its outputs to be fed back as the
   * `tool` role response. Errors surface as `{ error }` to the LLM.
   */
  dispatchTool: ToolDispatchFn;
  /** Override for temperature; defaults to 0.7. */
  temperature?: number;
  /** Override for max_tokens; defaults to 16000. */
  maxTokens?: number;
}

/**
 * Translate a NodeDefinition's input ports into a JSON Schema parameters
 * object suitable for the OpenAI `tools[].function.parameters` slot.
 *
 * Unsupported port types (image/video/audio) get filtered out — an agent
 * can't usefully construct binary payloads from inside a chat completion.
 */
export function toolParametersSchema(nodeType: string): {
  schema: Record<string, unknown>;
  unsupportedPorts: string[];
} {
  const def = SHARED_NODE_DEFINITIONS[nodeType];
  if (!def) {
    return {
      schema: { type: 'object', properties: {}, required: [] },
      unsupportedPorts: [],
    };
  }
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  const unsupportedPorts: string[] = [];

  for (const port of def.inputs) {
    switch (port.type) {
      case 'text':
        properties[port.name] = { type: 'string', description: port.label };
        break;
      case 'json':
      case 'any':
        properties[port.name] = {
          type: 'string',
          description: `${port.label} (pass JSON-encoded for complex values)`,
        };
        break;
      case 'image':
      case 'video':
      case 'audio':
      case 'document':
      case 'trigger':
        unsupportedPorts.push(port.name);
        continue;
    }
    if (port.required) required.push(port.name);
  }

  return {
    schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
    unsupportedPorts,
  };
}

/**
 * Filter the user-selected tool node IDs down to runnable tool nodes.
 *
 * Enforces:
 *  - Skipped: nodes whose iris-nodes definition has `canBeTool !== true`.
 *  - Skipped: the agent node itself (matched by `agentNodeId`).
 *  - Skipped: every other GEN_TEXT_TO_TEXT node in 'agent' mode — nested
 *    agents are valuable but not in Phase 1, and avoiding them is the
 *    easiest infinite-loop guard.
 */
export function selectTools(
  configuredNodeIds: string[],
  workflowNodes: EngineWorkflowNode[],
  agentNodeId: string
): { tools: ToolNode[]; rejected: Array<{ nodeId: string; reason: string }> } {
  const tools: ToolNode[] = [];
  const rejected: Array<{ nodeId: string; reason: string }> = [];

  const byNodeId = new Map(workflowNodes.map(n => [n.nodeId, n]));

  for (const nid of configuredNodeIds) {
    if (nid === agentNodeId) {
      rejected.push({
        nodeId: nid,
        reason: 'self-reference (cannot use the agent as its own tool)',
      });
      continue;
    }
    const node = byNodeId.get(nid);
    if (!node) {
      rejected.push({ nodeId: nid, reason: 'node not found in workflow' });
      continue;
    }
    const def = SHARED_NODE_DEFINITIONS[node.type];
    if (!def) {
      rejected.push({ nodeId: nid, reason: `unknown node type: ${node.type}` });
      continue;
    }
    // Reject nested agents BEFORE the canBeTool check — the error message
    // "nested agent" is more diagnostic than "canBeTool=false" for users
    // who accidentally pick another agent node.
    if (node.type === 'GEN_TEXT_TO_TEXT') {
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const settings = (cfg.settings ?? {}) as Record<string, unknown>;
      const mode = (settings.mode ?? cfg.mode) as string | undefined;
      if (mode === 'agent') {
        rejected.push({
          nodeId: nid,
          reason: 'nested agent mode (would risk uncontrolled recursion)',
        });
        continue;
      }
    }
    if (!def.canBeTool) {
      rejected.push({
        nodeId: nid,
        reason: `node type ${node.type} is not tool-callable (canBeTool=false)`,
      });
      continue;
    }
    tools.push({
      nodeId: node.nodeId,
      type: node.type,
      label: node.label,
      config: (node.config ?? {}) as Record<string, unknown>,
    });
  }

  return { tools, rejected };
}

/**
 * Build the OpenAI tools[] payload for the chat completion request. Tool
 * names are the iris-nodes type (e.g. "WEB_SEARCH") — tool dispatch then
 * pivots back to nodeId via the `tools` list passed alongside.
 *
 * If multiple tool nodes share the same type, we append a `__N` suffix to
 * keep names unique (the LLM has to pick one when there's a name collision
 * anyway).
 */
export function buildToolPayload(tools: ToolNode[]): {
  payload: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  /** Map from generated tool name back to the ToolNode entry. */
  nameToTool: Map<string, ToolNode>;
} {
  const payload: ReturnType<typeof buildToolPayload>['payload'] = [];
  const nameToTool = new Map<string, ToolNode>();
  const seenNames = new Map<string, number>();

  for (const tool of tools) {
    let name = tool.type;
    const seen = seenNames.get(name) ?? 0;
    if (seen > 0) name = `${name}__${seen + 1}`;
    seenNames.set(tool.type, seen + 1);

    const def = SHARED_NODE_DEFINITIONS[tool.type];
    const description = def?.description ?? tool.label;
    const { schema } = toolParametersSchema(tool.type);

    payload.push({
      type: 'function',
      function: { name, description, parameters: schema },
    });
    nameToTool.set(name, tool);
  }

  return { payload, nameToTool };
}

/**
 * Run the agent loop. Returns once the LLM emits a final text response or
 * `maxIterations` is exhausted.
 */
export async function runAgent(
  options: RunAgentOptions
): Promise<AgentRunResult> {
  const {
    client,
    model,
    systemPrompt,
    userPrompt,
    tools,
    maxIterations,
    dispatchTool,
    temperature = 0.7,
    maxTokens = 16000,
  } = options;

  const clampedMax = Math.max(1, Math.min(50, Math.floor(maxIterations)));
  const { payload: toolsPayload, nameToTool } = buildToolPayload(tools);

  // Build the running conversation. OpenAI's chat-completion message types
  // are intentionally loose here (`any`) to accommodate the heterogeneous
  // user/assistant/tool shapes without a giant union — runtime shape is
  // what OpenAI's SDK validates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const trace: AgentRunResult['toolCalls'] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let iterations = 0;
  let truncated = false;

  while (iterations < clampedMax) {
    iterations += 1;

    // GPT-5/o1/o3 reject custom temperature & need max_completion_tokens —
    // mirror openai-adapter's special-case here so users can run reasoning
    // models as agents.
    const isReasoning =
      model.startsWith('gpt-5') ||
      model.startsWith('o1') ||
      model.startsWith('o3');
    const tokenParam = isReasoning
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens, temperature };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionParams: any = {
      model,
      messages,
      ...tokenParam,
    };
    if (toolsPayload.length > 0) {
      completionParams.tools = toolsPayload;
      completionParams.tool_choice = 'auto';
    }

    const completion = await client.chat.completions.create(completionParams);
    const choice = completion.choices?.[0];
    inputTokensTotal += completion.usage?.prompt_tokens ?? 0;
    outputTokensTotal += completion.usage?.completion_tokens ?? 0;

    if (!choice?.message) {
      // Defensive — no choice means the API gave us nothing useful. Stop.
      return {
        text: '',
        inputTokensTotal,
        outputTokensTotal,
        iterations,
        truncated: false,
        toolCalls: trace,
      };
    }

    const message = choice.message;
    messages.push(message);

    const toolCalls = (message.tool_calls ?? []) as Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;

    // Plain-text answer — we're done.
    if (toolCalls.length === 0) {
      return {
        text: message.content ?? '',
        inputTokensTotal,
        outputTokensTotal,
        iterations,
        truncated: false,
        toolCalls: trace,
      };
    }

    // Dispatch every requested tool call (OpenAI supports parallel tool
    // calls in a single turn). Each result is appended as a `role: 'tool'`
    // message keyed by tool_call_id so the next round can reason on them.
    for (const call of toolCalls) {
      const tool = nameToTool.get(call.function.name);
      if (!tool) {
        const errorMsg = `Unknown tool: ${call.function.name}`;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: errorMsg }),
        });
        trace.push({
          name: call.function.name,
          nodeId: '',
          args: {},
          result: null,
          error: errorMsg,
        });
        continue;
      }

      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch (err) {
        const errorMsg = `Failed to parse tool args: ${(err as Error).message}`;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: errorMsg }),
        });
        trace.push({
          name: call.function.name,
          nodeId: tool.nodeId,
          args: {},
          result: null,
          error: errorMsg,
        });
        continue;
      }

      try {
        const result = await dispatchTool(tool, args);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
        trace.push({
          name: call.function.name,
          nodeId: tool.nodeId,
          args,
          result,
        });
      } catch (err) {
        const errorMsg = (err as Error).message;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: errorMsg }),
        });
        trace.push({
          name: call.function.name,
          nodeId: tool.nodeId,
          args,
          result: null,
          error: errorMsg,
        });
      }
    }
  }

  // Cap reached. Surface whatever the last assistant message held as the
  // best-effort answer, with truncated=true so callers can flag it.
  truncated = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastAssistant = [...messages]
    .reverse()
    .find((m: any) => m.role === 'assistant');
  return {
    text:
      typeof (lastAssistant as { content?: string })?.content === 'string'
        ? (lastAssistant as { content: string }).content
        : '',
    inputTokensTotal,
    outputTokensTotal,
    iterations,
    truncated,
    toolCalls: trace,
  };
}
