/**
 * IdeaListItem - Single idea item in the ideas list
 * Shows vote UI, status badge, and idea content
 */

import { memo } from 'react';
import { ChevronUp, ChevronDown, MessageSquare } from 'lucide-react';
import { IdeaItem, IdeaStatus } from '@/shared/api/ideas.api';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import ContentMarkdown from './ContentMarkdown';

interface IdeaListItemProps {
  idea: IdeaItem;
  onVote: (ideaId: string, vote: 1 | -1 | 0) => void;
  onClick?: () => void;
}

const getStatusLabel = (status: IdeaStatus): string => {
  const labels: Record<IdeaStatus, string> = {
    submitted: 'Submitted',
    working_on_it: 'In Progress',
    completed: 'Completed',
    rejected: 'Rejected',
    banned: 'Banned',
  };
  return labels[status] || status;
};

const getStatusColor = (status: IdeaStatus): string => {
  switch (status) {
    case 'submitted':
      return 'bg-zinc-700 text-zinc-300';
    case 'working_on_it':
      return 'bg-blue-900 text-blue-200';
    case 'completed':
      return 'bg-green-900 text-green-200';
    case 'rejected':
      return 'bg-red-900 text-red-200';
    case 'banned':
      return 'bg-purple-900 text-purple-200';
    default:
      return 'bg-zinc-700 text-zinc-300';
  }
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const IdeaListItem = memo(function IdeaListItem({
  idea,
  onVote,
  onClick,
}: IdeaListItemProps) {
  const { isAuthenticated } = useAuthStore();
  const isEdited = idea.createdAt !== idea.updatedAt;
  const netVotes = idea.upvoteCount - idea.downvoteCount;

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    const newVote = idea.userVote === 1 ? 0 : 1;
    onVote(idea.id, newVote as 1 | -1 | 0);
  };

  const handleDownvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    const newVote = idea.userVote === -1 ? 0 : -1;
    onVote(idea.id, newVote as 1 | -1 | 0);
  };

  return (
    <div
      onClick={onClick}
      className="flex gap-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors"
    >
      {/* Vote Section */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={handleUpvote}
          disabled={!isAuthenticated}
          className={`p-1 rounded transition-colors ${
            idea.userVote === 1
              ? 'text-white'
              : 'text-zinc-400 hover:text-white'
          } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''}`}
          title={isAuthenticated ? 'Upvote' : 'Login to vote'}
        >
          <ChevronUp size={24} strokeWidth={2.5} />
        </button>
        <span className="text-sm font-semibold text-white">{netVotes}</span>
        <button
          onClick={handleDownvote}
          disabled={!isAuthenticated}
          className={`p-1 rounded transition-colors ${
            idea.userVote === -1
              ? 'text-white'
              : 'text-zinc-400 hover:text-white'
          } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''}`}
          title={isAuthenticated ? 'Downvote' : 'Login to vote'}
        >
          <ChevronDown size={24} strokeWidth={2.5} />
        </button>
      </div>

      {/* Content Section */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(idea.status)}`}
          >
            {getStatusLabel(idea.status)}
          </span>
          <span className="text-xs text-zinc-500">
            {formatDate(idea.createdAt)}
          </span>
          {isEdited && (
            <span className="text-xs text-zinc-500 italic">(edited)</span>
          )}
        </div>

        <h3 className="text-base font-semibold text-white mb-1 truncate">
          {idea.title}
        </h3>

        <div className="text-sm text-zinc-400 line-clamp-2 [&>*]:mb-0 [&>*:last-child]:mb-0">
          <ContentMarkdown content={idea.description} />
        </div>

        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <MessageSquare size={14} />
            <span>{idea.commentCount}</span>
          </div>
          {idea.author.name && (
            <span className="text-xs text-zinc-500">by {idea.author.name}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default IdeaListItem;
