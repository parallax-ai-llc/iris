/**
 * ProjectsPage — Video projects with Iris design tokens
 */

import { useEffect, useCallback, memo, useMemo, useState } from 'react';
import {
  Film,
  Loader2,
  Plus,
  Search,
  Grid3X3,
  List,
  MoreVertical,
  Trash2,
  Copy,
  Clock,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import {
  useVideoProjectStore,
  selectProjects,
  selectIsLoading,
} from '@/features/video-editor/stores/videoProject.store';
import { apiClient } from '@/shared/api/client';
import type { VideoProjectListItem, ProjectStatus } from '@/types/videoProject.types';
import { NewVideoProjectModal } from '@/features/video-editor/components/modals/NewVideoProjectModal';
import { useToast } from '@/shared/components/ui/useToast';
import { ConfirmDialog } from '@/shared/components/ui/Modal';

function useProjectThumbnail(projectId: string, hasThumbnail: boolean) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!hasThumbnail) {
      setThumbnailUrl(null);
      return;
    }

    let revoked = false;

    const fetchThumbnail = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.getBlob(`/api/video-projects/${projectId}/thumbnail`, {
          requireAuth: true,
        });
        if (response.success && response.data && !revoked) {
          const objectUrl = URL.createObjectURL(response.data);
          setThumbnailUrl(objectUrl);
        }
      } catch (error) {
        console.error('Failed to fetch thumbnail:', error);
      } finally {
        if (!revoked) setIsLoading(false);
      }
    };

    fetchThumbnail();

    return () => {
      revoked = true;
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasThumbnail]);

  return { thumbnailUrl, isLoading };
}

interface ProjectsPageProps {
  onOpenProject?: (projectId: string) => void;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'updatedAt' | 'createdAt' | 'name' | 'duration';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const STATUS_PILL: Record<ProjectStatus, string> = {
  draft: 'pill',
  editing: 'pill pill-iris',
  rendering: 'pill pill-warn',
  completed: 'pill pill-ok',
  archived: 'pill',
};

const ProjectCardGrid = memo(function ProjectCardGrid({
  project,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  project: VideoProjectListItem;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { thumbnailUrl, isLoading: thumbnailLoading } = useProjectThumbnail(
    project.id,
    project.thumbnailUrl !== null
  );

  return (
    <div className="dt-proj group" onClick={onOpen} style={{ position: 'relative' }}>
      <div className="dt-proj-thumb">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={project.name} />
        ) : thumbnailLoading ? (
          <div className="dt-proj-thumb-empty">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : (
          <div className="dt-proj-thumb-empty">
            <Film className="w-10 h-10" />
          </div>
        )}
        <div className="dt-proj-dur">{formatDuration(project.duration)}</div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="dt-proj-title truncate">{project.name}</div>
          {project.description && (
            <div
              className="truncate"
              style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 2 }}
            >
              {project.description}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="we-iconbtn"
            style={{ width: 26, height: 26 }}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                className="absolute right-0 top-full mt-1 z-20 glass-strong"
                style={{ borderRadius: 10, minWidth: 140 }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full text-left"
                  style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-2)' }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full text-left"
                  style={{ padding: '8px 12px', fontSize: 12, color: 'var(--err)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dt-proj-meta">
        <span className={STATUS_PILL[project.status] || 'pill'}>{project.status}</span>
        <span>
          {project.width}×{project.height}
        </span>
        <span className="flex items-center gap-1">
          <Film className="w-3 h-3" />
          {project.mediaCount}
        </span>
        <span style={{ marginLeft: 'auto' }} className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(project.updatedAt)}
        </span>
      </div>
    </div>
  );
});

const EmptyState = memo(function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="iris-card flex flex-col items-center justify-center text-center"
      style={{ padding: 48 }}
    >
      <FolderOpen className="w-12 h-12 mb-3" style={{ color: 'var(--text-4)' }} />
      <h3 className="t-display" style={{ fontSize: 24, marginBottom: 6 }}>
        No projects yet
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360, marginBottom: 18 }}>
        Create your first video project to start editing with our Premiere-style editor.
      </p>
      <button onClick={onCreate} className="btn btn-primary">
        <Plus className="w-4 h-4" />
        Create project
      </button>
    </div>
  );
});

