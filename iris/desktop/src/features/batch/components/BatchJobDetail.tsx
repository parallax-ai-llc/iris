import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Ban,
  FileSpreadsheet,
  Settings,
  Calendar,
} from 'lucide-react';
import { useBatchStore } from '@/features/batch/stores/batch.store';
import { BatchJobStatus, BatchRowResult } from '@/types/batch.types';
import { toast } from '@/shared/lib/toast';
import { ConfirmDialog } from '@/shared/components/ui/Modal';

interface BatchJobDetailProps {
  jobId: string;
  onBack: () => void;
}

const statusConfig: Record<BatchJobStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  PENDING: {
    label: 'Pending',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20 border-gray-500/30',
    icon: <Clock size={16} />,
  },
  PROCESSING: {
    label: 'Processing',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20 border-blue-500/30',
    icon: <Loader2 size={16} className="animate-spin" />,
  },
  PAUSED: {
    label: 'Paused',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20 border-yellow-500/30',
    icon: <Pause size={16} />,
  },
  COMPLETED: {
    label: 'Completed',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20 border-green-500/30',
    icon: <CheckCircle size={16} />,
  },
  FAILED: {
    label: 'Failed',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20 border-red-500/30',
    icon: <XCircle size={16} />,
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20 border-gray-500/30',
    icon: <Ban size={16} />,
  },
};

