'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import { useAgentStore } from '@editor/store/agent';
import {
  getNodeDefinition,
  NodeCategory,
  CATEGORY_ICONS,
} from '../../../constants/node-definitions';
import { categoryPalette } from '../nodes/nodeColors';
import { ModelSelector } from './ModelSelector';
import { InputSourceSelector } from './InputSourceSelector';
import { DurationSelector } from './DurationSelector';
import { VoiceSelector } from './VoiceSelector';
import {
  Settings,
  LogIn,
  LogOut,
  X,
  Pencil,
  Check,
  Folder,
} from 'lucide-react';
import { StorageLocationPicker } from '../../media/StorageLocationPicker';
import { useI18n } from '@editor/hooks/usei18n';
import { END_FRAME_SUPPORTED_MODELS } from '../../media/media.constants';
import { ConfigField } from './NodeConfigPanel/ConfigField';
import { WebhookUrlSettings } from './NodeConfigPanel/WebhookUrlSettings';
import { ScheduleNodeSettings } from './NodeConfigPanel/ScheduleNodeSettings';

// Category color classes (text-only variant used in this panel's header)
const categoryColorClasses: Record<NodeCategory, { text: string }> = {
  TRIGGER: { text: 'text-green-400' },
  GENERATOR: { text: 'text-slate-300' },
  ANALYZER: { text: 'text-blue-400' },
  EDITOR: { text: 'text-orange-400' },
  UTILITY: { text: 'text-gray-400' },
  WEB: { text: 'text-indigo-400' },
  OUTPUT: { text: 'text-teal-400' },
};

// Tab types
type ConfigTab = 'settings' | 'inputs' | 'outputs';

