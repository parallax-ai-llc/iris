'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@editor/lib/convert/string';
import { ChevronDown, Loader2, Search, X, Check, Zap, DollarSign, Lock } from 'lucide-react';
import { PROVIDER_OPTIONS, MODEL_OPTIONS } from '../../../constants/node-definitions';
import { useAgentStore, AgentModel } from '@editor/store/agent';
import { getProviderLogo, getProviderLogoStyle } from '../../../utils/provider-logos';
import { HIDDEN_IMAGE_GENERATION_PROVIDERS } from '../../media/media.constants';

// Map a model's provider to the provider key whose API key actually unlocks it.
// Most providers match 1:1; these are the exceptions — Kling has no direct API
// (it runs through Replicate), and grok/x are the xAI provider.
const PROVIDER_KEY_ALIASES: Record<string, string> = {
  x: 'xai',
  grok: 'xai',
  kling: 'replicate',
};

// Helper to get providers that support a capability from MODEL_OPTIONS
function getProvidersForCapability(capability: string): string[] {
  const capabilityModels = MODEL_OPTIONS[capability];
  if (!capabilityModels) return [];
  return Object.keys(capabilityModels);
}

// Helper to derive capabilities from AgentModel
function getCapabilitiesFromModel(model: AgentModel): string[] {
  const capabilities: string[] = [];

  if (model.chat) {
    capabilities.push('text-to-text');
    if (model.modalities?.image?.includes('input')) {
      capabilities.push('image-analysis');
    }
    if (model.modalities?.audio?.includes('input')) {
      capabilities.push('speech-to-text');
    }
    if (model.modalities?.audio?.includes('output')) {
      capabilities.push('text-to-speech');
    }
  }
  if (model.imageGeneration) {
    capabilities.push('text-to-image');
  }
  if (model.videoGeneration) {
    // Models with imageRequired: true only support image-to-video (e.g., Kling 1.x, Runway Gen-3 Alpha Turbo)
    // Models without imageRequired support text-to-video
    if (!model.imageRequired) {
      capabilities.push('text-to-video');
    }
    // Check if provider supports image-to-video based on MODEL_OPTIONS
    const providerLower = model.provider.toLowerCase();
    const imageToVideoProviders = getProvidersForCapability('image-to-video');
    if (imageToVideoProviders.includes(providerLower)) {
      capabilities.push('image-to-video');
    }
  }
  if (model.webSearch) {
    capabilities.push('web-search');
  }

  return capabilities;
}

// Helper to get cost per 1k tokens from pricing
function getCostPer1k(pricing?: AgentModel['pricing']): number | undefined {
  if (!pricing) return undefined;
  return pricing.input;
}

interface ModelSelectorProps {
  provider: string | undefined;
  model: string | undefined;
  capability?: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
}

interface TransformedModel {
  id: string;
  name: string;
  capabilities: string[];
  contextWindow?: number;
  costPer1k?: number;
  provider: string;
  isFast?: boolean;
  isExpert?: boolean;
}

