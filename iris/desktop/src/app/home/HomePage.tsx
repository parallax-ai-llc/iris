/**
 * HomePage — Editorial hero with BigStats, Quick Start tiles, Recent Activity
 */

import { memo, useEffect, useMemo } from 'react';
import {
  Image,
  Video,
  Workflow,
  ArrowRight,
  Clock,
  FolderOpen,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useUIStore } from '@/shared/stores/ui.store';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset } from '@/shared/api/types';
import { useImageStore } from '@/features/images/stores/image.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  page: string;
}

const BigStat = memo(function BigStat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className="dt-bigstat">
      <div className="dt-bigstat-head">{label}</div>
      <div className={`dt-bigstat-value${accent ? ' dt-bigstat-accent' : ''}`}>{value}</div>
      {sub && <div className="dt-bigstat-sub">{sub}</div>}
    </div>
  );
});

const QuickActionTile = memo(function QuickActionTile({
  action,
  onClick,
}: {
  action: QuickAction;
  onClick: () => void;
}) {
  const Icon = action.icon;
  return (
    <button onClick={onClick} className="dt-qa">
      <div className="dt-qa-icon">
        <Icon className="w-5 h-5" />
      </div>
      <div className="dt-qa-title">{action.title}</div>
      <div className="dt-qa-sub">{action.description}</div>
    </button>
  );
});

const RecentItemCard = memo(function RecentItemCard({
  item,
  onClick,
}: {
  item: {
    id: string;
    name: string;
    type: 'image' | 'video';
    createdAt: string;
    original: IrisAsset;
  };
  onClick: () => void;
}) {
  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(item.createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }, [item.createdAt]);

  const { url: cachedThumbnailUrl, isLoading } = useCachedAssetUrl(item.original, {
    type: 'thumbnail',
    enabled: true,
  });

  return (
    <button
      onClick={onClick}
      className="iris-card flex items-center gap-3 p-3 text-left w-full"
      style={{ minHeight: 64 }}
    >
      <div
        className="flex-shrink-0 rounded-md overflow-hidden"
        style={{ width: 48, height: 48, background: 'var(--bg-2)' }}
      >
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-4)' }} />
          </div>
        ) : cachedThumbnailUrl ? (
          <img src={cachedThumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {item.type === 'video' ? (
              <Video className="w-5 h-5" style={{ color: 'var(--text-4)' }} />
            ) : (
              <Image className="w-5 h-5" style={{ color: 'var(--text-4)' }} />
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}
        >
          {item.name}
        </div>
        <div
          className="flex items-center gap-1 mt-0.5 mono"
          style={{ fontSize: 10.5, color: 'var(--text-4)' }}
        >
          <Clock className="w-3 h-3" />
          {timeAgo}
        </div>
      </div>
      <span className={`pill ${item.type === 'video' ? 'pill-iris' : ''}`}>{item.type}</span>
    </button>
  );
});

export const HomePage = memo(function HomePage() {
  const { setCurrentPage } = useUIStore();
  const { user } = useAuthStore();
  const images = useImageStore((state) => state.images);
  const videos = useVideoStore((state) => state.videos);
  const fetchImages = useImageStore((state) => state.fetchImages);
  const fetchVideos = useVideoStore((state) => state.fetchVideos);
  const { t } = useTranslation('common');

  const openImageEditor = useEditorTabsStore((state) => state.openTab);
  const openVideoEditor = useEditorStore((state) => state.openEditor);

  useEffect(() => {
    fetchImages();
    fetchVideos();
  }, [fetchImages, fetchVideos]);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: 'create-image',
        title: t('home.actions.createImage.title'),
        description: t('home.actions.createImage.description'),
        icon: Image,
        page: 'images',
      },
      {
        id: 'create-video',
        title: t('home.actions.createVideo.title'),
        description: t('home.actions.createVideo.description'),
        icon: Video,
        page: 'videos',
      },
      {
        id: 'workflows',
        title: t('home.actions.buildWorkflow.title'),
        description: t('home.actions.buildWorkflow.description'),
        icon: Workflow,
        page: 'workflows',
      },
    ],
    [t]
  );

  const recentItems = useMemo(() => {
    const items = [
      ...images.slice(0, 5).map((img) => ({
        id: img.id,
        name: img.name,
        type: 'image' as const,
        createdAt: img.createdAt,
        original: img,
      })),
      ...videos.slice(0, 5).map((vid) => ({
        id: vid.id,
        name: vid.name,
        type: 'video' as const,
        createdAt: vid.createdAt,
        original: vid,
      })),
    ];
    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [images, videos]);

  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeThisWeek =
    images.filter((i) => new Date(i.createdAt).getTime() > weekStart).length +
    videos.filter((v) => new Date(v.createdAt).getTime() > weekStart).length;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting.morning');
    if (hour < 18) return t('home.greeting.afternoon');
    return t('home.greeting.evening');
  }, [t]);

  const userName = user?.name?.split(' ')[0] || 'Creator';

  return (
    <div className="dt-page">
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Dashboard</div>
          <h1 className="dt-page-title">
            {greeting} <em>{userName}.</em>
          </h1>
          <p className="dt-page-sub">{t('home.subtitle')}</p>
        </div>
      </div>

      <div
        className="grid mb-8"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
      >
        <BigStat label={t('home.stats.imagesCreated')} value={images.length} accent />
        <BigStat label={t('home.stats.videosCreated')} value={videos.length} />
        <BigStat
          label={t('home.stats.thisWeek')}
          value={activeThisWeek}
          sub="last 7 days"
        />
      </div>

      <div className="dt-section-head">
        <span className="label">
          <TrendingUp className="w-3 h-3 inline mr-1" />
          {t('home.quickStart')}
        </span>
        <div className="rule" />
      </div>
      <div
        className="grid mb-8"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}
      >
        {quickActions.map((action) => (
          <QuickActionTile
            key={action.id}
            action={action}
            onClick={() => setCurrentPage(action.page)}
          />
        ))}
      </div>

      <div className="dt-section-head">
        <span className="label">
          <Clock className="w-3 h-3 inline mr-1" />
          {t('home.recentActivity')}
        </span>
        <div className="rule" />
        {recentItems.length > 0 && (
          <button
            onClick={() => setCurrentPage('library')}
            className="btn btn-ghost btn-sm"
          >
            {t('home.viewAll')}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {recentItems.length > 0 ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}
        >
          {recentItems.map((item) => (
            <RecentItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              onClick={() => {
                if (item.type === 'image') {
                  openImageEditor(item.original);
                } else {
                  openVideoEditor(item.original);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 32 }}
        >
          <FolderOpen
            className="w-10 h-10 mb-3"
            style={{ color: 'var(--text-4)' }}
          />
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 500 }}>
            {t('home.noActivity')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>
            {t('home.noActivityHint')}
          </p>
        </div>
      )}

      <div className="iris-card mt-8 text-center" style={{ padding: 14 }}>
        <p style={{ fontSize: 11, color: 'var(--text-4)' }}>
          <span style={{ color: 'var(--text-3)' }}>{t('home.proTip')}</span>{' '}
          {t('home.proTipNavigate')}{' '}
          <kbd
            className="mono"
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--surf-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-2)',
              fontSize: 10,
            }}
          >
            Ctrl
          </kbd>{' '}
          +{' '}
          <kbd
            className="mono"
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--surf-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--text-2)',
              fontSize: 10,
            }}
          >
            1-9
          </kbd>
        </p>
      </div>
    </div>
  );
});

export default HomePage;
