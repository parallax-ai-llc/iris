/**
 * IdeasTab - Tab content for Ideas in the Announcements modal
 * Shows list of ideas with sorting and voting
 */

import { memo, useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  Plus,
  TrendingUp,
  Clock,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import {
  getIdeas,
  voteIdea,
  IdeaItem,
  IdeasSort,
} from '@/shared/api/ideas.api';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import IdeaListItem from './IdeaListItem';
import IdeaCreateForm from './IdeaCreateForm';
import { cn } from '@/shared/lib/utils';

export const IdeasTab = memo(function IdeasTab() {
  const { isAuthenticated } = useAuthStore();
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<IdeasSort>('trending');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    const response = await getIdeas({
      page,
      limit: 10,
      sort,
      status: 'all',
    });
    if (response) {
      setIdeas(response.items);
      setTotalPages(response.totalPages);
    }
    setLoading(false);
  }, [page, sort]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleVote = async (ideaId: string, vote: 1 | -1 | 0) => {
    if (!isAuthenticated) {
      return;
    }

    const result = await voteIdea(ideaId, vote);
    if (result) {
      setIdeas(ideas.map((idea) => (idea.id === ideaId ? result : idea)));
    }
  };

  const handleIdeaCreated = (newIdea: IdeaItem) => {
    setIdeas([newIdea, ...ideas]);
    setShowCreateForm(false);
  };

  const getSortLabel = (sortType: IdeasSort): string => {
    const labels: Record<IdeasSort, string> = {
      trending: 'Trending',
      recent: 'Recent',
      most_votes: 'Most Votes',
      least_votes: 'Least Votes',
    };
    return labels[sortType];
  };

  const getSortIcon = (sortType: IdeasSort) => {
    switch (sortType) {
      case 'trending':
        return <TrendingUp size={16} />;
      case 'recent':
        return <Clock size={16} />;
      case 'most_votes':
        return <ThumbsUp size={16} />;
      case 'least_votes':
        return <ThumbsDown size={16} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Sort and Create Button */}
      <div className="flex items-center justify-between">
        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-lg',
              'bg-zinc-800 text-zinc-300',
              'hover:bg-zinc-700 hover:text-white',
              'transition-colors'
            )}
          >
            {getSortIcon(sort)}
            <span>{getSortLabel(sort)}</span>
            <ChevronDown size={16} />
          </button>
          {showSortDropdown && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 z-10">
              {(
                ['trending', 'recent', 'most_votes', 'least_votes'] as IdeasSort[]
              ).map((sortType) => (
                <button
                  key={sortType}
                  onClick={() => {
                    setSort(sortType);
                    setPage(1);
                    setShowSortDropdown(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                    'hover:bg-zinc-700 transition-colors',
                    sort === sortType ? 'bg-zinc-700 text-white' : 'text-zinc-300'
                  )}
                >
                  {getSortIcon(sortType)}
                  {getSortLabel(sortType)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create Button */}
        {isAuthenticated && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded-lg',
              'bg-white text-zinc-900',
              'hover:bg-zinc-200',
              'transition-colors'
            )}
          >
            <Plus size={16} />
            Suggest Idea
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <IdeaCreateForm
          onCancel={() => setShowCreateForm(false)}
          onCreated={handleIdeaCreated}
        />
      )}

      {/* Ideas List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-400">Loading...</div>
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-zinc-400 mb-4">
            No ideas yet. Be the first to suggest one!
          </div>
          {isAuthenticated && !showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm rounded-lg',
                'bg-white text-zinc-900',
                'hover:bg-zinc-200',
                'transition-colors'
              )}
            >
              <Plus size={16} />
              Suggest Idea
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <IdeaListItem key={idea.id} idea={idea} onVote={handleVote} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={cn(
              'px-3 py-1 text-sm rounded',
              'border border-zinc-700',
              'text-zinc-300 hover:text-white hover:border-zinc-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={cn(
              'px-3 py-1 text-sm rounded',
              'border border-zinc-700',
              'text-zinc-300 hover:text-white hover:border-zinc-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
});

export default IdeasTab;
