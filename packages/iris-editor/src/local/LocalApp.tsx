/**
 * LocalApp — the iris-host-local SPA shell.
 *
 * The local host has no workflow-list page (unlike iris/web), so this provides a
 * minimal list/sidebar and mounts the shared <IrisWorkflowEditor> for the
 * selected workflow, wired to the local seams (local API client, English
 * dictionary, static model fallback, no cloud media components).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Workflow as WorkflowIcon, Plus, Trash2 } from 'lucide-react';
import { IrisEditorProvider, type IrisEditorSeams } from '@editor/seams';
import { IrisWorkflowEditor } from '@editor/IrisWorkflowEditor';
import type { ModelsSeam } from '@editor/seams';
import { createLocalApiClient } from './local-api-client';
import { createLocalT } from './local-i18n';

// Stable references — config-component effects depend on [agents]/[fetchAgents];
// these must NOT be recreated per render (would cause a render loop). The model
// list itself comes from the static node-definitions fallback in ModelSelector,
// so an empty agents array is fine; `availableProviders` is layered on top to
// gate models by which BYOK keys are configured (see WorkflowList /api/health).
const STABLE_AGENTS: ModelsSeam['agents'] = [];
const NOOP_FETCH = () => {};

// Local i18n: resolve `iris.*` keys against the vendored English dictionary.
const localT = createLocalT();

interface ListWorkflow {
  id: string;
  name: string;
  nodes: unknown[];
  totalExecutions: number;
  updatedAt: string;
}

function WorkflowList({
  onOpen,
  providers,
}: {
  onOpen: (id: string) => void;
  providers: string[];
}) {
  const [workflows, setWorkflows] = useState<ListWorkflow[]>([]);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/iris/workflows').then(res => res.json());
    setWorkflows(r.workflows ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    const r = await fetch('/api/iris/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled workflow' }),
    }).then(res => res.json());
    if (r.workflow?.id) onOpen(r.workflow.id);
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/iris/workflows/${id}`, { method: 'DELETE' });
    void refresh();
  };

  return (
    <div
      className="min-h-screen text-iris-text-1"
      style={{
        background:
          'radial-gradient(50% 40% at 50% 20%, rgba(167,139,250,0.10), transparent 70%), var(--color-iris-canvas)',
      }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-1">
          <WorkflowIcon size={26} className="text-iris-violet" />
          <h1 className="text-2xl font-semibold">iris-flow</h1>
        </div>
        <p className="text-iris-text-3 text-sm mb-8">
          Local workflow editor ·{' '}
          {providers.length ? `BYOK: ${providers.join(', ')}` : 'no API keys configured'}
        </p>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-iris-text-2">Workflows</h2>
          <button
            onClick={create}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90"
          >
            <Plus size={15} /> New workflow
          </button>
        </div>

        <div className="space-y-2">
          {workflows.length === 0 && (
            <div className="text-iris-text-4 text-sm py-10 text-center border border-iris-line-1 rounded-xl">
              No workflows yet — create one to get started.
            </div>
          )}
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => onOpen(wf.id)}
              className="w-full text-left px-4 py-3 rounded-xl border border-iris-line-2 bg-iris-surf-1 hover:bg-iris-surf-3 transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="font-medium text-sm">{wf.name}</div>
                <div className="text-iris-text-4 text-xs mt-0.5">
                  {wf.nodes?.length ?? 0} nodes · {wf.totalExecutions ?? 0} runs
                </div>
              </div>
              <span
                onClick={e => remove(wf.id, e)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-iris-text-3 p-1"
              >
                <Trash2 size={15} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LocalApp() {
  const [openId, setOpenId] = useState<string | null>(null);
  // BYOK providers with a configured key (from /api/health). `undefined` until
  // loaded → ModelSelector gates nothing; `[]` means no keys → everything gated.
  const [providers, setProviders] = useState<string[] | undefined>(undefined);
  const apiClient = useMemo(() => createLocalApiClient(), []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(h => setProviders(h.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  // Models seam — stable agents/fetchAgents refs (avoid render loop); only
  // `availableProviders` changes, once, when /api/health resolves.
  const modelsSeam = useMemo<ModelsSeam>(
    () => ({
      agents: STABLE_AGENTS,
      fetchAgents: NOOP_FETCH,
      isLoading: false,
      availableProviders: providers,
    }),
    [providers],
  );

  const seams: IrisEditorSeams = useMemo(
    () => ({
      apiClient,
      t: localT,
      useModels: () => modelsSeam,
      navigate: () => setOpenId(null), // back / not-found → return to the list
    }),
    [apiClient, modelsSeam],
  );

  if (openId) {
    return (
      <IrisEditorProvider value={seams}>
        <IrisWorkflowEditor workflowId={openId} />
      </IrisEditorProvider>
    );
  }
  return <WorkflowList onOpen={setOpenId} providers={providers ?? []} />;
}