export function BatchJobDetail({ jobId, onBack }: BatchJobDetailProps) {
  const {
    currentJob,
    currentJobStatus,
    currentJobRows,
    isLoading,
    isActionLoading,
    error,
    rowsPage,
    rowsTotalPages,
    fetchJob,
    fetchJobStatus,
    fetchJobRows,
    startJob,
    pauseJob,
    resumeJob,
    cancelJob,
    retryJob,
    downloadResults,
    startPolling,
    stopPolling,
    clearError,
  } = useBatchStore();

  const [showErrors, setShowErrors] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch job on mount
  useEffect(() => {
    fetchJob(jobId);
    fetchJobStatus(jobId);
    fetchJobRows(jobId);

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Start/stop polling based on job status changes
  useEffect(() => {
    if (currentJob?.status === 'PROCESSING') {
      startPolling(jobId);
    } else {
      stopPolling();
    }
    // Do NOT return stopPolling here — mount useEffect handles final cleanup
  }, [currentJob?.status, jobId, startPolling, stopPolling]);

  // Show error notification
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const toggleRowExpand = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleDownload = async (format: 'xlsx' | 'csv') => {
    setDownloadMenuOpen(false);

    if (!currentJob) return;

    try {
      const blob = await downloadResults(jobId, format);
      if (blob) {
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: `${currentJob.name}.${format}`,
          filters: [{ name: format.toUpperCase(), extensions: [format] }]
        });

        if (savePath) {
          const buffer = await blob.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, buffer);
          toast.success(`Results saved to ${savePath}`);
        }
      }
    } catch {
      toast.error('Failed to download results');
    }
  };

  const handleAction = async (action: 'start' | 'pause' | 'resume' | 'cancel' | 'retry') => {
    switch (action) {
      case 'start':
        await startJob(jobId);
        toast.success('Job started');
        break;
      case 'pause':
        await pauseJob(jobId);
        toast.success('Job paused');
        break;
      case 'resume':
        await resumeJob(jobId);
        toast.success('Job resumed');
        break;
      case 'cancel':
        setShowCancelConfirm(true);
        break;
      case 'retry':
        await retryJob(jobId);
        toast.success('Retrying failed rows...');
        break;
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchJobRows(jobId, newPage);
  };

  if (isLoading && !currentJob) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-white/40" />
      </div>
    );
  }

  if (!currentJob) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle size={48} className="text-white/20 mb-4" />
        <p className="text-white/60">Job not found</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const status = statusConfig[currentJob.status];
  const progress = currentJobStatus?.progress;
  const progressPercent = progress?.percent ?? 0;
  const errors = currentJobStatus?.errors ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-white/60" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{currentJob.name}</h1>
            {currentJob.description && (
              <p className="text-white/60 text-sm mt-1">{currentJob.description}</p>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full border', status.bgColor, status.color)}>
          {status.icon}
          <span className="text-sm font-medium">{status.label}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {currentJob.status === 'PENDING' && (
          <button
            onClick={() => handleAction('start')}
            disabled={!!isActionLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Play size={16} />
            Start
          </button>
        )}

        {currentJob.status === 'PROCESSING' && (
          <button
            onClick={() => handleAction('pause')}
            disabled={!!isActionLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Pause size={16} />
            Pause
          </button>
        )}

        {currentJob.status === 'PAUSED' && (
          <button
            onClick={() => handleAction('resume')}
            disabled={!!isActionLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Play size={16} />
            Resume
          </button>
        )}

        {['PROCESSING', 'PAUSED'].includes(currentJob.status) && (
          <button
            onClick={() => handleAction('cancel')}
            disabled={!!isActionLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <XCircle size={16} />
            Cancel
          </button>
        )}

        {(currentJob.status === 'FAILED' || (currentJob.status === 'COMPLETED' && currentJob.failedRows > 0)) && (
          <button
            onClick={() => handleAction('retry')}
            disabled={!!isActionLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RotateCcw size={16} />
            Retry Failed
          </button>
        )}

        {/* Download Dropdown */}
        {currentJob.processedRows > 0 && (
          <div className="relative">
            <button
              onClick={() => setDownloadMenuOpen(!downloadMenuOpen)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'bg-white/10 text-white border border-white/20 hover:bg-white/20'
              )}
            >
              <Download size={16} />
              Download
              <ChevronDown size={14} className={cn(downloadMenuOpen && 'rotate-180')} />
            </button>

            {downloadMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDownloadMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-800 border border-white/10 rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => handleDownload('xlsx')}
                    className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                  >
                    <FileSpreadsheet size={14} />
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => handleDownload('csv')}
                    className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                  >
                    <FileSpreadsheet size={14} />
                    CSV (.csv)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Progress Card */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Progress</h2>
          <span className="text-2xl font-bold text-white">{progressPercent}%</span>
        </div>

        <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
          <div
            className={cn(
              'h-full transition-all duration-300',
              currentJob.status === 'PROCESSING' ? 'bg-blue-500' :
              currentJob.status === 'COMPLETED' ? 'bg-green-500' :
              currentJob.status === 'FAILED' ? 'bg-red-500' : 'bg-gray-500'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xl font-bold text-white">{currentJob.totalRows}</div>
            <div className="text-xs text-white/50">Total</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xl font-bold text-white">{currentJob.processedRows}</div>
            <div className="text-xs text-white/50">Processed</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xl font-bold text-green-400">{currentJob.successfulRows}</div>
            <div className="text-xs text-white/50">Success</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="text-xl font-bold text-red-400">{currentJob.failedRows}</div>
            <div className="text-xs text-white/50">Failed</div>
          </div>
        </div>
      </div>

      {/* Info Panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Job Info */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings size={16} className="text-white/40" />
            <h3 className="font-medium text-white">Job Info</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">Workflow</span>
              <span className="text-white">{currentJob.workflowName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">File</span>
              <span className="text-white truncate ml-4">{currentJob.originalFilename}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Concurrency</span>
              <span className="text-white">{currentJob.concurrency}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-white/40" />
            <h3 className="font-medium text-white">Timeline</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/50">Created</span>
              <span className="text-white">{formatDate(currentJob.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Started</span>
              <span className="text-white">{formatDate(currentJob.startedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Completed</span>
              <span className="text-white">{formatDate(currentJob.completedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-4">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-2 w-full text-left"
          >
            <AlertCircle size={16} className="text-red-400" />
            <span className="font-medium text-red-400">Errors ({errors.length})</span>
            <ChevronDown
              size={16}
              className={cn('text-red-400 ml-auto transition-transform', showErrors && 'rotate-180')}
            />
          </button>

          {showErrors && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {errors.map((err, i) => (
                <div key={i} className="text-sm">
                  <span className="text-red-400">Row {err.rowNumber}:</span>{' '}
                  <span className="text-white/70">{err.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Row Results */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-medium text-white">Row Results</h3>
        </div>

        {currentJobRows.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            No results yet
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {currentJobRows.map((row) => (
              <RowResultItem
                key={row.id}
                row={row}
                isExpanded={expandedRows.has(row.id)}
                onToggle={() => toggleRowExpand(row.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {rowsTotalPages > 1 && (
          <div className="p-4 border-t border-white/10 flex justify-center gap-2">
            {Array.from({ length: rowsTotalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  rowsPage === pageNum
                    ? 'bg-zinc-600 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                )}
              >
                {pageNum}
              </button>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={async () => {
          setIsCancelling(true);
          try {
            await cancelJob(jobId);
            toast.success('Job cancelled');
          } finally {
            setIsCancelling(false);
            setShowCancelConfirm(false);
          }
        }}
        title="Cancel Job"
        message="Are you sure you want to cancel this job? This action cannot be undone."
        confirmText="Cancel Job"
        variant="danger"
        isLoading={isCancelling}
      />
    </div>
  );
}

// Row Result Item Component
function RowResultItem({
  row,
  isExpanded,
  onToggle,
}: {
  row: BatchRowResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const getStatusIcon = () => {
    switch (row.status) {
      case 'COMPLETED':
        return <CheckCircle size={14} className="text-green-400" />;
      case 'FAILED':
        return <XCircle size={14} className="text-red-400" />;
      case 'PROCESSING':
        return <Loader2 size={14} className="text-blue-400 animate-spin" />;
      case 'RETRYING':
        return <RotateCcw size={14} className="text-orange-400" />;
      default:
        return <Clock size={14} className="text-gray-400" />;
    }
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors"
      >
        <ChevronRight
          size={14}
          className={cn('text-white/40 transition-transform', isExpanded && 'rotate-90')}
        />
        <span className="text-sm text-white/60 w-16">Row {row.rowNumber}</span>
        {getStatusIcon()}
        <span className={cn(
          'text-sm capitalize',
          row.status === 'COMPLETED' ? 'text-green-400' :
          row.status === 'FAILED' ? 'text-red-400' :
          row.status === 'PROCESSING' ? 'text-blue-400' : 'text-white/60'
        )}>
          {row.status.toLowerCase()}
        </span>
        {row.errorMessage && (
          <span className="text-xs text-red-400 truncate ml-auto max-w-[300px]">
            {row.errorMessage}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-white/5 border-t border-white/5">
          <div className="grid grid-cols-2 gap-4">
            {/* Input */}
            <div>
              <p className="text-xs font-medium text-white/60 mb-2">Input</p>
              <pre className="text-xs text-white/80 bg-black/20 rounded p-3 overflow-x-auto max-h-48">
                {JSON.stringify(row.inputData, null, 2)}
              </pre>
            </div>

            {/* Output */}
            <div>
              <p className="text-xs font-medium text-white/60 mb-2">Output</p>
              {row.outputData ? (
                <pre className="text-xs text-white/80 bg-black/20 rounded p-3 overflow-x-auto max-h-48">
                  {JSON.stringify(row.outputData, null, 2)}
                </pre>
              ) : row.errorMessage ? (
                <div className="text-xs text-red-400 bg-red-500/10 rounded p-3">
                  {row.errorMessage}
                </div>
              ) : (
                <div className="text-xs text-white/40 bg-black/20 rounded p-3">
                  No output yet
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="mt-3 flex items-center gap-4 text-xs text-white/40">
            {row.startedAt && (
              <span>Started: {new Date(row.startedAt).toLocaleString()}</span>
            )}
            {row.completedAt && (
              <span>Completed: {new Date(row.completedAt).toLocaleString()}</span>
            )}
            {row.retryCount > 0 && (
              <span>Retries: {row.retryCount}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
