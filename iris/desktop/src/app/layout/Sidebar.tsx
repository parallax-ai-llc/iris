import {
  Image,
  Video,
  Workflow,
  FolderOpen,
  Home,
  LogOut,
  Film,
  LayoutTemplate,
  Layers,
  HardDrive,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/shared/stores/ui.store';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { IS_SELF_HOST } from '@/config/self-host';
import { ConnectionStatus } from './ConnectionStatus';

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  requiresServer?: boolean;
  /** Community/cloud-only feature — hidden in self-host (open-source) builds. */
  communityOnly?: boolean;
  kbd?: string;
}

const navItems: NavItem[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home, path: '/', kbd: '1' },
  { id: 'templates', labelKey: 'nav.templates', icon: LayoutTemplate, path: '/templates', requiresServer: true, kbd: '2' },
  { id: 'images', labelKey: 'nav.images', icon: Image, path: '/images', kbd: '3' },
  { id: 'videos', labelKey: 'nav.videos', icon: Video, path: '/videos', kbd: '4' },
  { id: 'projects', labelKey: 'nav.projects', icon: Film, path: '/projects', kbd: '5' },
  // Workflows + Batch run on the local engine (BYOK) — no cloud connection needed.
  { id: 'workflows', labelKey: 'nav.workflows', icon: Workflow, path: '/workflows', kbd: '6' },
  { id: 'batch', labelKey: 'nav.batch', icon: Layers, path: '/batch', kbd: '7' },
  // Library is a community (cloud) feature — not available when self-hosting.
  { id: 'library', labelKey: 'nav.library', icon: FolderOpen, path: '/library', communityOnly: true, kbd: '8' },
  { id: 'storage', labelKey: 'nav.storage', icon: HardDrive, path: '/storage', requiresServer: true, kbd: '9' },
].filter((item) => !(IS_SELF_HOST && item.communityOnly));

export function Sidebar() {
  const { currentPage, setCurrentPage } = useUIStore();
  const { user, logout } = useAuthStore();
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const { t } = useTranslation('common');

  const initial = (user?.name || user?.email || 'U')?.[0]?.toUpperCase() || 'U';

  return (
    <aside className="dt-rail">
      <nav className="dt-rail-items">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isDimmed = item.requiresServer && !isServerConnected;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`dt-rail-item${isDimmed ? ' dt-rail-item-dimmed' : ''}`}
              data-active={isActive}
              title={isDimmed ? t('editor:header.serverRequired') : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span>{t(item.labelKey as Parameters<typeof t>[0])}</span>
              {item.kbd && (
                <span className="dt-rail-item-kbd">{item.kbd}</span>
              )}
              {isDimmed && (
                <WifiOff className="w-3 h-3 ml-1" style={{ color: 'var(--text-4)' }} />
              )}
            </button>
          );
        })}
      </nav>

      {user && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCurrentPage('profile')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCurrentPage('profile');
            }
          }}
          className="dt-chip"
          data-active={currentPage === 'profile'}
        >
          <div className="dt-chip-avatar">
            {user.profileImageThumbnail ? (
              <img src={user.profileImageThumbnail} alt={user.name || 'User'} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="dt-chip-meta">
            <div className="dt-chip-name">{user.name || 'User'}</div>
            <div className="dt-chip-email">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              logout();
            }}
            className="dt-chip-icon"
            title={t('buttons.logout')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <ConnectionStatus isExpanded={true} />
    </aside>
  );
}