export const ProjectsPage = memo(function ProjectsPage({ onOpenProject }: ProjectsPageProps) {
  const projects = useVideoProjectStore(selectProjects);
  const isLoading = useVideoProjectStore(selectIsLoading);
  const projectsError = useVideoProjectStore((s) => s.projectsError);
  const fetchProjects = useVideoProjectStore((s) => s.fetchProjects);
  const createProject = useVideoProjectStore((s) => s.createProject);
  const duplicateProject = useVideoProjectStore((s) => s.duplicateProject);
  const deleteProject = useVideoProjectStore((s) => s.deleteProject);
  const toast = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'duration':
          return b.duration - a.duration;
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
    return result;
  }, [projects, searchQuery, sortBy]);

  const handleCreate = useCallback(
    async (name: string, width: number, height: number) => {
      const project = await createProject({ name, width, height });
      if (project) onOpenProject?.(project.id);
    },
    [createProject, onOpenProject]
  );

  const handleOpen = useCallback(
    (projectId: string) => {
      onOpenProject?.(projectId);
    },
    [onOpenProject]
  );

  const handleDuplicate = useCallback(
    async (projectId: string) => {
      const result = await duplicateProject(projectId);
      if (result) toast.success('Project duplicated');
      else toast.error('Failed to duplicate project');
    },
    [duplicateProject, toast]
  );

  const handleDelete = useCallback((projectId: string) => {
    setPendingDeleteId(projectId);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      const success = await deleteProject(pendingDeleteId);
      if (success) toast.success('Project deleted');
      else toast.error('Failed to delete project');
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, deleteProject, toast]);

  return (
    <div className="dt-page-wide">
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Projects</div>
          <h1 className="dt-page-title">
            Video <em>projects</em>
          </h1>
          <p className="dt-page-sub">{projects.length} total</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-silver btn btn-lg">
          <Plus className="w-4 h-4" />
          New project
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative" style={{ width: 260 }}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--text-4)' }}
          />
          <input
            type="text"
            placeholder="Search projects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="iris-input"
            style={{ paddingLeft: 32 }}
          />
        </div>

        <div className="dt-seg" style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setSortBy('updatedAt')}
            className="dt-seg-item"
            data-active={sortBy === 'updatedAt'}
          >
            Last modified
          </button>
          <button
            onClick={() => setSortBy('createdAt')}
            className="dt-seg-item"
            data-active={sortBy === 'createdAt'}
          >
            Created
          </button>
          <button
            onClick={() => setSortBy('name')}
            className="dt-seg-item"
            data-active={sortBy === 'name'}
          >
            Name
          </button>
        </div>

        <div className="dt-seg">
          <button
            onClick={() => setViewMode('grid')}
            className="dt-seg-item"
            data-active={viewMode === 'grid'}
            title="Grid"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className="dt-seg-item"
            data-active={viewMode === 'list'}
            title="List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-4)' }} />
        </div>
      ) : projectsError ? (
        <div
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 48 }}
        >
          <AlertCircle className="w-12 h-12 mb-3" style={{ color: 'var(--err)' }} />
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{projectsError}</p>
          <button onClick={() => fetchProjects()} className="btn mt-4">
            Retry
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        searchQuery ? (
          <div
            className="iris-card flex flex-col items-center justify-center text-center"
            style={{ padding: 48 }}
          >
            <Search className="w-12 h-12 mb-3" style={{ color: 'var(--text-4)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              No projects found for "{searchQuery}"
            </p>
          </div>
        ) : (
          <EmptyState onCreate={() => setIsCreateModalOpen(true)} />
        )
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns:
              viewMode === 'grid'
                ? 'repeat(auto-fill, minmax(260px, 1fr))'
                : 'minmax(0, 1fr)',
            gap: 12,
          }}
        >
          {filteredProjects.map((project) => (
            <ProjectCardGrid
              key={project.id}
              project={project}
              onOpen={() => handleOpen(project.id)}
              onDuplicate={() => handleDuplicate(project.id)}
              onDelete={() => handleDelete(project.id)}
            />
          ))}
        </div>
      )}

      <NewVideoProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreate}
      />

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
});

export default ProjectsPage;
