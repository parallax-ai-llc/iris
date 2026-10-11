'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';
import {
  irisApiClient,
  Workflow as WorkflowType,
  TokenCostsResponse,
  type WorkflowLoadErrorKind,
} from '@editor/lib/apis/iris-api-client';
import { useI18n } from '@editor/hooks/usei18n';
import { useSeams } from '@editor/seams';
import { usePlanAccessStore } from '@editor/store/planAccess';
import { useIrisEditorStore, IrisNodeData } from '@editor/store/iris-editor';
import { 
  ValidationResult, 
  ConfirmDialogState, 
  ManualTriggerConfig, 
  UserInput,
  getCategoryFromType,
} from '../types';
import {
  estimateWorkflowRunCost,
  EMPTY_RUN_COST_ESTIMATE,
  type RunCostEstimate,
} from '@editor/lib/run-cost-estimate';

/** Partial-run options sent with an execute request (node result cache spec 4.4). */
export interface PartialRunOptions {
  /** "Re-run from here": these nodes skip the cache read and always run. */
  forceNodeIds?: string[];
  /** "Run to here": only this node's ancestors (and the node) run. */
  endNodeId?: string;
}

/** Window event a node menu fires to ask the editor for a partial run. */
export const NODE_RUN_REQUEST_EVENT = 'iris-node-run-request';

export interface NodeRunRequestDetail {
  nodeId: string;
  mode: 'from' | 'to';
}

/**
 * Keep only well-formed partial-run fields. Header buttons pass their click
 * event straight into `handleExecute`, so the argument is not trusted.
 */
function normalizePartial(partial: unknown): PartialRunOptions | undefined {
  if (!partial || typeof partial !== 'object') return undefined;
  const { forceNodeIds, endNodeId } = partial as Record<string, unknown>;
  const result: PartialRunOptions = {};
  if (Array.isArray(forceNodeIds)) {
    const ids = forceNodeIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) result.forceNodeIds = ids;
  }
  if (typeof endNodeId === 'string' && endNodeId.length > 0) result.endNodeId = endNodeId;
  return result.forceNodeIds || result.endNodeId ? result : undefined;
}

