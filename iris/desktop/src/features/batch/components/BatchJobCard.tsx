import { useState, useRef, useCallback } from 'react';
import {
  Clock,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Trash2,
  RotateCcw,
  Layers,
  Ban,
} from 'lucide-react';
import type { BatchJob, BatchJobStatus } from '@/types/batch.types';

interface BatchJobCardProps {
  job: BatchJob;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const STATUS_PILL: Record<BatchJobStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', cls: 'pill', icon: <Clock size={11} /> },
  PROCESSING: { label: 'Processing', cls: 'pill pill-iris', icon: <Loader2 size={11} className="animate-spin" /> },
  PAUSED: { label: 'Paused', cls: 'pill pill-warn', icon: <Pause size={11} /> },
  COMPLETED: { label: 'Completed', cls: 'pill pill-ok', icon: <CheckCircle size={11} /> },
  FAILED: { label: 'Failed', cls: 'pill pill-err', icon: <XCircle size={11} /> },
  CANCELLED: { label: 'Cancelled', cls: 'pill', icon: <Ban size={11} /> },
};

export function BatchJobCard({ job, onView, onDelete, onRetry }: BatchJobCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const status = STATUS_PILL[job.status];
  const progressPercent =
    job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;
  const successRate =
    job.processedRows > 0 ? Math.round((job.successfulRows / job.processedRows) * 100) : 0;

  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleCardClick = useCallback(() => onView?.(job.id), [onView, job.id]);
  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMenuOpen(!isMenuOpen);
    },
    [isMenuOpen]
  );
  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMenuOpen(false);
      onRetry?.(job.id);
    },
    [onRetry, job.id]
  );
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsMenuOpen(false);
      onDelete?.(job.id);
    },
    [onDelete, job.id]
  );

  return (
    <div onClick={handleCardClick} className="dt-job" style={{ position: 'relative' }}>
      <div className="dt-job-head">
        <div className="dt-job-icon">
          <Layers size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="dt-job-title truncate">{job.name}</div>
          <div className="dt-job-sub truncate">{job.workflowName}</div>
        </div>

        <div ref={menuRef} className="relative">
          <button onClick={handleMenuClick} className="we-iconbtn" style={{ width: 26, height: 26 }}>
            <MoreVertical size={14} />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 glass-strong"
                style={{ borderRadius: 10, minWidth: 160 }}
              >
                {(job.status === 'FAILED' || job.status === 'COMPLETED') && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-2 w-full text-left"
                    style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)' }}
                  >
                    <RotateCcw size={13} />
                    Retry failed
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full text-left"
                  style={{ padding: '8px 12px', fontSize: 12, color: 'var(--err)' }}
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={status.cls}>
          {status.icon}
          {status.label}
        </span>
        <span className="mono truncate" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
          {job.originalFilename}
        </span>
      </div>

      {job.status === 'PROCESSING' && (
        <div>
          <div
            className="flex justify-between mono mb-1"
            style={{ fontSize: 10.5, color: 'var(--text-3)' }}
          >
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="dt-progress-bar">
            <div className="dt-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div className="dt-job-stats">
        <div className="dt-job-mini">
          <div className="dt-job-mini-val">{job.totalRows}</div>
          <div className="dt-job-mini-label">Total</div>
        </div>
        <div className="dt-job-mini">
          <div className="dt-job-mini-val dt-job-mini-ok">{job.successfulRows}</div>
          <div className="dt-job-mini-label">Success</div>
        </div>
        <div className="dt-job-mini">
          <div className="dt-job-mini-val dt-job-mini-err">{job.failedRows}</div>
          <div className="dt-job-mini-label">Failed</div>
        </div>
      </div>

      <div
        className="flex items-center justify-between mono"
        style={{
          paddingTop: 10,
          borderTop: '1px solid var(--line-1)',
          fontSize: 10.5,
          color: 'var(--text-4)',
        }}
      >
        <div className="flex items-center gap-1">
          <Clock size={11} />
          {formatRelativeTime(job.createdAt)}
        </div>
        {job.processedRows > 0 && (
          <div className="flex items-center gap-1">
            <Play size={11} />
            {successRate}% success
          </div>
        )}
      </div>
    </div>
  );
}

export function BatchJobCardSkeleton() {
  return (
    <div className="dt-job img-ph" style={{ minHeight: 180 }}>
      <div className="dt-job-head">
        <div className="dt-job-icon" />
        <div className="flex-1">
          <div className="img-ph" style={{ height: 14, width: 130, borderRadius: 4, marginBottom: 6 }} />
          <div className="img-ph" style={{ height: 11, width: 90, borderRadius: 4 }} />
        </div>
      </div>
      <div className="img-ph" style={{ height: 20, width: 60, borderRadius: 999 }} />
      <div className="dt-job-stats">
        {[1, 2, 3].map((i) => (
          <div key={i} className="dt-job-mini">
            <div className="img-ph mx-auto" style={{ height: 18, width: 32, borderRadius: 4, marginBottom: 4 }} />
            <div className="img-ph mx-auto" style={{ height: 8, width: 40, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
