import { useEffect, useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { Search, Plus, RefreshCw, Layers } from 'lucide-react';
import { BatchJobCard, BatchJobCardSkeleton } from './BatchJobCard';
import {
  useBatchStore,
  BATCH_STATUS_OPTIONS,
  BatchStatusFilter,
} from '@/features/batch/stores/batch.store';
import { toast } from '@/shared/lib/toast';

interface BatchJobListProps {
  onCreateNew?: () => void;
  onViewJob?: (id: string) => void;
}

export function BatchJobList({ onCreateNew, onViewJob }: BatchJobListProps) {
  const {
    jobs,
    isLoading,
    error,
    searchQuery,
    statusFilter,
    page,
    totalPages,
    fetchJobs,
    deleteJob,
    retryJob,
    setSearchQuery,
    setStatusFilter,
    setPage,
    clearError,
  } = useBatchStore();

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, searchQuery, statusFilter, page]);

  useEffect(() => {
    const hasProcessingJobs = jobs.some((j) => j.status === 'PROCESSING');
    if (hasProcessingJobs && !pollingRef.current) {
      pollingRef.current = setInterval(() => fetchJobs(), 5000);
    } else if (!hasProcessingJobs && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobs, fetchJobs]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJobs();
  };

  const handleStatusFilterChange = (status: BatchStatusFilter) => setStatusFilter(status);

  const handleDelete = useCallback((id: string) => setPendingDeleteId(id), []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteJob(pendingDeleteId);
      toast.success('Batch job deleted successfully');
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteJob]);

  const handleRetry = useCallback(
    async (id: string) => {
      await retryJob(id);
      toast.success('Retrying failed rows…');
    },
    [retryJob]
  );

  return (
    <div className="dt-page-wide">
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Automation</div>
          <h1 className="dt-page-title">
            Batch <em>jobs</em>
          </h1>
          <p className="dt-page-sub">Process workflows in bulk with spreadsheet data.</p>
        </div>
        <button onClick={onCreateNew} className="btn-silver btn btn-lg">
          <Plus size={16} />
          New batch job
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="relative" style={{ width: 280 }}>
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-4)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batch jobs…"
            className="iris-input"
            style={{ paddingLeft: 32 }}
          />
        </form>

        <button
          onClick={() => fetchJobs()}
          disabled={isLoading}
          className="we-iconbtn"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>

        <div className="dt-seg" style={{ marginLeft: 'auto' }}>
          {BATCH_STATUS_OPTIONS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleStatusFilterChange(filter.value)}
              className="dt-seg-item"
              data-active={statusFilter === filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && jobs.length === 0 ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <BatchJobCardSkeleton key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 48 }}
        >
          <Layers size={48} className="mb-4" style={{ color: 'var(--text-4)' }} />
          <h2 className="t-display" style={{ fontSize: 24, marginBottom: 6 }}>
            No batch jobs yet
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 18 }}>
            Create your first batch job to process data in bulk.
          </p>
          <button onClick={onCreateNew} className="btn-silver btn btn-lg">
            <Plus size={16} />
            Create batch job
          </button>
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}
        >
          {jobs.map((job) => (
            <BatchJobCard
              key={job.id}
              job={job}
              onView={onViewJob}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum)}
              className="btn btn-sm"
              style={
                page === pageNum
                  ? { background: 'var(--iris-grad-soft)', borderColor: 'rgba(167,139,250,0.32)', color: '#c4b5fd' }
                  : undefined
              }
            >
              {pageNum}
            </button>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete batch job"
        message="Are you sure you want to delete this batch job? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
