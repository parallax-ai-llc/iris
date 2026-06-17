/**
 * IdeaCreateForm - Form for creating new ideas
 */

import { memo, useState } from 'react';
import { X } from 'lucide-react';
import { createIdea, IdeaItem } from '@/shared/api/ideas.api';
import { cn } from '@/shared/lib/utils';

interface IdeaCreateFormProps {
  onCancel: () => void;
  onCreated: (idea: IdeaItem) => void;
}

export const IdeaCreateForm = memo(function IdeaCreateForm({
  onCancel,
  onCreated,
}: IdeaCreateFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createIdea({
      title: title.trim(),
      description: description.trim(),
    });

    setIsSubmitting(false);

    if (result) {
      onCreated(result);
    } else {
      setError('Failed to create idea. Please try again.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-800 rounded-lg border border-zinc-700 p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Suggest an Idea</h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="idea-title"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Title
          </label>
          <input
            id="idea-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, descriptive title"
            maxLength={100}
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-zinc-900 border border-zinc-700',
              'text-white placeholder-zinc-500',
              'focus:outline-none focus:border-zinc-500',
              'transition-colors'
            )}
          />
        </div>

        <div>
          <label
            htmlFor="idea-description"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Description
          </label>
          <textarea
            id="idea-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your idea in detail. What problem does it solve? How would it work?"
            rows={4}
            maxLength={2000}
            className={cn(
              'w-full px-3 py-2 rounded-lg resize-none',
              'bg-zinc-900 border border-zinc-700',
              'text-white placeholder-zinc-500',
              'focus:outline-none focus:border-zinc-500',
              'transition-colors'
            )}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-zinc-700 text-zinc-300',
              'hover:bg-zinc-600 hover:text-white',
              'transition-colors disabled:opacity-50'
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim() || !description.trim()}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-white text-zinc-900',
              'hover:bg-zinc-200',
              'transition-colors disabled:opacity-50'
            )}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Idea'}
          </button>
        </div>
      </div>
    </form>
  );
});

export default IdeaCreateForm;
