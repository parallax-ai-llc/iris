import { memo, useState } from 'react';
import { CheckCircle, Download, Tag, Clock, User, Loader2, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { ExtensionDetail, InstallationStatus, ExtensionReview } from '@/shared/api/extension.types';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { StarRating } from './StarRating';
import { InstallButton } from './InstallButton';
import { ReviewSection } from './ReviewSection';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';

interface ExtensionDetailModalProps {
  extension: ExtensionDetail | null;
  reviews: ExtensionReview[];
  isOpen: boolean;
  isLoading: boolean;
  installStatus: InstallationStatus;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onSubmitReview: (rating: number, title?: string, content?: string) => void;
}

type DetailTab = 'overview' | 'reviews' | 'changelog';

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export const ExtensionDetailModal = memo(function ExtensionDetailModal({
  extension,
  reviews,
  isOpen,
  isLoading,
  installStatus,
  onClose,
  onInstall,
  onUninstall,
  onSubmitReview,
}: ExtensionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const { t } = useTranslation('extensions');
  const openReportModal = useExtensionStore((s) => s.openReportModal);

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: t('detail.overview') },
    { id: 'reviews', label: `${t('detail.reviews')} (${extension?.ratingCount || 0})` },
    { id: 'changelog', label: t('detail.changelog') },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" showCloseButton>
      {isLoading || !extension ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-xl bg-zinc-700/50 flex items-center justify-center text-3xl flex-shrink-0">
              {extension.icon || '📦'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-white">{extension.name}</h2>
                {extension.isOfficial && (
                  <CheckCircle className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <p className="text-sm text-zinc-400 mb-2">
                {t('detail.by', { author: extension.author })} · {t('detail.version', { version: extension.currentVersion })}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <StarRating rating={extension.ratingAvg} size="md" />
                  <span className="text-sm text-zinc-400 ml-1">
                    {extension.ratingAvg.toFixed(1)}
                  </span>
                </div>
                <span className="text-sm text-zinc-500">
                  {extension.ratingCount} {t('detail.reviews')}
                </span>
                <span className="text-sm text-zinc-500">
                  <Download className="w-3.5 h-3.5 inline mr-1" />
                  {formatCount(extension.downloadCount)}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              <button
                onClick={() => openReportModal(extension.id)}
                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                title={t('report.button')}
              >
                <Flag className="w-4 h-4" />
              </button>
              <InstallButton
                status={installStatus}
                onInstall={onInstall}
                onUninstall={onUninstall}
                size="lg"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors rounded-t-lg -mb-px',
                  activeTab === tab.id
                    ? 'text-white border-b-2 border-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {extension.description}
                </p>
              </div>

              {/* Meta info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                    <Tag className="w-3 h-3" />
                    {t('detail.type')}
                  </div>
                  <p className="text-sm text-zinc-300 capitalize">
                    {extension.type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                    <Clock className="w-3 h-3" />
                    {t('detail.lastUpdated')}
                  </div>
                  <p className="text-sm text-zinc-300">
                    {new Date(extension.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                    <User className="w-3 h-3" />
                    {t('detail.author')}
                  </div>
                  <p className="text-sm text-zinc-300">{extension.author}</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                    Price
                  </div>
                  <p className="text-sm text-zinc-300">
                    {extension.price === 0
                      ? 'Free'
                      : `${formatTokenCost(extension.price)} credits`}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {extension.tags.length > 0 && (
                <div>
                  <h4 className="text-xs text-zinc-500 mb-2">Tags</h4>
                  <div className="flex gap-1.5 flex-wrap">
                    {extension.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <ReviewSection reviews={reviews} extensionId={extension.id} onSubmitReview={onSubmitReview} />
          )}

          {activeTab === 'changelog' && (
            <div className="space-y-4">
              {extension.versions.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">
                  No changelog available
                </p>
              ) : (
                extension.versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-white">
                        v{ver.version}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(ver.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {ver.changelog && (
                      <p className="text-sm text-zinc-400 whitespace-pre-wrap">
                        {ver.changelog}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
});