export function NodeConfigPanel() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ConfigTab>('settings');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const [storagePickerOutputName, setStoragePickerOutputName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { selectedNodeId, nodes, nodeConfigs, updateNodeConfig, updateNodeSettings, updateNodeOutput, selectNode, updateNode, workflowId } =
    useIrisEditorStore();

  // Get selected node and its definition
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  const nodeDef = useMemo(() => {
    if (!selectedNode) return null;
    return getNodeDefinition(selectedNode.data.type);
  }, [selectedNode]);

  const nodeConfig = selectedNodeId ? nodeConfigs[selectedNodeId] : null;

  // Get agents store for web search capability check
  const { agents } = useAgentStore();

  // Check if selected model supports web search
  const modelSupportsWebSearch = useMemo(() => {
    if (!nodeConfig?.model) return false;
    const selectedAgent = agents.find(a => a.model === nodeConfig.model);
    return selectedAgent?.webSearch === true;
  }, [nodeConfig?.model, agents]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Reset editing state when node changes
  useEffect(() => {
    setIsEditingName(false);
    setEditingName('');
  }, [selectedNodeId]);

  // Start editing name
  const handleStartEditName = () => {
    if (selectedNode) {
      setEditingName(selectedNode.data.label);
      setIsEditingName(true);
    }
  };

  // Save name
  const handleSaveName = () => {
    if (selectedNodeId && editingName.trim()) {
      updateNode(selectedNodeId, { label: editingName.trim() });
    }
    setIsEditingName(false);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditingName('');
  };

  // Handle key down in name input
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Handle model selection
  const handleProviderChange = (provider: string) => {
    if (!selectedNodeId) return;
    updateNodeConfig(selectedNodeId, { provider });
  };

  const handleModelChange = (model: string) => {
    if (!selectedNodeId) return;
    updateNodeConfig(selectedNodeId, { model });
  };

  // Handle settings change
  const handleSettingChange = (fieldName: string, value: unknown) => {
    if (!selectedNodeId) return;
    updateNodeSettings(selectedNodeId, { [fieldName]: value });
  };

  // Handle output config change
  const handleOutputChange = (outputName: string, field: string, value: unknown) => {
    if (!selectedNodeId) return;
    updateNodeOutput(selectedNodeId, outputName, { [field]: value });
  };

  // Get output config for a specific output
  const getOutputConfig = (outputName: string) => {
    const config = nodeConfigs[selectedNodeId || ''];
    return config?.outputs?.[outputName] || { variableName: outputName, saveToStorage: false };
  };

  // If no node selected, show placeholder
  if (!selectedNode || !nodeDef) {
    return (
      <aside
        className="h-full flex flex-col items-center justify-center"
        style={{
          borderLeft: '1px solid var(--color-iris-line-2)',
          background: 'linear-gradient(180deg, #0d0e15, #0a0b11)',
          padding: '0 24px',
          color: 'var(--color-iris-text-4)',
          textAlign: 'center',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'var(--color-iris-surf-1)',
            border: '1px solid var(--color-iris-line-2)',
            marginBottom: 14,
          }}
        >
          <Settings size={20} />
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-iris-text-3)',
            marginBottom: 4,
          }}
        >
          {t('iris.nodeConfig.properties') || 'No node selected'}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--color-iris-text-4)',
            maxWidth: 220,
          }}
        >
          {t('iris.nodeConfig.selectNode')}
        </div>
      </aside>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[nodeDef.category];
  const colors = categoryColorClasses[nodeDef.category];
  const palette = categoryPalette[nodeDef.category];

  // Separate config fields by type
  const modelFields = nodeDef.configFields.filter(
    (f) => f.type === 'provider' || f.type === 'model'
  );
  const otherFields = nodeDef.configFields.filter(
    (f) => f.type !== 'provider' && f.type !== 'model'
  );

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        borderLeft: '1px solid var(--color-iris-line-2)',
        background: 'linear-gradient(180deg, #0d0e15, #0a0b11)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 18px 0' }}>
        <div className="flex items-start" style={{ gap: 10 }}>
          <span
            className="inline-flex items-center justify-center flex-shrink-0"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: palette.soft,
              color: palette.text,
              border: `1px solid ${palette.stroke}33`,
            }}
          >
            {CategoryIcon && <CategoryIcon size={14} />}
          </span>
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center" style={{ gap: 4 }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleSaveName}
                  className="flex-1 min-w-0"
                  style={{
                    padding: '4px 8px',
                    fontSize: 13.5,
                    fontWeight: 500,
                    borderRadius: 6,
                    background: 'var(--color-iris-surf-2)',
                    border: '1px solid var(--color-iris-line-3)',
                    color: 'var(--color-iris-text-1)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSaveName}
                  className="we-iconbtn"
                  style={{ width: 26, height: 26, color: 'var(--color-iris-ok)' }}
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center group" style={{ gap: 4 }}>
                <span
                  className="truncate"
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    letterSpacing: '-0.005em',
                    color: 'var(--color-iris-text-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedNode.data.label}
                </span>
                <button
                  onClick={handleStartEditName}
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  style={{
                    padding: 4,
                    color: 'var(--color-iris-text-4)',
                  }}
                  title={t('iris.nodeConfig.renameNode')}
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--color-iris-text-3)',
                marginTop: 2,
              }}
            >
              {nodeDef.description}
            </div>
          </div>
          <button
            onClick={() => selectNode(null)}
            className="we-iconbtn"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex" style={{ gap: 6, marginTop: 12 }}>
          <span className="we-meta-pill">
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: palette.stroke,
              }}
            />
            {nodeDef.category}
          </span>
          <span
            className="we-meta-pill"
            style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
          >
            {selectedNode.id}
          </span>
        </div>

        {/* Tabs */}
        <ConfigTabs
          activeTab={activeTab}
          onSelect={setActiveTab}
          inputsCount={nodeDef.inputs.length}
          outputsCount={nodeDef.outputs.length}
          labels={{
            settings: t('iris.nodeConfig.settings') || 'Settings',
            inputs: t('iris.nodeConfig.inputs') || 'Inputs',
            outputs: t('iris.nodeConfig.outputs') || 'Outputs',
          }}
        />
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '16px 18px 24px' }}
      >
        {activeTab === 'settings' && (
          <>
            {/* Webhook URL settings for TRIGGER_WEBHOOK */}
            {selectedNode.data.type === 'TRIGGER_WEBHOOK' && workflowId && (
              <WebhookUrlSettings workflowId={workflowId} />
            )}

            {/* Schedule settings for TRIGGER_SCHEDULE */}
            {selectedNode.data.type === 'TRIGGER_SCHEDULE' && workflowId && (
              <ScheduleNodeSettings workflowId={workflowId} />
            )}

            {/* Model selector for AI nodes */}
            {modelFields.length > 0 && (
              <ModelSelector
                provider={nodeConfig?.provider}
                model={nodeConfig?.model}
                capability={nodeDef.aiCapability}
                onProviderChange={handleProviderChange}
                onModelChange={handleModelChange}
              />
            )}

            {/* Other config fields */}
            {otherFields.map((field) => {
              // Special handling for duration field type
              if (field.type === 'duration') {
                return (
                  <DurationSelector
                    key={field.name}
                    nodeId={selectedNodeId!}
                    value={nodeConfig?.settings?.[field.name] as string | undefined}
                    onChange={(value) => handleSettingChange(field.name, value)}
                    isImageToVideo={selectedNode.data.type === 'GEN_IMAGE_TO_VIDEO'}
                  />
                );
              }
              // Special handling for voice field in TTS nodes
              if (field.name === 'voice' && selectedNode.data.type === 'GEN_TEXT_TO_SPEECH') {
                return (
                  <VoiceSelector
                    key={field.name}
                    provider={nodeConfig?.provider}
                    value={nodeConfig?.settings?.[field.name] as string | undefined}
                    onChange={(value) => handleSettingChange(field.name, value)}
                  />
                );
              }
              // Hide enableWebSearch toggle if model doesn't support it
              if (field.name === 'enableWebSearch' && !modelSupportsWebSearch) {
                return null;
              }
              return (
                <ConfigField
                  key={field.name}
                  field={field}
                  value={nodeConfig?.settings?.[field.name]}
                  onChange={(value) => handleSettingChange(field.name, value)}
                />
              );
            })}

            {modelFields.length === 0 && otherFields.length === 0 && selectedNode.data.type !== 'TRIGGER_WEBHOOK' && selectedNode.data.type !== 'TRIGGER_SCHEDULE' && (
              <p className="text-xs text-white/40 text-center py-4">
                {t('iris.nodeConfig.noSettings')}
              </p>
            )}
          </>
        )}

        {activeTab === 'inputs' && (
          <>
            {nodeDef.inputs.length > 0 ? (
              nodeDef.inputs.map((input) => {
                // Check if end frame should be disabled for GEN_IMAGE_TO_VIDEO
                let isEndFrameDisabled = false;
                let endFrameDisabledReason = '';

                if (selectedNode.data.type === 'GEN_IMAGE_TO_VIDEO' && input.name === 'endFrame') {
                  const selectedModel = nodeConfig?.model?.toLowerCase() || '';
                  const supportsEndFrame = END_FRAME_SUPPORTED_MODELS.some(m =>
                    selectedModel.includes(m.replace('kling-', ''))
                  );

                  if (!supportsEndFrame && selectedModel) {
                    isEndFrameDisabled = true;
                    endFrameDisabledReason = t('iris.nodeConfig.endFrameNotSupported') || 'End frame is not supported by the selected model. Use Kling 2.1, 1.6 Pro, or 1.6 Standard.';
                  }
                }

                return (
                  <InputSourceSelector
                    key={input.name}
                    nodeId={selectedNodeId!}
                    inputName={input.name}
                    inputLabel={input.label}
                    inputType={input.type}
                    inputConfig={nodeConfig?.inputs?.[input.name]}
                    required={input.required}
                    disabled={isEndFrameDisabled}
                    disabledReason={endFrameDisabledReason}
                  />
                );
              })
            ) : (
              <p className="text-xs text-white/40 text-center py-4">
                {t('iris.nodeConfig.noInputs')}
              </p>
            )}
          </>
        )}

        {activeTab === 'outputs' && (
          <>
            {(() => {
              // For TRIGGER_MANUAL, show simplified output info
              if (selectedNode.data.type === 'TRIGGER_MANUAL') {
                const inputType = (nodeConfig?.settings?.inputType as string) || 'text';
                const isSignalOnly = inputType === 'none';
                const inputTypeLabel = isSignalOnly ? 'Signal Only' : inputType === 'text' ? 'Text' : inputType === 'image' ? 'Image' : 'File';
                const outputPort = isSignalOnly ? 'text (signal)' : inputType;
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      {t('iris.nodeConfig.userInputHint')} <span className="text-slate-300">{inputTypeLabel}</span> {t('iris.nodeConfig.data')}.
                    </p>
                    <div className="p-2 rounded-md bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">{t('iris.nodeConfig.outputPort')}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-400/20 text-slate-200">
                          {outputPort}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // For TRIGGER_SCHEDULE, show simplified output info
              if (selectedNode.data.type === 'TRIGGER_SCHEDULE') {
                const inputType = (nodeConfig?.settings?.inputType as string) || 'text';
                const inputTypeLabel = inputType === 'none' ? 'None' : inputType === 'text' ? 'Text' : 'Image';
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      {t('iris.nodeConfig.staticInputHint')} <span className="text-slate-300">{inputTypeLabel}</span> {t('iris.nodeConfig.data')}.
                    </p>
                    {inputType !== 'none' && (
                      <div className="p-2 rounded-md bg-white/5 border border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/70">{t('iris.nodeConfig.outputPort')}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-400/20 text-slate-200">
                            {inputType}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // For OUTPUT_STORAGE, show simple info (no save toggle needed)
              if (selectedNode.data.type === 'OUTPUT_STORAGE') {
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      {t('iris.nodeConfig.storageOutput')}
                    </p>
                    <div className="p-2 rounded-md bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">{t('iris.nodeConfig.outputs')}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                          {t('iris.nodeConfig.storageUrl')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // For other OUTPUT nodes, show simple info (terminal nodes)
              if (selectedNode.data.type.startsWith('OUTPUT_')) {
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      {t('iris.nodeConfig.terminalNode')}
                    </p>
                  </div>
                );
              }

              // For GENERATOR nodes, show storage location picker
              if (nodeDef.category === 'GENERATOR') {
                const mediaOutputs = nodeDef.outputs.filter(
                  (o) => o.type === 'image' || o.type === 'video' || o.type === 'audio'
                );

                return (
                  <div className="space-y-3">
                    <p className="text-xs text-white/60">
                      {t('iris.nodeConfig.autoSaveHint')}
                    </p>
                    {mediaOutputs.length > 0 && (
                      <div className="space-y-2">
                        {mediaOutputs.map((output) => {
                          const outputConfig = getOutputConfig(output.name);
                          const storagePath = outputConfig.storagePath || '/';
                          return (
                            <div key={output.name} className="p-2 rounded-md bg-white/5 border border-white/10">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-white/70">{output.label}</span>
                                <span className="text-xs text-white/40">({output.type})</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <label className="text-xs text-white/50">{t('iris.nodeConfig.storageLocation')}</label>
                              </div>
                              <button
                                onClick={() => {
                                  setStoragePickerOutputName(output.name);
                                  setStoragePickerOpen(true);
                                }}
                                className="w-full mt-1 flex items-center gap-2 px-2 py-1.5 text-xs rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left"
                              >
                                <Folder size={12} className="text-amber-400 flex-shrink-0" />
                                <span className="text-white/70 truncate flex-1">
                                  {storagePath === '/' ? t('iris.nodeConfig.rootFolder') : storagePath}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Storage Location Picker Modal */}
                    <StorageLocationPicker
                      isOpen={storagePickerOpen}
                      onClose={() => {
                        setStoragePickerOpen(false);
                        setStoragePickerOutputName(null);
                      }}
                      onSelect={(path: string) => {
                        if (storagePickerOutputName) {
                          handleOutputChange(storagePickerOutputName, 'storagePath', path);
                        }
                      }}
                      currentPath={storagePickerOutputName ? getOutputConfig(storagePickerOutputName).storagePath : '/'}
                    />
                  </div>
                );
              }

              // For other nodes, show normal output configuration (variable name only)
              return nodeDef.outputs.length > 0 ? (
                nodeDef.outputs.map((output) => {
                  const outputConfig = getOutputConfig(output.name);
                  return (
                    <div key={output.name} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">{output.label}</span>
                        <span className="text-xs text-white/40">({output.type})</span>
                      </div>
                      <div className="p-2 rounded-md bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-white/50">{t('iris.nodeConfig.variableName')}</label>
                        </div>
                        <input
                          type="text"
                          value={outputConfig.variableName || output.name}
                          onChange={(e) => handleOutputChange(output.name, 'variableName', e.target.value)}
                          placeholder="output_name"
                          className={cn(
                            'w-full px-2 py-1 text-xs rounded',
                            'bg-white/5 border border-white/10',
                            'text-white placeholder-white/40',
                            'focus:outline-none focus:border-slate-400/50'
                          )}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-white/40 text-center py-4">
                  {t('iris.nodeConfig.noOutputs')}
                </p>
              );
            })()}
          </>
        )}
      </div>
    </aside>
  );
}

interface ConfigTabsProps {
  activeTab: ConfigTab;
  onSelect: (tab: ConfigTab) => void;
  inputsCount: number;
  outputsCount: number;
  labels: { settings: string; inputs: string; outputs: string };
}

function ConfigTabs({
  activeTab,
  onSelect,
  inputsCount,
  outputsCount,
  labels,
}: ConfigTabsProps) {
  const tabs: Array<{ id: ConfigTab; label: string; count?: number }> = [
    { id: 'settings', label: labels.settings },
    { id: 'inputs', label: labels.inputs, count: inputsCount },
    { id: 'outputs', label: labels.outputs, count: outputsCount },
  ];

  return (
    <div
      className="flex"
      style={{
        gap: 4,
        marginTop: 14,
        borderBottom: '1px solid var(--color-iris-line-1)',
        marginLeft: -18,
        marginRight: -18,
        paddingLeft: 14,
        paddingRight: 14,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className="inline-flex items-center"
            style={{
              padding: '10px 14px',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              color: isActive
                ? 'var(--color-iris-text-1)'
                : 'var(--color-iris-text-3)',
              borderBottom:
                '2px solid ' +
                (isActive ? 'var(--color-iris-violet)' : 'transparent'),
              marginBottom: -1,
              background: 'transparent',
              transition: 'color 0.15s, border-color 0.15s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-iris-text-1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--color-iris-text-3)';
              }
            }}
          >
            <span>{tab.label}</span>
            {tab.count != null && tab.count > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 10,
                  color: isActive
                    ? 'var(--color-iris-text-3)'
                    : 'var(--color-iris-text-4)',
                  padding: '0 4px',
                  background: isActive
                    ? 'var(--color-iris-surf-2)'
                    : 'var(--color-iris-surf-1)',
                  border: '1px solid var(--color-iris-line-2)',
                  borderRadius: 4,
                  minWidth: 16,
                  textAlign: 'center',
                  lineHeight: '14px',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
