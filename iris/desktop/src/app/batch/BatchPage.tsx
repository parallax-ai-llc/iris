import { BatchJobList } from '@/features/batch/components';
import { useUIStore } from '@/shared/stores/ui.store';

/**
 * Batch jobs run on the embedded local engine / detached daemon (BYOK), so this
 * page no longer requires a cloud server connection — same as the local
 * Workflows page.
 */
export function BatchPage() {
  const { setSelectedBatchId, setIsCreatingBatch } = useUIStore();

  return (
    <div className="min-h-screen p-6">
      <BatchJobList
        onCreateNew={() => setIsCreatingBatch(true)}
        onViewJob={(id) => setSelectedBatchId(id)}
      />
    </div>
  );
}
