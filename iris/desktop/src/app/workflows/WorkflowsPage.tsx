import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Workflow as WorkflowIcon, KeyRound } from 'lucide-react';
import { useUIStore } from '@/shared/stores/ui.store';
import {
  listLocalWorkflows,
  createLocalWorkflow,
  deleteLocalWorkflow,
  type LocalWorkflowSummary,
} from '@/features/workflows/lib/local-engine';

/**
 * Local workflows list — backed by the embedded local engine (BYOK). Creating
 * or opening a workflow mounts the shared iris-editor (see WorkflowEditorPage).
 */
export function WorkflowsPage() {
  const setEditingWorkflowId = useUIStore((s) => s.setEditingWorkflowId);
  const setCurrentPage = useUIStore((s) => s.setCurrentPage);
  const [workflows, setWorkflows] = useState<LocalWorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setWorkflows(await listLocalWorkflows());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const wf = await createLocalWorkflow('New Workflow');
    if (wf) setEditingWorkflowId(wf.id);
  }, [setEditingWorkflowId]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('Delete this workflow?')) return;
      await deleteLocalWorkflow(id);
      void refresh();
    },
    [refresh],
  );

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <WorkflowIcon size={26} style={{ color: 'var(--iris-violet)' }} />
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-1)' }}>
              Workflows
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage('settings')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surf-2)', color: 'var(--text-2)' }}
              title="Manage BYOK API keys"
            >
              <KeyRound size={15} /> API keys
            </button>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90"
            >
              <Plus size={15} /> New workflow
            </button>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>
          Local workflows run on your machine with your own API keys (BYOK).
        </p>

        {error && (
          <div
            className="text-sm py-3 px-4 rounded-lg mb-4"
            style={{ background: 'var(--err-bg)', color: 'var(--err)' }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm py-10 text-center" style={{ color: 'var(--text-4)' }}>
            Loading…
          </div>
        ) : workflows.length === 0 ? (
          <div
            className="text-sm py-12 text-center rounded-xl"
            style={{ color: 'var(--text-4)', border: '1px solid var(--line-1)' }}
          >
            No workflows yet — create one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => setEditingWorkflowId(wf.id)}
                className="group text-left p-4 rounded-xl transition-colors"
                style={{ background: 'var(--surf-1)', border: '1px solid var(--line-2)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-medium text-sm truncate"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {wf.name}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>
                      {wf.nodes?.length ?? 0} nodes · {wf.totalExecutions ?? 0} runs
                    </div>
                  </div>
                  <span
                    onClick={(e) => handleDelete(wf.id, e)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 shrink-0"
                    style={{ color: 'var(--text-3)' }}
                  >
                    <Trash2 size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkflowsPage;
