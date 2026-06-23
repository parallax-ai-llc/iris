/**
 * Parallax Iris - Workflow Engine
 * Main orchestrator for workflow execution
 */

import { EventEmitter } from 'events';
import {
  ExecutionOptions,
  ExecutionState,
  WorkflowGraph,
  NodeResult,
  AssetReference,
  GraphNode,
  IrisExecutionStatus,
  IrisTriggerType,
} from './types.js';
import {
  WorkflowStore,
  EngineExecution,
  EngineExecutionResult,
  WorkflowRunOutcome,
} from './workflow-store.js';
import { NodeExecutorHost } from './node-host.js';
import {
  DEFAULT_EXECUTION_TIMEOUT,
  MAX_NODE_RETRIES,
  RETRY_DELAY_BASE,
  MAX_LOOP_ITERATIONS_TOTAL,
  LOOP_ITERATION_MIN_DELAY_MS,
} from './execution-constants.js';
import { WorkflowNotFoundError, ExecutionFailedError } from './errors.js';
import { GraphTraverser } from './graph-traverser.js';
import { NodeExecutor } from './node-executor.js';

/** Events emitted by the workflow engine */
export interface WorkflowEngineEvents {
  'execution:started': { executionId: string; workflowId: string };
  'execution:completed': {
    executionId: string;
    status: string;
    assets: AssetReference[];
    duration: number;
  };
  'execution:cancelled': { executionId: string };
  'execution:error': { executionId: string; error: string };
  'node:started': { executionId: string; nodeId: string };
  'node:completed': { executionId: string; nodeId: string; result: NodeResult };
  'node:failed': { executionId: string; nodeId: string; error: string };
  'node:progress': {
    executionId: string;
    nodeId: string;
    percent: number;
    message?: string;
  };
}

export class WorkflowEngine extends EventEmitter {
  private store: WorkflowStore;
  private nodeHost: NodeExecutorHost;
  private graphTraverser: GraphTraverser;
  private nodeExecutor: NodeExecutor;

  /** Active executions (for cancellation) */
  private activeExecutions: Map<string, ExecutionState> = new Map();

  /**
   * @param store    persistence seam (workflows / executions / node results /
   *                 logs / stats) — owns the `nodeId ↔ row id` mapping.
   * @param nodeHost media / assets / usage / transcription host the node
   *                 executor + heavy handlers run against.
   */
  constructor(store: WorkflowStore, nodeHost: NodeExecutorHost) {
    super();
    this.store = store;
    this.nodeHost = nodeHost;
    this.graphTraverser = new GraphTraverser();
    this.nodeExecutor = new NodeExecutor(nodeHost);
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflowId: string,
    userId: string,
    options: ExecutionOptions = {}
  ): Promise<EngineExecution> {
    // 1. Load workflow with nodes and edges
    const workflow = await this.loadWorkflow(workflowId);

    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }

    // 2. Build execution graph
    const graph = this.graphTraverser.buildGraph(
      workflow.nodes,
      workflow.edges
    );

    // 3. Validate graph
    const validation = this.graphTraverser.validateGraph(graph);
    if (!validation.valid) {
      throw new ExecutionFailedError(
        `Invalid workflow: ${validation.errors.join(', ')}`
      );
    }

    // 4. Create execution record
    const execution = await this.store.createExecution({
      workflowId,
      userId,
      triggerType: this.mapTriggerType(options.trigger?.type),
      triggerData: options.trigger?.data ?? {},
      inputData: options.inputs ?? {},
      batchJobId: options.batchJobId,
    });

    // 5. Initialize execution state
    // Merge trigger data into variables so it's accessible by nodes
    const triggerData = options.trigger?.data ?? {};
    const initialVariables = {
      ...options.inputs,
      ...triggerData,
      // Also store as _triggerInput for explicit access
      _triggerInput:
        (triggerData as Record<string, unknown>).inputValue ?? null,
      _triggerType:
        (triggerData as Record<string, unknown>).inputType ?? 'text',
    };

    const state: ExecutionState = {
      id: execution.id,
      workflowId,
      status: 'pending',
      completedNodes: new Set(),
      nodeResults: new Map(),
      variables: new Map(Object.entries(initialVariables)),
      assets: [],
      startTime: Date.now(),
      totalTokens: 0,
      totalCost: 0,
    };

    this.activeExecutions.set(execution.id, state);

    // 6. Run execution in background
    this.runExecution(execution.id, workflow, graph, state, options).catch(
      error => {
        this.handleExecutionError(execution.id, error);
      }
    );

