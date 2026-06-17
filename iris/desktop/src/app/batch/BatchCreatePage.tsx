import { BatchJobCreateForm } from '@/features/batch/components';
import { useUIStore } from '@/shared/stores/ui.store';
import { BatchJob } from '@/types/batch.types';

export function BatchCreatePage() {
  const { setIsCreatingBatch, setSelectedBatchId } = useUIStore();

  const handleCancel = () => {
    setIsCreatingBatch(false);
  };

  const handleCreated = (job: BatchJob) => {
    setIsCreatingBatch(false);
    setSelectedBatchId(job.id);
  };

  return (
    <div className="min-h-screen p-6">
      <BatchJobCreateForm
        onCancel={handleCancel}
        onCreated={handleCreated}
      />
    </div>
  );
}
