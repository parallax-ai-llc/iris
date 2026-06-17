import { BatchJobDetail } from '@/features/batch/components';

interface BatchDetailPageProps {
  jobId: string;
  onBack: () => void;
}

export function BatchDetailPage({ jobId, onBack }: BatchDetailPageProps) {
  return (
    <div className="min-h-screen p-6">
      <BatchJobDetail jobId={jobId} onBack={onBack} />
    </div>
  );
}
