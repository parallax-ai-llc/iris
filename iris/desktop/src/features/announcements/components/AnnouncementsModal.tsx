/**
 * AnnouncementsModal - Side panel for announcements, blogs, and ideas
 * Slides in from the right side, similar to web's WhatsNewModal
 */

import { memo, useEffect, useState, useCallback } from 'react';
import { X, Megaphone, BookOpen, Lightbulb } from 'lucide-react';
import { getWhatsNewItems, WhatsNewItem } from '@/shared/api/whats-new.api';
import { getBlogs, getBlogTitle, getBlogExcerpt, Blog } from '@/shared/api/blogs.api';
import ContentMarkdown from './ContentMarkdown';
import IdeasTab from './IdeasTab';
import { IrisLogo } from '@/shared/components/common/IrisLogo';
import { cn } from '@/shared/lib/utils';

type TabType = 'announcements' | 'blogs' | 'ideas';

interface AnnouncementsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTypeBadge = (type: string): string => {
  const colors: Record<string, string> = {
    feature: 'bg-blue-900 text-blue-200',
    update: 'bg-purple-900 text-purple-200',
    bugfix: 'bg-yellow-900 text-yellow-200',
    announcement: 'bg-pink-900 text-pink-200',
  };
  return colors[type] || colors.announcement;
};

const getTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    feature: 'Feature',
    update: 'Update',
    bugfix: 'Bug Fix',
    announcement: 'Announcement',
  };
  return labels[type] || type;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const AnnouncementsModal = memo(function AnnouncementsModal({
  isOpen,
  onClose,
}: AnnouncementsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('announcements');
  const [announcements, setAnnouncements] = useState<WhatsNewItem[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogsLoading, setBlogsLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fetch announcements
  const fetchAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true);
    const response = await getWhatsNewItems({ limit: 10 });
    if (response) {
      setAnnouncements(response.items);
    }
    setAnnouncementsLoading(false);
  }, []);

  // Fetch blogs
  const fetchBlogs = useCallback(async () => {
    setBlogsLoading(true);
    const response = await getBlogs({ limit: 10 });
    setBlogs(response.blogs);
    setBlogsLoading(false);
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    if (isOpen && activeTab === 'announcements') {
      fetchAnnouncements();
    }
    if (isOpen && activeTab === 'blogs') {
      fetchBlogs();
    }
  }, [isOpen, activeTab, fetchAnnouncements, fetchBlogs]);

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('announcements');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle blog click - open in external browser
  const handleBlogClick = (blog: Blog) => {
    const url = `https://parallax.kr/en/blog/${blog.slug}`;
    window.open(url, '_blank');
  };

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed inset-y-0 right-0 flex max-w-full">
        <div
          className={cn(
            'relative w-screen max-w-lg transform transition-transform duration-300 ease-in-out',
            isAnimating ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="flex h-full flex-col bg-zinc-900 shadow-xl overflow-hidden border-l border-zinc-800">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <IrisLogo variant="white" size="sm" />
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Share your ideas, explore our roadmap, and discover the latest
                  updates.
                </p>
              </div>

              {/* Tabs */}
              <div className="px-6 pb-2">
                <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
                  <button
                    onClick={() => setActiveTab('announcements')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                      activeTab === 'announcements'
                        ? 'bg-zinc-700 text-white shadow'
                        : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <Megaphone size={16} />
                    Announcements
                  </button>
                  <button
                    onClick={() => setActiveTab('blogs')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                      activeTab === 'blogs'
                        ? 'bg-zinc-700 text-white shadow'
                        : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <BookOpen size={16} />
                    Blog
                  </button>
                  <button
                    onClick={() => setActiveTab('ideas')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                      activeTab === 'ideas'
                        ? 'bg-zinc-700 text-white shadow'
                        : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <Lightbulb size={16} />
                    Ideas
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {activeTab === 'announcements' && (
                <div className="space-y-6">
                  {announcementsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-zinc-400">Loading...</div>
                    </div>
                  ) : announcements.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-zinc-400">No announcements</div>
                    </div>
                  ) : (
                    announcements.map((item) => (
                      <div
                        key={item.id}
                        className="pb-6 border-b border-zinc-800"
                      >
                        <div className="text-xs text-zinc-500 mb-1">
                          {formatDate(item.publishedAt)}
                        </div>
                        <h4 className="text-xl font-semibold text-white mb-1">
                          {item.title}
                        </h4>
                        <span
                          className={cn(
                            'inline-block px-2 py-0.5 rounded text-xs font-medium mb-3',
                            getTypeBadge(item.type)
                          )}
                        >
                          {getTypeLabel(item.type)}
                        </span>

                        <ContentMarkdown content={item.content} />

                        {item.imageUrl && (
                          <div className="mt-4">
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="rounded-lg max-w-full h-auto"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'blogs' && (
                <div className="space-y-6">
                  {blogsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-zinc-400">Loading...</div>
                    </div>
                  ) : blogs.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-zinc-400">No blog posts</div>
                    </div>
                  ) : (
                    blogs.map((blog) => (
                      <div
                        key={blog.id}
                        onClick={() => handleBlogClick(blog)}
                        className="block pb-6 border-b border-zinc-800 hover:bg-zinc-800/50 -mx-2 px-2 py-2 rounded-lg transition-colors cursor-pointer"
                      >
                        {blog.thumbnailImage && (
                          <div className="mb-3">
                            <img
                              src={blog.thumbnailImage}
                              alt={getBlogTitle(blog)}
                              className="rounded-lg w-full h-40 object-cover"
                            />
                          </div>
                        )}
                        <div className="text-xs text-zinc-500 mb-1">
                          {formatDate(blog.publishedAt || blog.createdAt)}
                        </div>
                        <h4 className="text-xl font-semibold text-white mb-2">
                          {getBlogTitle(blog)}
                        </h4>
                        {blog.category && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 bg-green-900 text-green-200">
                            {blog.category}
                          </span>
                        )}
                        {getBlogExcerpt(blog) && (
                          <p className="text-sm text-zinc-400 line-clamp-3">
                            {getBlogExcerpt(blog)}
                          </p>
                        )}
                        {blog.tags && blog.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {blog.tags.slice(0, 3).map((tag, index) => (
                              <span
                                key={index}
                                className="text-xs text-zinc-500"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'ideas' && <IdeasTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AnnouncementsModal;