    return execution;
  }

  /**
   * Main execution loop
   */
  private async runExecution(
    executionId: string,
    workflow: Awaited<ReturnType<typeof this.loadWorkflow>>,
    graph: WorkflowGraph,
    state: ExecutionState,
    options: ExecutionOptions
  ): Promise<void> {
    if (!workflow) return;

    const timeout = options.timeout ?? DEFAULT_EXECUTION_TIMEOUT;
    const timeoutTimer = setTimeout(() => {
      state.status = 'failed';
      state.error = {
        nodeId: state.currentNodeId ?? 'unknown',
        message: 'Execution timed out',
        code: 'TIMEOUT',
      };
    }, timeout);

    try {
      // Update status to running
      state.status = 'running';
      await this.updateExecutionStatus(executionId, 'RUNNING');

      // Log execution start
      await this.createLog(executionId, {
        eventType: 'EXECUTION_START',
        message: `Started workflow execution: ${workflow.name}`,
        data: { workflowId: state.workflowId, inputs: options.inputs },
      });

      this.emit('execution:started', {
        executionId,
        workflowId: state.workflowId,
      });

      // Get execution order
      const executionOrder = options.startNodeId
        ? this.graphTraverser.getSubgraphOrder(
            graph,
            options.startNodeId,
            options.endNodeId
          )
        : graph.topologicalOrder;

      // Track nodes already executed as part of a loop body (skip in main pass)
      const skipNodes = new Set<string>();

      // Execute nodes in order
      for (const nodeId of executionOrder) {
        // Check cancellation (cast to check all possible status values)
        if ((state.status as string) === 'cancelled') {
          break;
        }

        // Check timeout
        if (state.error?.code === 'TIMEOUT') {
          break;
        }

        // Skip nodes that were executed as part of a loop body
        if (skipNodes.has(nodeId)) {
          continue;
        }

        // Check if dependencies are satisfied
        const graphNode = graph.nodes.get(nodeId)!;
        const dependenciesMet = Array.from(graphNode.dependencies).every(
          depId => state.completedNodes.has(depId)
        );

        if (!dependenciesMet) {
          throw new ExecutionFailedError(
            `Dependencies not met for node: ${nodeId}`
          );
        }

        // Execute the node
        state.currentNodeId = nodeId;
        const nodeStartTime = Date.now();

        // Log node start
        await this.createLog(executionId, {
          nodeId,
          eventType: 'NODE_START',
          message: `Started node: ${nodeId}`,
          data: { nodeType: graphNode.type },
        });

        // Loop nodes: fan-out the body subgraph
        if (graphNode.type === 'UTIL_LOOP') {
          const accumulator = new Map<string, NodeResult[]>();
          const loopResult = await this.executeLoopBlock(
            graphNode,
            graph,
            state,
            workflow,
            executionId,
            accumulator
          );

          // Save loop node's own result
          await this.persistAggregatedResult(
            executionId,
            workflow,
            nodeId,
            loopResult
          );
          state.nodeResults.set(nodeId, loopResult);
          state.completedNodes.add(nodeId);
          this.emit('node:completed', {
            executionId,
            nodeId,
            result: loopResult,
          });

          // Save aggregated results for each body node
          for (const [bodyNodeId, iterations] of accumulator) {
            const bodyNodeType = graph.nodes.get(bodyNodeId)?.type;
            const aggregated = this.aggregateIterationResults(
              bodyNodeId,
              iterations,
              bodyNodeType
            );
            await this.persistAggregatedResult(
              executionId,
              workflow,
              bodyNodeId,
              aggregated
            );
            state.nodeResults.set(bodyNodeId, aggregated);
            state.completedNodes.add(bodyNodeId);
            skipNodes.add(bodyNodeId);
            this.emit('node:completed', {
              executionId,
              nodeId: bodyNodeId,
              result: aggregated,
            });
          }

          await this.createLog(executionId, {
            nodeId,
            eventType: 'NODE_END',
            message: `Loop completed: ${(loopResult.outputs?.iterationCount as number) ?? 0} iterations`,
            data: {
              iterationCount: loopResult.outputs?.iterationCount,
              bodySize: accumulator.size,
            },
            duration: Date.now() - nodeStartTime,
          });
          continue;
        }

        // UTIL_SUB_WORKFLOW is intercepted here so it can call execute()
        // recursively with depth + cycle guards. The bare handler in
        // node-executor only emits an error message.
        let result: NodeResult;
        if (graphNode.type === 'UTIL_SUB_WORKFLOW') {
          result = await this.executeSubWorkflow(
            graphNode,
            workflow,
            state,
            options
          );
        } else {
          result = await this.executeNode(
            executionId,
            graphNode,
            graph,
            state,
            workflow
          );
        }

        // Store result
        state.nodeResults.set(nodeId, result);

        // Handle node result
        const nodeDuration = Date.now() - nodeStartTime;

        if (result.status === 'failed') {
          // Look for a downstream UTIL_TRY_CATCH — if one exists, convert
          // this failure into an error envelope flowing along the edge
          // instead of killing the whole workflow. Retries happen inside
          // executeNode already (MAX_NODE_RETRIES); TRY_CATCH absorbs what
          // remains.
          const tryCatchDownstream = this.hasDownstreamTryCatch(
            graphNode.id,
            graph
          );
          if (
            tryCatchDownstream &&
            result.error?.code !== 'INSUFFICIENT_TOKENS'
          ) {
            const envelope = {
              __irisError: true as const,
              message: result.error?.message ?? 'Unknown error',
              stack: result.error?.stack,
              retryCount: 0,
              code: result.error?.code,
            };
            // Stamp envelope on every declared output port + a sentinel key
            // so gatherInputs picks it up regardless of which port the
            // TRY_CATCH's `input` edge sources from.
            const stampedOutputs: Record<string, unknown> = {
              ...result.outputs,
              __irisError: envelope,
            };
            const sourceGraphNode = graph.nodes.get(graphNode.id);
            if (sourceGraphNode) {
              for (const portId of sourceGraphNode.outputs.keys()) {
                stampedOutputs[portId] = envelope;
              }
            }
            const recovered: NodeResult = {
              ...result,
              status: 'completed',
              outputs: stampedOutputs,
              error: undefined,
            };
            state.nodeResults.set(nodeId, recovered);
            state.completedNodes.add(nodeId);

            await this.createLog(executionId, {
              nodeId,
              level: 'WARN',
              eventType: 'NODE_ERROR_CAUGHT',
              message: `Node failed; routed to downstream UTIL_TRY_CATCH: ${envelope.message}`,
              data: { errorCode: envelope.code },
              duration: nodeDuration,
            });

            this.emit('node:completed', {
              executionId,
              nodeId,
              result: recovered,
            });
            continue;
          }

          // Log node failure
          await this.createLog(executionId, {
            nodeId,
            level: 'ERROR',
            eventType: 'NODE_ERROR',
            message: `Node failed: ${result.error?.message ?? 'Unknown error'}`,
            data: {
              errorCode: result.error?.code,
              errorMessage: result.error?.message,
              stack: result.error?.stack,
            },
            duration: nodeDuration,
          });

          state.status = 'failed';
          state.error = {
            nodeId,
            message: result.error?.message ?? 'Unknown error',
            code: result.error?.code ?? 'UNKNOWN',
          };

          // If tokens are insufficient during automated execution, pause the workflow
          if (
            result.error?.code === 'INSUFFICIENT_TOKENS' &&
            options.trigger?.type &&
            options.trigger.type !== 'manual'
          ) {
            await this.pauseWorkflowDueToInsufficientTokens(
              state.workflowId,
              result.error.requiredTokens,
              result.error.remainingTokens
            );
          }

          break;
        }

        // Log node success
        await this.createLog(executionId, {
          nodeId,
          eventType: 'NODE_END',
          message: `Completed node: ${nodeId}`,
          data: {
            assetsCount: result.assets?.length || 0,
            tokensUsed: result.usage?.totalTokens,
          },
          duration: nodeDuration,
        });

        // Log node result with outputs
        if (result.outputs || (result.assets && result.assets.length > 0)) {
          const resultData: Record<string, unknown> = {};

          // Include text/string outputs
          if (result.outputs) {
            for (const [key, value] of Object.entries(result.outputs)) {
              if (typeof value === 'string') {
                // Truncate long text but keep it readable
                resultData[key] =
                  value.length > 500 ? `${value.substring(0, 500)}...` : value;
              } else if (
                typeof value === 'number' ||
                typeof value === 'boolean'
              ) {
                resultData[key] = value;
              } else if (Array.isArray(value)) {
                resultData[key] = `[Array: ${value.length} items]`;
              } else if (value && typeof value === 'object') {
                resultData[key] = '[Object]';
              }
            }
          }

          // Include asset info with IDs for encrypted access
          if (result.assets && result.assets.length > 0) {
            resultData.assets = result.assets.map(asset => ({
              id: asset.id,
              type: asset.type,
              url: asset.url,
            }));
          }

          await this.createLog(executionId, {
            nodeId,
            eventType: 'NODE_RESULT',
            message: `Node output: ${Object.keys(resultData).join(', ')}`,
            data: resultData,
          });
        }

        // Mark as completed
        state.completedNodes.add(nodeId);

        // Collect assets and save to library
        if (result.assets && result.assets.length > 0) {
          state.assets.push(...result.assets);

          // Save each IMAGE/VIDEO/AUDIO asset to the IrisAsset table
          for (const asset of result.assets) {
            await this.saveAssetToLibrary(
              asset,
              workflow.userId,
              state.workflowId,
              executionId,
              nodeId
            );
          }
        }

        // Track usage
        if (result.usage) {
          state.totalTokens += result.usage.totalTokens ?? 0;
          state.totalCost += result.usage.estimatedCost;
        }

        // Save node result to database
        await this.saveNodeResult(executionId, nodeId, result);

        this.emit('node:completed', {
          executionId,
          nodeId,
          result,
        });
      }

      // Finalize execution
      state.endTime = Date.now();
      const totalDuration = state.endTime - state.startTime;

      if (
        (state.status as string) !== 'failed' &&
        (state.status as string) !== 'cancelled'
      ) {
        state.status = 'completed';

        // Save final outputs to storage
        await this.saveOutputAssets(executionId, state, workflow);

        // Log successful completion
        await this.createLog(executionId, {
          eventType: 'EXECUTION_END',
          message: `Workflow completed successfully`,
          data: {
            nodesExecuted: state.completedNodes.size,
            totalAssets: state.assets.length,
            totalTokens: state.totalTokens,
            totalCost: state.totalCost,
          },
          duration: totalDuration,
        });
      } else if ((state.status as string) === 'failed' && state.error) {
        // Log failed completion
        await this.createLog(executionId, {
          level: 'ERROR',
          eventType: 'EXECUTION_END',
          message: `Workflow failed at node: ${state.error.nodeId}`,
          data: {
            errorNodeId: state.error.nodeId,
            errorMessage: state.error.message,
            errorCode: state.error.code,
          },
          duration: totalDuration,
        });
      } else if ((state.status as string) === 'cancelled') {
        // Log cancelled execution
        await this.createLog(executionId, {
          level: 'WARN',
          eventType: 'EXECUTION_CANCELLED',
          message: `Workflow execution cancelled`,
          duration: totalDuration,
        });
      }

      // Update execution record
      await this.finalizeExecution(executionId, state);

      // Cleanup
      this.activeExecutions.delete(executionId);

      this.emit('execution:completed', {
        executionId,
        status: state.status,
        assets: state.assets,
        duration: totalDuration,
      });
    } catch (error) {
      this.handleExecutionError(executionId, error as Error);
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    executionId: string,
    graphNode: GraphNode,
    _graph: WorkflowGraph,
    state: ExecutionState,
    workflow: NonNullable<Awaited<ReturnType<typeof this.loadWorkflow>>>
  ): Promise<NodeResult> {
    const startTime = Date.now();

    // Find the actual node data first (needed for config-based inputs)
    const nodeData = workflow.nodes.find(n => n.nodeId === graphNode.id);

    // Gather inputs from connected nodes
    const inputs = this.gatherInputs(graphNode, state, nodeData);

    if (!nodeData) {
      return {
        nodeId: graphNode.id,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: `Node data not found: ${graphNode.id}`,
          code: 'NODE_NOT_FOUND',
        },
      };
    }

    // Create node result record (store resolves nodeId → row id)
    await this.store.startNodeResult(executionId, nodeData.nodeId, inputs);

    this.emit('node:started', { executionId, nodeId: graphNode.id });

    // Retry logic
    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount <= MAX_NODE_RETRIES) {
      try {
        const result = await this.nodeExecutor.execute({
          node: {
            type: nodeData.type,
            nodeId: nodeData.nodeId,
            label: nodeData.label,
            config: nodeData.config as Record<string, unknown>,
            inputPorts: nodeData.inputPorts as any,
            outputPorts: nodeData.outputPorts as any,
            providerId: nodeData.providerId ?? undefined,
          },
          inputs,
          variables: Object.fromEntries(state.variables),
          context: {
            executionId,
            workflowId: state.workflowId,
            userId: workflow.userId,
          },
        });

        result.duration = Date.now() - startTime;

        // Store outputs in variables if needed
        if (result.outputs) {
          for (const [key, value] of Object.entries(result.outputs)) {
            state.variables.set(`${graphNode.id}.${key}`, value);
          }
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        if (retryCount <= MAX_NODE_RETRIES) {
          // Exponential backoff
          const delay = Math.min(
            RETRY_DELAY_BASE * Math.pow(2, retryCount - 1),
            30000
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    return {
      nodeId: graphNode.id,
      status: 'failed',
      outputs: {},
      assets: [],
      duration: Date.now() - startTime,
      error: {
        message: lastError?.message ?? 'Unknown error',
        code: 'EXECUTION_ERROR',
        stack: lastError?.stack,
      },
    };
  }

  /**
   * Gather inputs from connected nodes and node config
   */
  private gatherInputs(
    graphNode: GraphNode,
    state: ExecutionState,
    nodeData?: NonNullable<
      Awaited<ReturnType<typeof this.loadWorkflow>>
    >['nodes'][0]
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // First, gather inputs from node config (URL, storage, user inputs)
    // These serve as defaults/fallbacks when no edge connection exists
    if (nodeData?.config) {
      const config = nodeData.config as Record<string, unknown>;
      const configInputs = config.inputs as
        | Record<
            string,
            {
              source?: string;
              value?: string;
              storageAssetId?: string;
              nodeId?: string;
              outputName?: string;
            }
          >
        | undefined;

      if (configInputs) {
        for (const [inputName, inputConfig] of Object.entries(configInputs)) {
          if (!inputConfig) continue;

          // Handle URL source - direct URL value
          if (inputConfig.source === 'url' && inputConfig.value) {
            inputs[inputName] = inputConfig.value;
          }
          // Handle storage source - storageAssetId as the value
          else if (
            inputConfig.source === 'storage' &&
            inputConfig.storageAssetId
          ) {
            inputs[inputName] = inputConfig.storageAssetId;
          }
          // Handle user input source - direct value
          else if (inputConfig.source === 'user' && inputConfig.value) {
            inputs[inputName] = inputConfig.value;
          }
        }
      }
    }

    // Then, override with connected node outputs (edge connections take priority)
    for (const [portId, connection] of graphNode.inputs) {
      const sourceResult = state.nodeResults.get(connection.nodeId);
      if (
        sourceResult?.outputs &&
        Object.prototype.hasOwnProperty.call(
          sourceResult.outputs,
          connection.portId
        )
      ) {
        // Get the output from the source port
        const value = sourceResult.outputs[connection.portId];
        if (value !== undefined) {
          inputs[portId] = value;
        }
      }
    }

    return inputs;
  }

  /**
   * Cancel an active execution
   */
  async cancel(executionId: string): Promise<boolean> {
    const state = this.activeExecutions.get(executionId);

    if (!state) {
      return false;
    }

    state.status = 'cancelled';
    await this.updateExecutionStatus(executionId, 'CANCELLED');

    this.emit('execution:cancelled', { executionId });

    return true;
  }

  /**
   * Get execution status
   */
  getExecutionState(executionId: string): ExecutionState | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Check if execution is active
   */
  isExecutionActive(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  /**
   * Load workflow with all nodes and edges (delegated to the store, which owns
   * Prisma access and the nodeId↔dbId mapping).
   */
  private async loadWorkflow(workflowId: string) {
    return this.store.loadWorkflow(workflowId);
  }

  private mapTriggerType(type?: string): IrisTriggerType {
    switch (type) {
      case 'webhook':
        return 'WEBHOOK';
      case 'schedule':
        return 'SCHEDULE';
      case 'directory':
        return 'DIRECTORY_WATCH';
      case 'api':
        return 'API';
      case 'form':
        return 'FORM';
      default:
        return 'MANUAL';
    }
  }

  private async updateExecutionStatus(
    executionId: string,
    status: IrisExecutionStatus
  ): Promise<void> {
    await this.store.updateExecutionStatus(executionId, status);
  }

  private async saveNodeResult(
    executionId: string,
    nodeId: string,
    result: NodeResult
  ): Promise<void> {
    // The store owns the nodeId → row id mapping and the status-enum cast.
    await this.store.saveNodeResult(executionId, nodeId, result);
  }

  /**
   * Execute a loop's body N times. Per-iteration results are pushed into the
   * shared accumulator; persistence is handled by the caller.
   */
  private async executeLoopBlock(
    loopGraphNode: GraphNode,
    graph: WorkflowGraph,
    state: ExecutionState,
    workflow: NonNullable<Awaited<ReturnType<typeof this.loadWorkflow>>>,
    executionId: string,
    accumulator: Map<string, NodeResult[]>
  ): Promise<NodeResult> {
    const startTime = Date.now();

    const loopNodeData = workflow.nodes.find(
      n => n.nodeId === loopGraphNode.id
    );
    const loopInputs = this.gatherInputs(loopGraphNode, state, loopNodeData);
    const rawItems = loopInputs.items;
    const items: unknown[] = Array.isArray(rawItems)
      ? rawItems
      : rawItems == null
        ? []
        : [rawItems];

    const loopConfig = (loopNodeData?.config ?? {}) as Record<string, unknown>;
    const loopSettings = (loopConfig.settings ?? {}) as Record<string, unknown>;
    const maxIterRaw = loopSettings.maxIterations ?? loopConfig.maxIterations;
    const maxIterations =
      Number(maxIterRaw ?? MAX_LOOP_ITERATIONS_TOTAL) ||
      MAX_LOOP_ITERATIONS_TOTAL;
    const N = Math.max(
      0,
      Math.min(items.length, maxIterations, MAX_LOOP_ITERATIONS_TOTAL)
    );

    const body = this.graphTraverser.getLoopBody(graph, loopGraphNode.id);

    // Pre-create node-result rows for the loop and its body nodes so polling
    // sees them as RUNNING and can pick up incremental progress per iteration.
    // The store owns the nodeId → row id mapping, so the engine addresses rows
    // purely by nodeId.
    if (loopNodeData) {
      await this.store.ensureNodeResult(executionId, loopGraphNode.id);
    }
    for (const bodyId of body) {
      const bodyNodeData = workflow.nodes.find(n => n.nodeId === bodyId);
      if (!bodyNodeData) continue;
      await this.store.ensureNodeResult(executionId, bodyId);
    }

    for (let i = 0; i < N; i++) {
      // Expose this iteration's value via the loop's nodeResult & variables.
      const iterLoopResult: NodeResult = {
        nodeId: loopGraphNode.id,
        status: 'completed',
        outputs: { item: items[i], index: i, items, iterationCount: N },
        assets: [],
        duration: 0,
      };
      state.nodeResults.set(loopGraphNode.id, iterLoopResult);
      state.variables.set(`${loopGraphNode.id}.item`, items[i]);
      state.variables.set(`${loopGraphNode.id}.index`, i);

      const localCompleted = new Set<string>();

      for (const bodyId of body) {
        if (localCompleted.has(bodyId)) continue;

        const bodyGraphNode = graph.nodes.get(bodyId);
        const bodyNodeData = workflow.nodes.find(n => n.nodeId === bodyId);
        if (!bodyGraphNode || !bodyNodeData) continue;

        // Recurse into nested loops
        if (bodyGraphNode.type === 'UTIL_LOOP') {
          const nestedResult = await this.executeLoopBlock(
            bodyGraphNode,
            graph,
            state,
            workflow,
            executionId,
            accumulator
          );
          const acc = accumulator.get(bodyId) ?? [];
          acc.push(nestedResult);
          accumulator.set(bodyId, acc);

          const nestedBody = this.graphTraverser.getLoopBody(graph, bodyId);
          for (const id of nestedBody) localCompleted.add(id);
          localCompleted.add(bodyId);
          continue;
        }

        const bodyInputs = this.gatherInputs(
          bodyGraphNode,
          state,
          bodyNodeData
        );
        const iterStart = Date.now();

        let bodyResult: NodeResult;
        try {
          const execResult = await this.nodeExecutor.execute({
            node: {
              type: bodyNodeData.type,
              nodeId: bodyNodeData.nodeId,
              label: bodyNodeData.label,
              config: bodyNodeData.config as Record<string, unknown>,
              inputPorts: bodyNodeData.inputPorts as any,
              outputPorts: bodyNodeData.outputPorts as any,
              providerId: bodyNodeData.providerId ?? undefined,
            },
            inputs: bodyInputs,
            variables: Object.fromEntries(state.variables),
            context: {
              executionId,
              workflowId: state.workflowId,
              userId: workflow.userId,
            },
          });
          execResult.duration = Date.now() - iterStart;
          bodyResult = execResult;
        } catch (error) {
          bodyResult = {
            nodeId: bodyId,
            status: 'failed',
            outputs: {},
            assets: [],
            duration: Date.now() - iterStart,
            error: {
              message: (error as Error).message,
              code: 'EXECUTION_ERROR',
            },
          };
        }

        // Make this iteration's output visible to subsequent body nodes
        state.nodeResults.set(bodyId, bodyResult);
        if (bodyResult.outputs) {
          for (const [k, v] of Object.entries(bodyResult.outputs)) {
            state.variables.set(`${bodyId}.${k}`, v);
          }
        }

        // Collect assets per iteration
        if (bodyResult.assets?.length) {
          state.assets.push(...bodyResult.assets);
          for (const asset of bodyResult.assets) {
            await this.saveAssetToLibrary(
              asset,
              workflow.userId,
              state.workflowId,
              executionId,
              bodyId
            );
          }
        }

        if (bodyResult.usage) {
          state.totalTokens += bodyResult.usage.totalTokens ?? 0;
          state.totalCost += bodyResult.usage.estimatedCost;
        }

        const acc = accumulator.get(bodyId) ?? [];
        acc.push(bodyResult);
        accumulator.set(bodyId, acc);
      }

      // Persist incremental progress so polling clients can see iterations
      // advancing. Loop node stays RUNNING until the very last iteration.
      const isLastIteration = i === N - 1;
      if (loopNodeData) {
        await this.store.updateNodeProgress(executionId, loopGraphNode.id, {
          status: isLastIteration ? 'completed' : 'running',
          outputData: {
            item: items[i],
            index: i,
            items,
            iterationCount: N,
            currentIteration: i + 1,
          },
        });
      }
      for (const bodyId of body) {
        const iters = accumulator.get(bodyId);
        if (!iters || iters.length === 0) continue;
        const partial = this.aggregateIterationResults(bodyId, iters);
        await this.store.updateNodeProgress(executionId, bodyId, {
          status: isLastIteration
            ? partial.status === 'failed'
              ? 'failed'
              : 'completed'
            : 'running',
          outputData: partial.outputs,
          assets: partial.assets,
          duration: partial.duration,
          errorMessage: partial.error?.message,
        });
      }

      this.emit('node:progress', {
        executionId,
        nodeId: loopGraphNode.id,
        percent: N > 0 ? Math.round(((i + 1) / N) * 100) : 100,
        message: `Iteration ${i + 1}/${N}`,
      });

      if (i < N - 1) {
        await new Promise(r => setTimeout(r, LOOP_ITERATION_MIN_DELAY_MS));
      }
    }

    return {
      nodeId: loopGraphNode.id,
      status: 'completed',
      outputs: {
        item: N > 0 ? items[N - 1] : null,
        index: N > 0 ? N - 1 : null,
        items,
        iterationCount: N,
        done: true,
      },
      assets: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Walk forward from `nodeId` looking for a UTIL_TRY_CATCH node. Returns
   * true if one exists anywhere downstream — that's the signal to convert
   * the upstream failure into a routable error envelope instead of killing
   * the workflow.
   */
  private hasDownstreamTryCatch(nodeId: string, graph: WorkflowGraph): boolean {
    const visited = new Set<string>();
    const stack = [nodeId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = graph.nodes.get(cur);
      if (!node) continue;
      for (const [, outs] of node.outputs) {
        for (const out of outs) {
          const next = graph.nodes.get(out.nodeId);
          if (!next) continue;
          if (next.type === 'UTIL_TRY_CATCH') return true;
          if (!visited.has(out.nodeId)) stack.push(out.nodeId);
        }
      }
    }
    return false;
  }

  /**
   * Execute a UTIL_SUB_WORKFLOW node by invoking another workflow as a
   * subroutine. Enforces:
   *  - **Recursion / cycle guard**: the parent workflow's call stack
   *    (carried as `trigger.data.__subWorkflowStack`) must not contain
   *    the target workflowId.
   *  - **Depth cap**: hard ceiling of 5 nested calls so a misbehaving
   *    workflow can't grind through quotas indefinitely.
   *
   * `wait: true` (default) blocks until the sub-execution finalizes, then
   * exposes its assets via `outputs.output`. `wait: false` fires-and-
   * forgets, returning the `executionId` only.
   */
  private async executeSubWorkflow(
    graphNode: GraphNode,
    parentWorkflow: NonNullable<Awaited<ReturnType<typeof this.loadWorkflow>>>,
    state: ExecutionState,
    parentOptions: ExecutionOptions
  ): Promise<NodeResult> {
    const startTime = Date.now();
    const config = graphNode.config ?? {};
    const settings = (config.settings ?? {}) as Record<string, unknown>;

    const targetWorkflowId =
      ((settings.workflowId ?? config.workflowId) as string | undefined) ?? '';
    const wait = (settings.wait ?? config.wait) === false ? false : true;

    // Pull the caller's sub-workflow stack from trigger.data. New top-level
    // executions start with an empty stack — anything beyond depth 5 or
    // visiting an already-on-stack workflowId is refused.
    const parentTrigger = (parentOptions.trigger?.data ?? {}) as Record<
      string,
      unknown
    >;
    const stack = Array.isArray(parentTrigger.__subWorkflowStack)
      ? [...(parentTrigger.__subWorkflowStack as string[])]
      : [];

    const MAX_SUB_DEPTH = 5;
    if (!targetWorkflowId) {
      return {
        nodeId: graphNode.id,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: 'UTIL_SUB_WORKFLOW: workflowId is required',
          code: 'INVALID_CONFIG',
        },
      };
    }
    if (stack.includes(targetWorkflowId)) {
      return {
        nodeId: graphNode.id,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: `UTIL_SUB_WORKFLOW: recursion detected — ${targetWorkflowId} is already on the call stack [${stack.join(' → ')}]`,
          code: 'RECURSION_DETECTED',
        },
      };
    }
    if (stack.length >= MAX_SUB_DEPTH) {
      return {
        nodeId: graphNode.id,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: `UTIL_SUB_WORKFLOW: max nesting depth ${MAX_SUB_DEPTH} exceeded`,
          code: 'MAX_DEPTH_EXCEEDED',
        },
      };
    }

    // Resolve inputMapping JSON. Empty = pass `inputs.input` straight through
    // under the conventional `prompt`/`text` keys.
    const inputMappingRaw = (settings.inputMapping ?? config.inputMapping) as
      | string
      | object
      | undefined;
    let inputMapping: Record<string, unknown> = {};
    if (typeof inputMappingRaw === 'string' && inputMappingRaw.trim()) {
      try {
        inputMapping = JSON.parse(inputMappingRaw);
      } catch {
        // Bad JSON — surface the error rather than silently passing through.
        return {
          nodeId: graphNode.id,
          status: 'failed',
          outputs: {},
          assets: [],
          duration: Date.now() - startTime,
          error: {
            message: 'UTIL_SUB_WORKFLOW: inputMapping is not valid JSON',
            code: 'INVALID_INPUT_MAPPING',
          },
        };
      }
    } else if (inputMappingRaw && typeof inputMappingRaw === 'object') {
      inputMapping = inputMappingRaw as Record<string, unknown>;
    }

    // Gather the input value for this node (the workflow engine has already
    // gathered them into state via gatherInputs in executeNode, but for
    // SUB_WORKFLOW we're intercepting before executeNode — re-fetch).
    const inputs = this.gatherInputs(
      graphNode,
      state,
      parentWorkflow.nodes.find(n => n.nodeId === graphNode.id)
    );
    const passThroughInput = inputs.input;
    const subInputs =
      Object.keys(inputMapping).length > 0
        ? inputMapping
        : { input: passThroughInput };

    try {
      const subExecution = await this.execute(
        targetWorkflowId,
        parentWorkflow.userId,
        {
          inputs: subInputs,
          trigger: {
            type: 'manual',
            data: {
              ...parentTrigger,
              __subWorkflowStack: [...stack, parentWorkflow.id],
              __invokedFromNode: graphNode.id,
            },
          },
        }
      );

      if (!wait) {
        return {
          nodeId: graphNode.id,
          status: 'completed',
          outputs: {
            output: null,
            executionId: subExecution.id,
          },
          assets: [],
          duration: Date.now() - startTime,
        };
      }

      // wait=true: poll until terminal status (the sub-execution runs in the
      // background per execute()'s contract). Cap at 30 minutes so a
      // sub-workflow we lose visibility into doesn't pin the parent.
      const SUB_POLL_INTERVAL_MS = 500;
      const SUB_POLL_MAX_MS = 30 * 60 * 1000;
      const deadline = Date.now() + SUB_POLL_MAX_MS;
      let finalResult: EngineExecutionResult = {
        status: subExecution.status,
        outputAssets: null,
        errorMessage: null,
      };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() > deadline) {
          return {
            nodeId: graphNode.id,
            status: 'failed',
            outputs: { executionId: subExecution.id },
            assets: [],
            duration: Date.now() - startTime,
            error: {
              message: `UTIL_SUB_WORKFLOW: sub-workflow ${targetWorkflowId} did not complete within ${SUB_POLL_MAX_MS}ms`,
              code: 'SUB_WORKFLOW_TIMEOUT',
            },
          };
        }
        const refreshed = await this.store.getExecutionResult(subExecution.id);
        if (!refreshed) break;
        finalResult = refreshed;
        if (
          ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(
            refreshed.status
          )
        ) {
          break;
        }
        await new Promise(r => setTimeout(r, SUB_POLL_INTERVAL_MS));
      }

      const succeeded = finalResult.status === 'COMPLETED';
      return {
        nodeId: graphNode.id,
        status: succeeded ? 'completed' : 'failed',
        outputs: {
          output: succeeded ? finalResult.outputAssets : null,
          executionId: subExecution.id,
        },
        assets: [],
        duration: Date.now() - startTime,
        error: succeeded
          ? undefined
          : {
              message:
                finalResult.errorMessage ??
                `Sub-workflow ${targetWorkflowId} ended with status ${finalResult.status}`,
              code: 'SUB_WORKFLOW_FAILED',
            },
      };
    } catch (err) {
      return {
        nodeId: graphNode.id,
        status: 'failed',
        outputs: {},
        assets: [],
        duration: Date.now() - startTime,
        error: {
          message: (err as Error).message,
          code: 'SUB_WORKFLOW_INVOKE_ERROR',
        },
      };
    }
  }

  /**
   * Build a per-node aggregated NodeResult wrapping per-iteration outputs.
   *
   * Special-cases `UTIL_AGGREGATE`: it accumulates internally across
   * iterations (see node-executor), and downstream consumers expect a
   * single `collected` value (not a per-iteration array). The LAST
   * iteration's `collected` IS the final aggregation.
   */
  private aggregateIterationResults(
    nodeId: string,
    iterations: NodeResult[],
    nodeType?: string
  ): NodeResult {
    const iterationOutputs = iterations.map(it => it.outputs ?? {});
    const anyFailed = iterations.some(it => it.status === 'failed');
    const totalDuration = iterations.reduce(
      (sum, it) => sum + (it.duration ?? 0),
      0
    );
    const firstError = iterations.find(it => it.error)?.error;

    if (nodeType === 'UTIL_AGGREGATE') {
      const last = iterations[iterations.length - 1];
      return {
        nodeId,
        status: anyFailed ? 'failed' : 'completed',
        outputs: {
          collected: last?.outputs?.collected ?? null,
          iterationCount: iterationOutputs.length,
          __iterations: iterationOutputs,
        },
        assets: iterations.flatMap(it => it.assets ?? []),
        duration: totalDuration,
        error: firstError,
      };
    }

    return {
      nodeId,
      status: anyFailed ? 'failed' : 'completed',
      outputs: {
        __iterations: iterationOutputs,
        iterationCount: iterationOutputs.length,
      },
      assets: iterations.flatMap(it => it.assets ?? []),
      duration: totalDuration,
      error: firstError,
    };
  }

  /**
   * Ensure a node-result row exists and persist the aggregated result.
   */
  private async persistAggregatedResult(
    executionId: string,
    workflow: NonNullable<Awaited<ReturnType<typeof this.loadWorkflow>>>,
    nodeId: string,
    result: NodeResult
  ): Promise<void> {
    const node = workflow.nodes.find(n => n.nodeId === nodeId);
    if (!node) return;
    await this.store.ensureNodeResult(executionId, nodeId);
    await this.saveNodeResult(executionId, nodeId, result);
  }

  private async finalizeExecution(
    executionId: string,
    state: ExecutionState
  ): Promise<void> {
    const status: IrisExecutionStatus =
      state.status === 'completed'
        ? 'COMPLETED'
        : state.status === 'failed'
          ? 'FAILED'
          : state.status === 'cancelled'
            ? 'CANCELLED'
            : 'FAILED';
    await this.store.finalizeExecution(executionId, {
      status,
      outputAssets: state.assets,
      totalTokensUsed: state.totalTokens,
      estimatedCost: state.totalCost,
      errorMessage: state.error?.message,
      errorNodeId: state.error?.nodeId,
    });

    // Update workflow stats
    const outcome: WorkflowRunOutcome =
      state.status === 'completed'
        ? 'completed'
        : state.status === 'failed'
          ? 'failed'
          : 'other';
    await this.store.incrementWorkflowStats(state.workflowId, outcome);
  }

  private async saveOutputAssets(
    executionId: string,
    _state: ExecutionState,
    workflow: NonNullable<Awaited<ReturnType<typeof this.loadWorkflow>>>
  ): Promise<void> {
    if (!workflow.outputBucket) return;

    // TODO: Copy assets to resolved output path
    // Will use: this.pathResolver.resolvePath(workflow.outputPath, { date, workflowName, workflowId, executionId, userId })
    // This depends on your storage implementation
    void workflow.outputPath;
    void executionId;
  }

  /**
   * Save generated assets to the host's asset library so workflow-generated
   * images/videos/audio appear under the user's assets. Routed through the
   * host `media.storeOutput` seam (which persists + records the asset); a host
   * without storage returns `success:false` and we log + continue. Best-effort:
   * never throws — library save is non-critical to the run.
   */
  private async saveAssetToLibrary(
    asset: AssetReference,
    userId: string,
    workflowId: string,
    executionId: string,
    nodeId?: string
  ): Promise<void> {
    try {
      // Only save IMAGE, VIDEO, and AUDIO types
      if (
        asset.type !== 'IMAGE' &&
        asset.type !== 'VIDEO' &&
        asset.type !== 'AUDIO'
      ) {
        return;
      }

      // Need either URL or base64 data
      if (!asset.url && !asset.base64) {
        return;
      }

      const storagePath = asset.storagePath ?? asset.path ?? '/iris/workflow';
      const metadata = asset.metadata;
      const mimeType = metadata?.mimeType as string | undefined;
      const defaultMimeType =
        asset.type === 'VIDEO'
          ? 'video/mp4'
          : asset.type === 'AUDIO'
            ? 'audio/mpeg'
            : 'image/png';

      const result = await this.nodeHost.media.storeOutput({
        output: {
          type: asset.type.toLowerCase() as 'image' | 'video' | 'audio',
          url: asset.url,
          base64: asset.base64,
          metadata: { ...(metadata ?? {}), mimeType: mimeType || defaultMimeType },
        },
        userId,
        storagePath,
        workflowId,
        executionId,
        nodeId,
        baseName: `Workflow ${asset.type.toLowerCase()}`,
      });

      if (!result.success) {
        console.error(
          `[WorkflowEngine] Failed to save asset to library: ${result.error}`
        );
        // Don't use a legacy fallback — it creates broken assets with truncated
        // base64. Just log the error and continue.
      }
    } catch (error) {
      console.error(`[WorkflowEngine] Failed to save asset to library:`, error);
      // Don't throw - asset library save is non-critical
    }
  }

  /**
   * Pause workflow due to insufficient tokens during automated execution
   */
  private async pauseWorkflowDueToInsufficientTokens(
    workflowId: string,
    _requiredTokens?: number,
    _remainingTokens?: number
  ): Promise<void> {
    try {
      await this.store.setWorkflowStatus(workflowId, 'PAUSED');
    } catch (error) {
      console.error(
        `[WorkflowEngine] Failed to pause workflow ${workflowId}:`,
        error
      );
    }
  }

  private handleExecutionError(executionId: string, error: Error): void {
    console.error(`Execution ${executionId} failed:`, error);

    const state = this.activeExecutions.get(executionId);
    if (state) {
      state.status = 'failed';
      state.error = {
        nodeId: state.currentNodeId ?? 'unknown',
        message: error.message,
        code: 'EXECUTION_ERROR',
      };
      state.endTime = Date.now();
    }

    this.updateExecutionStatus(executionId, 'FAILED').catch(console.error);
    this.activeExecutions.delete(executionId);

    this.emit('execution:error', { executionId, error: error.message });

    // Log the error
    this.createLog(executionId, {
      level: 'ERROR',
      eventType: 'EXECUTION_ERROR',
      message: `Execution failed: ${error.message}`,
      data: { stack: error.stack },
    }).catch(console.error);
  }

  /**
   * Create an execution log entry
   */
  private async createLog(
    executionId: string,
    logData: {
      nodeId?: string;
      level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
      eventType: string;
      message: string;
      data?: Record<string, unknown>;
      duration?: number;
    }
  ) {
    // The store swallows persistence errors (execution logging is best-effort).
    await this.store.appendLog(executionId, logData);
  }
}
