import { memo } from 'react';
import { CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Extension, InstallationStatus } from '@/shared/api/extension.types';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { StarRating } from './StarRating';
import { InstallButton } from './InstallButton';

interface ExtensionCardProps {
  extension: Extension;
  installStatus: InstallationStatus;
  onInstall: () => void;
  onUninstall: () => void;
  onViewDetail: () => void;
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export const ExtensionCard = memo(function ExtensionCard({
  extension,
  installStatus,
  onInstall,
  onUninstall,
  onViewDetail,
}: ExtensionCardProps) {
  const { t } = useTranslation('extensions');

  return (
    <div
      onClick={onViewDetail}
      className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-5 cursor-pointer group hover:border-zinc-600/50 hover:bg-zinc-800/70 transition-all"
    >
      {/* Top: Icon + Name + Author */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-zinc-700/50 flex items-center justify-center text-2xl flex-shrink-0">
          {extension.icon || '📦'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-white truncate text-sm">
              {extension.name}
            </h3>
            {extension.isOfficial && (
              <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            )}
          </div>
          <span className="text-xs text-zinc-500">{extension.author}</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
        {extension.shortDescription}
      </p>

      {/* Tags */}
      {extension.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {extension.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-700/50 text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-500 mb-4">
        <div className="flex items-center gap-1">
          <StarRating rating={extension.ratingAvg} size="sm" />
          <span>{extension.ratingAvg.toFixed(1)}</span>
        </div>
        <span>
          {formatCount(extension.downloadCount)} {t('card.installs')}
        </span>
        {extension.price > 0 && (
          <span className="text-amber-400 font-medium">
            {formatTokenCost(extension.price)} credits
          </span>
        )}
        {extension.price === 0 && (
          <span className="text-emerald-400 font-medium">Free</span>
        )}
      </div>

      {/* Install button */}
      <InstallButton
        status={installStatus}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />
    </div>
  );
});
