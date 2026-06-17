/**
 * OpenProjectModal - Browse and open existing video projects
 */

import { memo, useState, useEffect } from 'react';
import { X, FolderOpen, Film, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';

interface OpenProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (projectId: string) => void;
}

export const OpenProjectModal = memo(function OpenProjectModal({
  isOpen,
  onClose,
  onOpen,
}: OpenProjectModalProps) {
  const { projects, projectsLoading, fetchProjects } = useVideoProjectStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      fetchProjects();
    }
  }, [isOpen, fetchProjects]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleOpen = () => {
    if (selectedId) {
      onOpen(selectedId);
      onClose();
    }
  };

  const handleDoubleClick = (id: string) => {
    onOpen(id);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Open Project</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Film className="w-10 h-10 mb-3" />
              <p className="text-sm">No projects found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedId(project.id)}
                  onDoubleClick={() => handleDoubleClick(project.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left',
                    selectedId === project.id
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                  )}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-10 rounded bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center">
                    {project.thumbnailUrl ? (
                      <img src={project.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{project.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px] text-zinc-500">{project.width}x{project.height}</span>
                      {project.duration > 0 && (
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(project.duration)}
                        </span>
                      )}
                      <span className="text-[11px] text-zinc-600">{formatDate(project.updatedAt || project.createdAt)}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                    project.status === 'editing' ? 'bg-cyan-500/10 text-cyan-400' :
                    project.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    'bg-zinc-700 text-zinc-400'
                  )}>
                    {project.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleOpen}
            disabled={!selectedId}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'text-neutral-900 hover:from-white hover:to-white',
              'transition-colors disabled:opacity-50'
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Open
          </button>
        </div>
      </div>
    </div>
  );
});

export default OpenProjectModal;