// Provider Icon Component
function ProviderIcon({ provider, size = 16 }: { provider: string; size?: number }) {
  const logo = getProviderLogo(provider);

  if (!logo) {
    return (
      <div
        className="rounded-lg bg-white/10 flex items-center justify-center text-white/60 text-xs font-medium"
        style={{ width: size, height: size }}
      >
        {provider.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={logo.src}
      alt={provider}
      width={size}
      height={size}
      className="flex-shrink-0"
      style={getProviderLogoStyle(provider)}
    />
  );
}

export function ModelSelector({
  provider,
  model,
  capability,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // For portal rendering (SSR compatibility)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get agents from store
  const { agents, fetchAgents, isLoading: isLoadingModels, availableProviders } = useAgentStore();

  // In self-host (BYOK), the host passes the list of providers that have an API
  // key configured; models from any other provider are shown but disabled.
  // In cloud (availableProviders === undefined) nothing is gated — the server
  // holds the keys.
  const isProviderUnavailable = useCallback(
    (provider: string) => {
      if (!availableProviders) return false;
      const key = provider.toLowerCase();
      const resolved = PROVIDER_KEY_ALIASES[key] ?? key;
      return !availableProviders.includes(resolved) && !availableProviders.includes(key);
    },
    [availableProviders],
  );

  // Fetch agents on mount if not loaded
  useEffect(() => {
    if (agents.length === 0) {
      fetchAgents();
    }
  }, [agents.length, fetchAgents]);

  // Transform agents to the format expected by the selector
  const modelsByProvider = useMemo(() => {
    const result: Record<string, TransformedModel[]> = {};

    agents.forEach((agent) => {
      const providerKey = agent.provider.toLowerCase();
      if (!result[providerKey]) {
        result[providerKey] = [];
      }
      result[providerKey].push({
        id: agent.model, // Use agent.model (actual model name) instead of agent.id (DB ID)
        name: agent.name,
        capabilities: getCapabilitiesFromModel(agent),
        contextWindow: agent.contextWindow,
        costPer1k: getCostPer1k(agent.pricing),
        provider: agent.provider,
        isFast: agent.isFast,
        isExpert: agent.isExpert,
      });
    });

    return result;
  }, [agents]);

  // Get all models filtered by capability (across all providers), with deduplication
  const allAvailableModels = useMemo(() => {
    const allModels: TransformedModel[] = [];
    const seenIds = new Set<string>();

    // First, add models from agents store
    Object.values(modelsByProvider).forEach((models) => {
      models.forEach((m) => {
        // Deduplicate by model id (same model name from same provider)
        const uniqueKey = `${m.provider}-${m.id}`;
        if (seenIds.has(uniqueKey)) return;
        seenIds.add(uniqueKey);

        // Hide certain providers from image generation
        if (capability === 'text-to-image' && HIDDEN_IMAGE_GENERATION_PROVIDERS.includes(m.provider.toLowerCase() as typeof HIDDEN_IMAGE_GENERATION_PROVIDERS[number])) {
          return;
        }

        if (!capability || m.capabilities.includes(capability)) {
          allModels.push(m);
        }
      });
    });

    // Fallback: If no models found for this capability, use static MODEL_OPTIONS
    // This handles specialized models like TTS that aren't in the agents store
    if (allModels.length === 0 && capability && MODEL_OPTIONS[capability]) {
      const staticModels = MODEL_OPTIONS[capability];
      Object.entries(staticModels).forEach(([providerKey, models]) => {
        models.forEach((m: { value: string; label: string }) => {
          const uniqueKey = `${providerKey}-${m.value}`;
          if (seenIds.has(uniqueKey)) return;
          seenIds.add(uniqueKey);

          allModels.push({
            id: m.value,
            name: m.label,
            capabilities: [capability],
            provider: providerKey,
          });
        });
      });
    }

    return allModels;
  }, [capability, modelsByProvider]);

  // Filter models based on search
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = !query
      ? allAvailableModels
      : allAvailableModels.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.provider.toLowerCase().includes(query)
        );
    // Push models without a configured API key to the bottom (stable sort).
    return [...matched].sort(
      (a, b) =>
        (isProviderUnavailable(a.provider) ? 1 : 0) -
        (isProviderUnavailable(b.provider) ? 1 : 0)
    );
  }, [allAvailableModels, searchQuery, isProviderUnavailable]);

  // Get providers that have models for the required capability
  const availableProviders = useMemo(() => {
    if (!capability) return PROVIDER_OPTIONS;

    return PROVIDER_OPTIONS.filter((p) => {
      const models = modelsByProvider[p.value.toLowerCase()] || [];
      return models.some((m) => m.capabilities.includes(capability));
    });
  }, [capability, modelsByProvider]);

  // Selected model info (handles both new format: model name, and legacy format: DB ID)
  const selectedModel = useMemo(() => {
    if (!model) return null;

    // First try to find by actual model name (new format)
    const foundByModelName = allAvailableModels.find((m) => m.id === model);
    if (foundByModelName) return foundByModelName;

    // Fallback: try to find by DB ID (legacy format from old workflows)
    // The 'agents' array has both 'id' (DB ID) and 'model' (actual model name)
    const agentByDbId = agents.find((a) => a.id === model);
    if (agentByDbId) {
      // Find the transformed model using the actual model name
      return allAvailableModels.find((m) => m.id === agentByDbId.model);
    }

    return null;
  }, [model, allAvailableModels, agents]);

  // Auto-migrate legacy DB IDs to actual model names
  useEffect(() => {
    if (!model) return;

    // Check if model is a legacy DB ID (not found by model name, but found by DB ID)
    const foundByModelName = allAvailableModels.find((m) => m.id === model);
    if (foundByModelName) return; // Already using new format

    // Try to find agent by DB ID
    const agentByDbId = agents.find((a) => a.id === model);
    if (agentByDbId) {
      // Migrate to the correct model name
      onModelChange(agentByDbId.model);
      if (agentByDbId.provider) {
        onProviderChange(agentByDbId.provider.toLowerCase());
      }
    }
  }, [model, agents, allAvailableModels, onModelChange, onProviderChange]);

  const handleModelSelect = (selectedModel: TransformedModel) => {
    onProviderChange(selectedModel.provider.toLowerCase());
    onModelChange(selectedModel.id);
    setIsModalOpen(false);
    setSearchQuery('');
  };

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  return (
    <div className="space-y-3">
      {/* Model Selector Button */}
      <div>
        <label className="block text-xs text-white/50 mb-1">Model</label>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={isLoadingModels}
          className={cn(
            'w-full px-3 py-2.5 text-sm rounded-lg text-left',
            'bg-white/5 border border-white/10',
            'text-white',
            'hover:border-white/20 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center gap-2'
          )}
        >
          {selectedModel ? (
            <>
              <ProviderIcon provider={selectedModel.provider} size={18} />
              <span className="flex-1 truncate">{selectedModel.name}</span>
            </>
          ) : (
            <span className="text-white/50 flex-1">Select model...</span>
          )}
          {isLoadingModels ? (
            <Loader2 size={14} className="text-white/40 animate-spin" />
          ) : (
            <ChevronDown size={14} className="text-white/40" />
          )}
        </button>
      </div>

      {/* Modal - rendered via portal to escape container constraints */}
      {isModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-3xl max-h-[85vh] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: '#0f0f0f' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-semibold text-white">Select Model</h2>
                {capability && (
                  <p className="text-xs text-white/40 mt-0.5">
                    Showing models with <span className="text-slate-300">{capability}</span> capability
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-white/10">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                />
                <input
                  type="text"
                  placeholder="Search models or providers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-4 py-2.5 text-sm rounded-xl',
                    'bg-white/5 border border-white/10',
                    'text-white placeholder:text-white/40',
                    'focus:outline-none focus:border-slate-400/50 focus:ring-1 focus:ring-slate-400/25'
                  )}
                  autoFocus
                />
              </div>
            </div>

            {/* Model Grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-white/40">
                  <Search size={32} className="mb-3 opacity-50" />
                  <p className="text-sm">No models found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredModels.map((m) => (
                    <ModelCard
                      key={`${m.provider}-${m.id}`}
                      model={m}
                      isSelected={model === m.id}
                      disabled={isProviderUnavailable(m.provider)}
                      onSelect={() => handleModelSelect(m)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Model Card Component
function ModelCard({
  model,
  isSelected,
  disabled = false,
  onSelect,
}: {
  model: TransformedModel;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? 'API key required — add this provider’s key to enable' : undefined}
      className={cn(
        'relative p-4 rounded-xl text-left transition-all duration-200 border group',
        disabled
          ? 'cursor-not-allowed opacity-40 bg-white/[0.02] border-white/10'
          : isSelected
            ? 'bg-slate-400/10 border-slate-400/50 ring-1 ring-slate-400/25'
            : 'bg-white/[0.02] border-white/10 hover:border-slate-400/50 hover:bg-white/5'
      )}
    >
      {/* Selected Check / Locked (no API key) */}
      {disabled ? (
        <div className="absolute top-3 right-3 text-white/40">
          <Lock size={14} />
        </div>
      ) : isSelected ? (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-slate-400 flex items-center justify-center">
          <Check size={12} className="text-white" />
        </div>
      ) : null}

      {/* Provider Icon */}
      <div className="mb-3">
        <ProviderIcon provider={model.provider} size={28} />
      </div>

      {/* Model Name */}
      <div className="text-white font-medium text-sm mb-1 pr-6 truncate">{model.name}</div>

      {/* Provider */}
      <div className="text-white/40 text-xs capitalize mb-2">{model.provider}</div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {disabled && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/90 text-[10px]">
            <Lock size={9} />
            API key required
          </span>
        )}
        {model.isFast && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
            <Zap size={10} />
            Fast
          </span>
        )}
        {model.contextWindow && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px]">
            {(model.contextWindow / 1000).toFixed(0)}K
          </span>
        )}
        {model.costPer1k !== undefined && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px]">
            <DollarSign size={10} />
            {model.costPer1k.toFixed(3)}
          </span>
        )}
      </div>
    </button>
  );
}
