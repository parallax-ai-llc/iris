import { create } from 'zustand';
import {
  BatchJob,
  BatchJobStatus,
  BatchJobStatusResponse,
  BatchRowResult,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '@/types/batch.types';
import {
  getBatchJobs,
  getBatchJob,
  createBatchJob,
  updateBatchJob,
  deleteBatchJob as deleteBatchJobApi,
  getBatchJobStatus,
  getBatchJobRows,
  startBatchJob as startBatchJobApi,
  pauseBatchJob as pauseBatchJobApi,
  resumeBatchJob as resumeBatchJobApi,
  cancelBatchJob as cancelBatchJobApi,
  retryBatchJob as retryBatchJobApi,
  downloadBatchResults,
} from '@/shared/api/batch.api';

// ==================== Types ====================

export type BatchStatusFilter = BatchJobStatus | 'ALL';

export const BATCH_STATUS_OPTIONS: { value: BatchStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

interface BatchState {
  // Data
  jobs: BatchJob[];
  currentJob: BatchJob | null;
  currentJobStatus: BatchJobStatusResponse | null;
  currentJobRows: BatchRowResult[];

  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isActionLoading: string | null; // 'start' | 'pause' | 'resume' | 'cancel' | 'retry' | null
  error: string | null;

  // List state
  searchQuery: string;
  statusFilter: BatchStatusFilter;
  page: number;
  totalPages: number;
  total: number;

  // Row results pagination
  rowsPage: number;
  rowsTotalPages: number;
  rowsTotal: number;

  // Polling
  pollingInterval: ReturnType<typeof setInterval> | null;
}

interface BatchActions {
  // CRUD
  fetchJobs: () => Promise<void>;
  fetchJob: (id: string) => Promise<BatchJob | null>;
  createJob: (data: CreateBatchJobInput, file: File, startImmediately?: boolean) => Promise<BatchJob | null>;
  updateJob: (id: string, data: UpdateBatchJobInput) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;

  // Status & Rows
  fetchJobStatus: (id: string) => Promise<void>;
  fetchJobRows: (id: string, page?: number) => Promise<void>;

  // Control Actions
  startJob: (id: string) => Promise<void>;
  pauseJob: (id: string) => Promise<void>;
  resumeJob: (id: string) => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;

  // Download
  downloadResults: (id: string, format: 'xlsx' | 'csv') => Promise<Blob | null>;

  // Filtering
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: BatchStatusFilter) => void;
  setPage: (page: number) => void;

  // Polling
  startPolling: (id: string) => void;
  stopPolling: () => void;

  // Helpers
  setCurrentJob: (job: BatchJob | null) => void;
  clearError: () => void;
  reset: () => void;
}

// ==================== Initial State ====================

const initialState: BatchState = {
  jobs: [],
  currentJob: null,
  currentJobStatus: null,
  currentJobRows: [],
  isLoading: false,
  isCreating: false,
  isActionLoading: null,
  error: null,
  searchQuery: '',
  statusFilter: 'ALL',
  page: 1,
  totalPages: 1,
  total: 0,
  rowsPage: 1,
  rowsTotalPages: 1,
  rowsTotal: 0,
  pollingInterval: null,
};

// ==================== Store ====================

export const useBatchStore = create<BatchState & BatchActions>((set, get) => ({
  ...initialState,

  // ==================== CRUD ====================

  fetchJobs: async () => {
    const { searchQuery, statusFilter, page } = get();
    set({ isLoading: true, error: null });

    try {
      const params: Record<string, unknown> = {
        page,
        limit: 12,
      };
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const response = await getBatchJobs(params);
      if (response) {
        set({
          jobs: response.jobs,
          totalPages: response.totalPages,
          total: response.total,
          isLoading: false,
        });
      } else {
        set({ jobs: [], totalPages: 1, total: 0, isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch batch jobs',
        isLoading: false,
      });
    }
  },

  fetchJob: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      const job = await getBatchJob(id);
      if (job) {
        set({ currentJob: job, isLoading: false });
        return job;
      } else {
        set({ error: 'Batch job not found', isLoading: false });
        return null;
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch batch job',
        isLoading: false,
      });
      return null;
    }
  },

  createJob: async (data: CreateBatchJobInput, file: File, startImmediately = false) => {
    set({ isCreating: true, error: null });

    try {
      const job = await createBatchJob(data, file);
      if (job) {
        set((state) => ({
          jobs: [job, ...state.jobs],
          currentJob: job,
          isCreating: false,
        }));

        // Start immediately if requested
        if (startImmediately) {
          await get().startJob(job.id);
        }

        return job;
      } else {
        set({ error: 'Failed to create batch job', isCreating: false });
        return null;
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create batch job',
        isCreating: false,
      });
      return null;
    }
  },

  updateJob: async (id: string, data: UpdateBatchJobInput) => {
    set({ error: null });

    try {
      const updated = await updateBatchJob(id, data);
      if (updated) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? updated : j)),
          currentJob: state.currentJob?.id === id ? updated : state.currentJob,
        }));
      } else {
        set({ error: 'Failed to update batch job' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update batch job',
      });
    }
  },

  deleteJob: async (id: string) => {
    try {
      const success = await deleteBatchJobApi(id);
      if (success) {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.id !== id),
          currentJob: state.currentJob?.id === id ? null : state.currentJob,
        }));
      } else {
        set({ error: 'Failed to delete batch job' });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete batch job',
      });
    }
  },

  // ==================== Status & Rows ====================

  fetchJobStatus: async (id: string) => {
    try {
      const status = await getBatchJobStatus(id);
      if (status) {
        set((state) => ({
          currentJobStatus: status,
          // Also update the job in the list if it exists
          jobs: state.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: status.status,
                  processedRows: status.progress.processedRows,
                  successfulRows: status.progress.successfulRows,
                  failedRows: status.progress.failedRows,
                }
              : j
          ),
          // Update current job if it matches
          currentJob: state.currentJob?.id === id
            ? {
                ...state.currentJob,
                status: status.status,
                processedRows: status.progress.processedRows,
                successfulRows: status.progress.successfulRows,
                failedRows: status.progress.failedRows,
              }
            : state.currentJob,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch job status:', error);
    }
  },

  fetchJobRows: async (id: string, page = 1) => {
    try {
      const response = await getBatchJobRows(id, { page, limit: 20 });
      if (response) {
        set({
          currentJobRows: response.results,
          rowsPage: response.page,
          rowsTotalPages: response.totalPages,
          rowsTotal: response.total,
        });
      }
    } catch (error) {
      console.error('Failed to fetch job rows:', error);
    }
  },

  // ==================== Control Actions ====================

  startJob: async (id: string) => {
    set({ isActionLoading: 'start', error: null });

    try {
      const result = await startBatchJobApi(id);
      if (result?.success) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: result.status } : j)),
          currentJob: state.currentJob?.id === id
            ? { ...state.currentJob, status: result.status }
            : state.currentJob,
          isActionLoading: null,
        }));
        // Start polling
        get().startPolling(id);
      } else {
        set({ error: result?.message || 'Failed to start job', isActionLoading: null });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start job',
        isActionLoading: null,
      });
    }
  },

  pauseJob: async (id: string) => {
    set({ isActionLoading: 'pause', error: null });

    try {
      const result = await pauseBatchJobApi(id);
      if (result?.success) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: result.status } : j)),
          currentJob: state.currentJob?.id === id
            ? { ...state.currentJob, status: result.status }
            : state.currentJob,
          isActionLoading: null,
        }));
        // Stop polling when paused
        get().stopPolling();
      } else {
        set({ error: result?.message || 'Failed to pause job', isActionLoading: null });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to pause job',
        isActionLoading: null,
      });
    }
  },

  resumeJob: async (id: string) => {
    set({ isActionLoading: 'resume', error: null });

    try {
      const result = await resumeBatchJobApi(id);
      if (result?.success) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: result.status } : j)),
          currentJob: state.currentJob?.id === id
            ? { ...state.currentJob, status: result.status }
            : state.currentJob,
          isActionLoading: null,
        }));
        // Resume polling
        get().startPolling(id);
      } else {
        set({ error: result?.message || 'Failed to resume job', isActionLoading: null });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume job',
        isActionLoading: null,
      });
    }
  },

  cancelJob: async (id: string) => {
    set({ isActionLoading: 'cancel', error: null });

    try {
      const result = await cancelBatchJobApi(id);
      if (result?.success) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: result.status } : j)),
          currentJob: state.currentJob?.id === id
            ? { ...state.currentJob, status: result.status }
            : state.currentJob,
          isActionLoading: null,
        }));
        // Stop polling when cancelled
        get().stopPolling();
      } else {
        set({ error: result?.message || 'Failed to cancel job', isActionLoading: null });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to cancel job',
        isActionLoading: null,
      });
    }
  },

  retryJob: async (id: string) => {
    set({ isActionLoading: 'retry', error: null });

    try {
      const result = await retryBatchJobApi(id);
      if (result?.success) {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === id ? { ...j, status: result.status } : j)),
          currentJob: state.currentJob?.id === id
            ? { ...state.currentJob, status: result.status }
            : state.currentJob,
          isActionLoading: null,
        }));
        // Start polling for retry
        get().startPolling(id);
      } else {
        set({ error: result?.message || 'Failed to retry job', isActionLoading: null });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to retry job',
        isActionLoading: null,
      });
    }
  },

  // ==================== Download ====================

  downloadResults: async (id: string, format: 'xlsx' | 'csv') => {
    try {
      const blob = await downloadBatchResults(id, format);
      return blob;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to download results',
      });
      return null;
    }
  },

  // ==================== Filtering ====================

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery, page: 1 });
  },

  setStatusFilter: (statusFilter: BatchStatusFilter) => {
    set({ statusFilter, page: 1 });
  },

  setPage: (page: number) => {
    set({ page });
  },

  // ==================== Polling ====================

  startPolling: (id: string) => {
    // Clear any existing polling
    get().stopPolling();

    // Start new polling interval (3 seconds)
    const interval = setInterval(async () => {
      const status = await getBatchJobStatus(id);
      if (status) {
        set((state) => ({
          currentJobStatus: status,
          jobs: state.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: status.status,
                  processedRows: status.progress.processedRows,
                  successfulRows: status.progress.successfulRows,
                  failedRows: status.progress.failedRows,
                }
              : j
          ),
          currentJob: state.currentJob?.id === id
            ? {
                ...state.currentJob,
                status: status.status,
                processedRows: status.progress.processedRows,
                successfulRows: status.progress.successfulRows,
                failedRows: status.progress.failedRows,
              }
            : state.currentJob,
        }));

        // Stop polling if job is no longer processing
        if (!['PROCESSING'].includes(status.status)) {
          get().stopPolling();
        }
      }
    }, 3000);

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },

  // ==================== Helpers ====================

  setCurrentJob: (job: BatchJob | null) => {
    set({ currentJob: job, currentJobStatus: null, currentJobRows: [] });
  },

  clearError: () => set({ error: null }),

  reset: () => {
    get().stopPolling();
    set(initialState);
  },
}));

// ==================== Selectors ====================

export const selectJobs = (state: BatchState & BatchActions) => state.jobs;
export const selectCurrentJob = (state: BatchState & BatchActions) => state.currentJob;
export const selectCurrentJobStatus = (state: BatchState & BatchActions) => state.currentJobStatus;
export const selectIsLoading = (state: BatchState & BatchActions) => state.isLoading;
export const selectError = (state: BatchState & BatchActions) => state.error;