export function useWorkflowEditor(workflowId: string) {
  const { navigate, onUnauthorized } = useSeams();
  // Read through a ref so a host that rebuilds its seams does not refetch.
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  // Verbatim call sites below use `router.push(path)`; back it with the seam.
  // Memoized: this is in effect deps, so a fresh object each render would loop.
  const router = useMemo(
    () => ({ push: (path: string) => navigate?.(path) }),
    [navigate],
  );
  const { t } = useI18n();
  
  // Local state
  const [workflow, setWorkflow] = useState<WorkflowType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Why the last load failed (null while loading or after success).
  const [loadError, setLoadError] = useState<WorkflowLoadErrorKind | null>(null);
  // Bumped by `retryLoad` to re-run the fetch effect.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, type: 'save' });
  const [showInputModal, setShowInputModal] = useState(false);
  // "Ignore cache (run all)": session-only, not persisted (spec 4.6).
  const [ignoreCache, setIgnoreCache] = useState(false);
  // Partial-run options of the run waiting on the input modal / confirm dialog.
  const pendingPartialRef = useRef<PartialRunOptions | undefined>(undefined);

  // Store state
  const { 
    initWorkflow, 
    nodes, 
    edges, 
    nodeConfigs, 
    isDirty, 
    setDirty, 
    isExecuting, 
    setExecuting,
    setNodeValidationError, 
    clearValidationErrors,
  } = useIrisEditorStore();
  
  const { fetchPlanAccess } = usePlanAccessStore();

  // Reset validation when workflow changes
  useEffect(() => {
    setIsValidated(false);
    setValidationResult(null);
  }, [nodes.length, edges.length]);

  // Run-cost estimate: same billing plan + price function the engine uses
  // for its balance check and charge (iris-nodes billing).
  const costEstimate = useMemo<RunCostEstimate>(() => {
    if (!tokenCosts?.costs || nodes.length === 0) return EMPTY_RUN_COST_ESTIMATE;
    return estimateWorkflowRunCost(
      nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        // The store's config is what gets saved and run.
        config: (nodeConfigs[node.id] ?? node.data.config) as unknown as
          | Record<string, unknown>
          | null,
      })),
      edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      { modelPricing: tokenCosts.modelPricing ?? {}, flatCosts: tokenCosts.costs },
    );
  }, [nodes, edges, tokenCosts, nodeConfigs]);

  // Find Manual Trigger node for input modal
  const manualTriggerNode = useMemo((): ManualTriggerConfig | null => {
    const triggerNode = nodes.find(n => n.data.type === 'TRIGGER_MANUAL');
    if (!triggerNode) return null;

    const storeConfig = nodeConfigs[triggerNode.id];
    const config = triggerNode.data.config as unknown as Record<string, unknown> | null;
    const configSettings = config?.settings as Record<string, unknown> | undefined;
    const configInputs = config?.inputs as Record<string, unknown> | undefined;

    const inputType = (
      storeConfig?.settings?.inputType ??
      configSettings?.inputType ??
      configInputs?.inputType ??
      config?.inputType ??
      'text'
    ) as 'none' | 'text' | 'image' | 'file';

    const inputLabel = (
      storeConfig?.settings?.inputLabel ??
      configSettings?.inputLabel ??
      configInputs?.inputLabel ??
      config?.inputLabel ??
      'Enter your input...'
    ) as string;

    return { inputType, inputLabel };
  }, [nodes, nodeConfigs]);

  // Fetch workflow data
  useEffect(() => {
    let cancelled = false;
    const fetchWorkflow = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await irisApiClient.loadWorkflow(workflowId);
        if (cancelled) return;
        if (result.ok) {
          const data = result.workflow;
          setWorkflow(data);
          
          const dbIdToNodeId = new Map<string, string>();
          (data.nodes || []).forEach((node: any) => {
            dbIdToNodeId.set(node.id, node.nodeId);
          });

          const rfNodes: Node<IrisNodeData>[] = (data.nodes || []).map((node: any) => ({
            id: node.nodeId,
            type: 'irisNode',
            position: { x: node.positionX || 0, y: node.positionY || 0 },
            data: {
              nodeId: node.nodeId,
              dbId: node.id,
              type: node.type,
              label: node.label || node.type,
              category: getCategoryFromType(node.type),
              config: node.config || { inputs: {}, outputs: {}, settings: {} },
              status: 'idle',
            },
          }));

          const rfEdges: Edge[] = (data.edges || []).map((edge: any) => ({
            id: edge.edgeId,
            source: dbIdToNodeId.get(edge.sourceNodeId) || edge.sourceNodeId,
            target: dbIdToNodeId.get(edge.targetNodeId) || edge.targetNodeId,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          }));
          
          initWorkflow(data.id, data.name, rfNodes, rfEdges);
          return;
        }

        setWorkflow(null);
        setLoadError(result.error);
        switch (result.error) {
          case 'not_found':
            // Unchanged behavior: tell the user and leave the editor.
            toast.error(t('iris.editor.notFound'));
            router.push('/');
            break;
          case 'unauthorized':
            // The host decides where sign-in lives; without one the editor
            // shows its "sign in required" screen.
            onUnauthorizedRef.current?.({ workflowId });
            break;
          case 'forbidden':
            // The "no access" screen says it; no toast on top.
            break;
          default:
            toast.error(t('iris.editor.loadFailed'));
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch workflow:', error);
        setWorkflow(null);
        setLoadError('error');
        toast.error(t('iris.editor.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchWorkflow();
    return () => {
      cancelled = true;
    };
  }, [workflowId, router, initWorkflow, t, loadAttempt]);

  const retryLoad = useCallback(() => setLoadAttempt((n) => n + 1), []);

  // Fetch token costs and plan access on mount
  useEffect(() => {
    fetchPlanAccess();
    const fetchTokenCosts = async () => {
      const costs = await irisApiClient.getTokenCosts();
      if (costs) {
        setTokenCosts(costs);
      }
    };
    fetchTokenCosts();
  }, [fetchPlanAccess]);

  // Validate workflow
  // Resolves true only when the server reports the workflow valid.
  const handleValidate = useCallback(async (): Promise<boolean> => {
    if (!workflow) return false;

    clearValidationErrors();
    setIsValidating(true);
    
    try {
      const apiNodes = nodes.map((node) => {
        const storeConfig = nodeConfigs[node.id];
        const mergedConfig = {
          ...(node.data.config as unknown as Record<string, unknown>),
          model: storeConfig?.model,
          provider: storeConfig?.provider,
          settings: storeConfig?.settings || {},
          inputs: storeConfig?.inputs || {},
          outputs: storeConfig?.outputs || {},
        };
        return {
          nodeId: node.id,
          type: node.data.type,
          label: node.data.label,
          config: mergedConfig,
        };
      });

      const apiEdges = edges.map((edge) => ({
        edgeId: edge.id,
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle || 'output',
        targetNodeId: edge.target,
        targetHandle: edge.targetHandle || 'input',
      }));

      const result = await irisApiClient.validateWorkflow(workflow.id, apiNodes, apiEdges);
      if (result) {
        setValidationResult(result);
        if (result.valid) {
          setIsValidated(true);
          toast.success(t('iris.editor.validationSuccess'));
          return true;
        } else {
          setIsValidated(false);
          
          result.errors.forEach((error: string) => {
            const nodeMatch = error.match(/Node "([^"]+)"/);
            if (nodeMatch) {
              const nodeLabel = nodeMatch[1];
              const node = nodes.find(n =>
                n.data.label.trim().toLowerCase() === nodeLabel.trim().toLowerCase()
              );
              if (node) {
                let suggestion = error;
                if (error.includes('requires a model')) {
                  suggestion = t('iris.editor.validation.selectModel');
                } else if (error.includes('requires a provider')) {
                  suggestion = t('iris.editor.validation.selectProvider');
                }
                setNodeValidationError(node.id, suggestion);
              }
            }
          });

          result.warnings?.forEach((warning: string) => {
            const nodeMatch = warning.match(/Node "([^"]+)"/);
            if (nodeMatch) {
              const nodeLabel = nodeMatch[1];
              const node = nodes.find(n =>
                n.data.label.trim().toLowerCase() === nodeLabel.trim().toLowerCase()
              );
              if (node) {
                let suggestion = warning;
                if (warning.includes('requires a provider')) {
                  suggestion = t('iris.editor.validation.selectProvider');
                }
                setNodeValidationError(node.id, suggestion);
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to validate workflow:', error);
      setIsValidated(false);
      toast.error(t('iris.editor.validationFailed'));
    } finally {
      setIsValidating(false);
    }
    return false;
  }, [workflow, nodes, edges, nodeConfigs, clearValidationErrors, setNodeValidationError, t]);

  // Save workflow
  const performSave = useCallback(async () => {
    if (!workflow) return;

    setIsSaving(true);
    try {
      const hasTrigger = nodes.some((node) => node.data.type.startsWith('TRIGGER_'));
      const newStatus = hasTrigger ? 'ACTIVE' : 'DRAFT';

      await irisApiClient.updateWorkflow(workflow.id, {
        name: workflow.name,
        description: workflow.description,
        status: newStatus,
      });

      const apiNodes = nodes.map((node) => {
        const storeConfig = nodeConfigs[node.id];
        const mergedConfig = {
          ...(node.data.config as unknown as Record<string, unknown>),
          model: storeConfig?.model,
          provider: storeConfig?.provider,
          settings: storeConfig?.settings || {},
          inputs: storeConfig?.inputs || {},
          outputs: storeConfig?.outputs || {},
        };
        return {
          nodeId: node.id,
          type: node.data.type,
          label: node.data.label,
          positionX: node.position.x,
          positionY: node.position.y,
          config: mergedConfig,
        };
      });
      await irisApiClient.updateNodes(workflow.id, apiNodes);

      const apiEdges = edges.map((edge) => ({
        edgeId: edge.id,
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle || 'output',
        targetNodeId: edge.target,
        targetHandle: edge.targetHandle || 'input',
      }));
      await irisApiClient.updateEdges(workflow.id, apiEdges);

      setWorkflow((prev) => prev ? { ...prev, status: newStatus } : prev);
      setDirty(false);
      toast.success(t('iris.editor.saveSuccess'));
    } catch (error) {
      console.error('Failed to save workflow:', error);
      toast.error(t('iris.editor.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [workflow, nodes, edges, nodeConfigs, setDirty, t]);

  // Execute workflow
  const performExecute = useCallback(async (userInput?: UserInput, partial?: PartialRunOptions) => {
    if (!workflow) return;

    if (isDirty) {
      await performSave();
    }

    try {
      setExecuting(true);
      setShowInputModal(false);

      let executeData: Parameters<typeof irisApiClient.executeWorkflow>[1] | undefined;

      if (userInput) {
        const triggerData: Record<string, unknown> = {
          inputType: userInput.type,
          inputValue: userInput.value,
        };

        if (userInput.file && (userInput.type === 'image' || userInput.type === 'file')) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(userInput.file!);
          });

          if (userInput.type === 'image') {
            triggerData.image = `data:${userInput.file.type};base64,${base64}`;
          } else {
            triggerData.file = `data:${userInput.file.type};base64,${base64}`;
          }
        }

        executeData = {
          trigger: {
            type: 'manual' as const,
            data: triggerData,
          },
        };
      } else if (manualTriggerNode && manualTriggerNode.inputType === 'none') {
        // Manual trigger with 'none' input type - send trigger signal without data
        executeData = {
          trigger: {
            type: 'manual' as const,
            data: { inputType: 'none', inputValue: '' },
          },
        };
      }

      const runOptions: Partial<NonNullable<typeof executeData>> = {
        ...(ignoreCache ? { useCache: false } : {}),
        ...normalizePartial(partial),
      };
      if (Object.keys(runOptions).length > 0) {
        executeData = { ...(executeData ?? {}), ...runOptions };
      }

      const result = await irisApiClient.executeWorkflow(workflow.id, executeData);
      if (result) {
        setExecuting(true, result.executionId);
      } else {
        setExecuting(false);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      setExecuting(false);
    }
  }, [workflow, isDirty, performSave, setExecuting, manualTriggerNode, ignoreCache]);

  // Handle save button click
  const handleSave = useCallback(() => {
    if (!workflow) return;

    if (isExecuting) {
      setConfirmDialog({ isOpen: true, type: 'save' });
      return;
    }

    performSave();
  }, [workflow, isExecuting, performSave]);

  // Handle execute button click (and node-menu partial runs)
  const handleExecute = useCallback((partialArg?: PartialRunOptions) => {
    if (!workflow) return;

    const partial = normalizePartial(partialArg);
    pendingPartialRef.current = partial;

    if (isExecuting) {
      setConfirmDialog({ isOpen: true, type: 'execute' });
      return;
    }

    // For manual trigger with 'none' input type, execute immediately without showing modal
    if (manualTriggerNode && manualTriggerNode.inputType === 'none') {
      performExecute(undefined, partial);
      return;
    }

    if (manualTriggerNode) {
      setShowInputModal(true);
      return;
    }

    performExecute(undefined, partial);
  }, [workflow, isExecuting, manualTriggerNode, performExecute]);

  // Input modal submit: carries the partial-run options of the pending run.
  const executeWithInput = useCallback(
    (userInput: UserInput) => performExecute(userInput, pendingPartialRef.current),
    [performExecute],
  );

  // Node menu "Run to here" / "Re-run from here". Same gate as the header Run
  // button (enabled only once validated): when not validated yet, validate
  // first and run only if it passes. Unsaved changes are saved by
  // performExecute, exactly like the header Run path.
  useEffect(() => {
    const onRunRequest = (event: Event) => {
      const detail = (event as CustomEvent<NodeRunRequestDetail>).detail;
      if (!detail || typeof detail.nodeId !== 'string' || !detail.nodeId) return;
      let partial: PartialRunOptions;
      if (detail.mode === 'from') {
        partial = { forceNodeIds: [detail.nodeId] };
      } else if (detail.mode === 'to') {
        partial = { endNodeId: detail.nodeId };
      } else {
        return;
      }
      if (isValidated) {
        handleExecute(partial);
        return;
      }
      if (isValidating) return;
      void handleValidate().then((valid) => {
        if (valid) handleExecute(partial);
      });
    };
    window.addEventListener(NODE_RUN_REQUEST_EVENT, onRunRequest);
    return () => window.removeEventListener(NODE_RUN_REQUEST_EVENT, onRunRequest);
  }, [handleExecute, handleValidate, isValidated, isValidating]);

  const toggleIgnoreCache = useCallback(() => {
    setIgnoreCache((prev) => !prev);
  }, []);

  // Handle confirm dialog action
  const handleConfirmAction = useCallback(async () => {
    const dialogType = confirmDialog.type;
    setConfirmDialog({ isOpen: false, type: 'save' });

    if (dialogType === 'save') {
      await performSave();
    } else {
      await performExecute(undefined, pendingPartialRef.current);
    }
  }, [confirmDialog.type, performSave, performExecute]);

  // Close confirm dialog
  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog({ isOpen: false, type: 'save' });
  }, []);

  // Close input modal
  const closeInputModal = useCallback(() => {
    setShowInputModal(false);
  }, []);

  return {
    // State
    workflow,
    isLoading,
    loadError,
    isSaving,
    isValidating,
    validationResult,
    isValidated,
    tokenCosts,
    confirmDialog,
    showInputModal,
    costEstimate,
    manualTriggerNode,
    isDirty,
    isExecuting,
    ignoreCache,
    
    // Actions
    retryLoad,
    handleValidate,
    handleSave,
    handleExecute,
    handleConfirmAction,
    closeConfirmDialog,
    closeInputModal,
    performExecute,
    executeWithInput,
    setIgnoreCache,
    toggleIgnoreCache,
    
    // Navigation
    router,
    t,
  };
}
