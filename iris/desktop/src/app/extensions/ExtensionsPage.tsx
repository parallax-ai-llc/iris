import { useEffect, useState, useCallback } from 'react';
import { Search, Puzzle, Plus, BookOpen, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { FeaturedBanner } from '@/features/extensions/components/FeaturedBanner';
import { CategoryFilter } from '@/features/extensions/components/CategoryFilter';
import { SortDropdown } from '@/features/extensions/components/SortDropdown';
import { ExtensionGrid } from '@/features/extensions/components/ExtensionGrid';
import { ExtensionDetailModal } from '@/features/extensions/components/ExtensionDetailModal';
import { ExtensionSubmitModal } from '@/features/extensions/components/ExtensionSubmitModal';
import { ExtensionGuide } from '@/features/extensions/components/ExtensionGuide';
import { ReportModal } from '@/features/extensions/components/ReportModal';
import { MyExtensionsSection } from '@/features/extensions/components/MyExtensionsSection';
import { cn } from '@/shared/lib/utils';

type PageTab = 'browse' | 'my';

export function ExtensionsPage() {
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const { t } = useTranslation('extensions');

  if (!isServerConnected) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Puzzle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-1">
            {t('title')}
          </h3>
          <p className="text-sm text-zinc-500">
            Server connection required
          </p>
        </div>
      </div>
    );
  }

  return <ExtensionsPageContent />;
}

function ExtensionsPageContent() {
  const { t } = useTranslation('extensions');
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState<PageTab>('browse');
  const user = useAuthStore((s) => s.user);

  const {
    extensions,
    featuredExtensions,
    isLoading,
    activeType,
    sortBy,
    page,
    totalPages,
    selectedExtension,
    selectedExtensionReviews,
    isDetailOpen,
    isDetailLoading,
    fetchExtensions,
    fetchFeaturedExtensions,
    fetchInstalledExtensions,
    setActiveType,
    setSearchQuery,
    setSortBy,
    setPage,
    installExtension,
    uninstallExtension,
    getInstallStatus,
    openDetail,
    closeDetail,
    submitReview,
    openSubmitModal,
    openGuide,
  } = useExtensionStore();

  useEffect(() => {
    fetchExtensions();
    fetchFeaturedExtensions();
    fetchInstalledExtensions();
    // Run once on mount — the store fetchers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchQuery]);

  const handleViewDetail = useCallback(
    (id: string) => openDetail(id),
    [openDetail]
  );

  const detailInstallStatus = selectedExtension
    ? getInstallStatus(selectedExtension.id)
    : 'not_installed';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{t('title')}</h1>
            <p className="text-sm text-zinc-400">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openGuide}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              {t('guide.viewGuide')}
            </button>
            {user && (
              <button
                onClick={openSubmitModal}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('submit.registerButton')}
              </button>
            )}
          </div>
        </div>

        {/* Page tabs */}
        {user && (
          <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-px">
            <button
              onClick={() => setActiveTab('browse')}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors -mb-px',
                activeTab === 'browse'
                  ? 'text-white border-b-2 border-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Puzzle className="w-3.5 h-3.5 inline mr-1.5" />
              {t('tabs.browse')}
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors -mb-px',
                activeTab === 'my'
                  ? 'text-white border-b-2 border-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <User className="w-3.5 h-3.5 inline mr-1.5" />
              {t('tabs.my')}
            </button>
          </div>
        )}

        {activeTab === 'browse' ? (
          <>
            {/* Featured Banner */}
            {featuredExtensions.length > 0 && (
              <FeaturedBanner
                extensions={featuredExtensions}
                onViewDetail={handleViewDetail}
              />
            )}

            {/* Filters bar */}
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4 flex-1">
                {/* Search */}
                <div className="relative max-w-xs w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('search')}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                {/* Category filter */}
                <CategoryFilter
                  activeType={activeType}
                  onTypeChange={setActiveType}
                />
              </div>

              {/* Sort */}
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>

            {/* Extension Grid */}
            <ExtensionGrid
              extensions={extensions}
              getInstallStatus={getInstallStatus}
              onInstall={installExtension}
              onUninstall={uninstallExtension}
              onViewDetail={handleViewDetail}
              isLoading={isLoading}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-sm text-zinc-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <MyExtensionsSection />
        )}
      </div>

      {/* Detail Modal */}
      <ExtensionDetailModal
        extension={selectedExtension}
        reviews={selectedExtensionReviews}
        isOpen={isDetailOpen}
        isLoading={isDetailLoading}
        installStatus={detailInstallStatus}
        onClose={closeDetail}
        onInstall={() => selectedExtension && installExtension(selectedExtension.id)}
        onUninstall={() =>
          selectedExtension && uninstallExtension(selectedExtension.id)
        }
        onSubmitReview={(rating, title, content) =>
          selectedExtension && submitReview(selectedExtension.id, rating, title, content)
        }
      />

      {/* Submit Modal */}
      <ExtensionSubmitModal />

      {/* Guide */}
      <ExtensionGuide />

      {/* Report Modal */}
      <ReportModal />
    </div>
  );
}
