import { memo, useCallback, useEffect, useState } from 'react';
import { IrisEditorProvider, IrisWorkflowEditor } from 'iris-editor';
import { useUIStore } from '@/shared/stores/ui.store';
import { TitleBar } from '@/app/layout/TitleBar';
import { useDesktopEditorSeams } from '@/features/workflows/lib/desktop-seams';
import { getIrisApiBaseUrl } from '@/features/workflows/lib/local-engine';

/**
 * Desktop workflow editor — hosts the shared `iris-editor` against the embedded
 * local engine (BYOK, fully local). The editor is a complete shell (header /
 * canvas / panels / status bar / execution), so the page only adds the window
 * TitleBar above it.
 */
export const WorkflowEditorPage = memo(function WorkflowEditorPage() {
  const editingWorkflowId = useUIStore((s) => s.editingWorkflowId);
  const setEditingWorkflowId = useUIStore((s) => s.setEditingWorkflowId);

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getIrisApiBaseUrl().then((url) => {
      if (alive) setBaseUrl(url);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onClose = useCallback(
    () => setEditingWorkflowId(null),
    [setEditingWorkflowId],
  );
  const seams = useDesktopEditorSeams(baseUrl ?? '', onClose);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-0)', color: 'var(--text-1)' }}
    >
      <TitleBar />
      {editingWorkflowId && baseUrl ? (
        <div className="iris-editor-host">
          <IrisEditorProvider value={seams}>
            <IrisWorkflowEditor workflowId={editingWorkflowId} />
          </IrisEditorProvider>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: 'var(--text-3)' }}>
            {baseUrl === '' ? 'Local engine unavailable' : 'Loading editor…'}
          </p>
        </div>
      )}
    </div>
  );
});

export default WorkflowEditorPage;
