'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';
import { irisApiClient, Workflow as WorkflowType, TokenCostsResponse } from '@editor/lib/apis/iris-api-client';
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
  VIDEO_NODE_TYPES,
} from '../types';

export function useWorkflowEditor(workflowId: string) {
  const { navigate } = useSeams();
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
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [tokenCosts, setTokenCosts] = useState<TokenCostsResponse | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, type: 'save' });
  const [showInputModal, setShowInputModal] = useState(false);

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

  // Calculate estimated tokens
  const estimatedTokens = useMemo(() => {
    if (!tokenCosts?.costs || nodes.length === 0) return 0;

    return nodes.reduce((sum, node) => {
      const nodeType = node.data.type;
      const baseCost = tokenCosts.costs[nodeType] ?? 0;

      if (VIDEO_NODE_TYPES.includes(nodeType)) {
        const nodeConfig = nodeConfigs[node.id];
        const duration = (nodeConfig?.settings?.duration as number) ?? 5;
        return sum + (baseCost * Number(duration));
      }

      return sum + baseCost;
    }, 0);
  }, [nodes, tokenCosts, nodeConfigs]);

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
    const fetchWorkflow = async () => {
      setIsLoading(true);
      try {
        const data = await irisApiClient.getWorkflow(workflowId);
        if (data) {
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
        } else {
          toast.error(t('iris.editor.notFound'));
          router.push('/');
        }
      } catch (error) {
        console.error('Failed to fetch workflow:', error);
        toast.error(t('iris.editor.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkflow();
  }, [workflowId, router, initWorkflow, t]);

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
  const handleValidate = useCallback(async () => {
    if (!workflow) return;

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
  const performExecute = useCallback(async (userInput?: UserInput) => {
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
  }, [workflow, isDirty, performSave, setExecuting, manualTriggerNode]);

  // Handle save button click
  const handleSave = useCallback(() => {
    if (!workflow) return;

    if (isExecuting) {
      setConfirmDialog({ isOpen: true, type: 'save' });
      return;
    }

    performSave();
  }, [workflow, isExecuting, performSave]);

  // Handle execute button click
  const handleExecute = useCallback(() => {
    if (!workflow) return;

    if (isExecuting) {
      setConfirmDialog({ isOpen: true, type: 'execute' });
      return;
    }

    // For manual trigger with 'none' input type, execute immediately without showing modal
    if (manualTriggerNode && manualTriggerNode.inputType === 'none') {
      performExecute();
      return;
    }

    if (manualTriggerNode) {
      setShowInputModal(true);
      return;
    }

    performExecute();
  }, [workflow, isExecuting, manualTriggerNode, performExecute]);

  // Handle confirm dialog action
  const handleConfirmAction = useCallback(async () => {
    const dialogType = confirmDialog.type;
    setConfirmDialog({ isOpen: false, type: 'save' });

    if (dialogType === 'save') {
      await performSave();
    } else {
      await performExecute();
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
    isSaving,
    isValidating,
    validationResult,
    isValidated,
    tokenCosts,
    confirmDialog,
    showInputModal,
    estimatedTokens,
    manualTriggerNode,
    isDirty,
    isExecuting,
    
    // Actions
    handleValidate,
    handleSave,
    handleExecute,
    handleConfirmAction,
    closeConfirmDialog,
    closeInputModal,
    performExecute,
    
    // Navigation
    router,
    t,
  };
}
