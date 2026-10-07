import {
  Image,
  Video,
  Workflow,
  FolderOpen,
  Home,
  LogOut,
  LogIn,
  Film,
  LayoutTemplate,
  Layers,
  HardDrive,
  Puzzle,
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
  /** Cloud/community-only feature (needs Parallax cloud storage/account) —
   *  hidden in self-host (open-source) builds. */
  selfHostHidden?: boolean;
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
  // Extensions: marketplace needs the server, but the "install from local
  // folder" developer loop lives here too — keep it visible when self-hosting.
  { id: 'extensions', labelKey: 'nav.extensions', icon: Puzzle, path: '/extensions', requiresServer: true, kbd: '8' },
  // Library (community) + Storage (cloud GCS) require the Parallax cloud — not
  // meaningful when self-hosting.
  { id: 'library', labelKey: 'nav.library', icon: FolderOpen, path: '/library', selfHostHidden: true, kbd: '9' },
  { id: 'storage', labelKey: 'nav.storage', icon: HardDrive, path: '/storage', requiresServer: true, selfHostHidden: true, kbd: '0' },
].filter((item) => !(IS_SELF_HOST && item.selfHostHidden));

const platform = window.electronAPI?.app?.getPlatform?.() || navigator.platform || '';
const isMac = platform === 'darwin' || navigator.platform?.startsWith('Mac');
const MOD_KEY = isMac ? '⌘' : 'Ctrl+';

/**
 * Icon-only navigation rail. The left column belongs to the assistant panel
 * (mounted next to this rail by the shell), so the rail stays narrow: labels
 * and shortcuts move into the tooltip, and the label is kept as visually
 * hidden text for screen readers and text-based selectors.
 */
export function Sidebar() {
  const { currentPage, setCurrentPage, openLogin } = useUIStore();
  const { user, logout } = useAuthStore();
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const { t } = useTranslation('common');

  const initial = (user?.name || user?.email || 'U')?.[0]?.toUpperCase() || 'U';

  return (
    <aside className="dt-rail">
      <nav className="dt-rail-items" aria-label="sidebar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isDimmed = item.requiresServer && !isServerConnected;
          const label = t(item.labelKey as Parameters<typeof t>[0]);
          const tooltip = [
            item.kbd ? `${label} (${MOD_KEY}${item.kbd})` : label,
            isDimmed ? t('editor:header.serverRequired') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`dt-rail-item${isDimmed ? ' dt-rail-item-dimmed' : ''}`}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              title={tooltip}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="sr-only">{label}</span>
              {isDimmed && <WifiOff className="dt-rail-item-badge" aria-hidden />}
            </button>
          );
        })}
      </nav>

      {user && (
        <div className="dt-chip" data-active={currentPage === 'profile'}>
          <button
            type="button"
            onClick={() => setCurrentPage('profile')}
            className="dt-chip-avatar"
            title={user.email ? `${user.name || 'User'} · ${user.email}` : user.name || 'User'}
          >
            {user.profileImageThumbnail ? (
              <img src={user.profileImageThumbnail} alt={user.name || 'User'} />
            ) : (
              <span>{initial}</span>
            )}
            <span className="sr-only">{user.name || 'User'}</span>
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="dt-chip-icon"
            title={t('buttons.logout')}
            aria-label={t('buttons.logout')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Not signed in (cloud mode): login is optional — offer a button.
          Self-host has no cloud account, so nothing is shown there. */}
      {!user && !IS_SELF_HOST && (
        <button
          type="button"
          onClick={openLogin}
          className="dt-rail-item"
          title={t('buttons.login')}
        >
          <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
          <span className="sr-only">{t('buttons.login')}</span>
        </button>
      )}

      <ConnectionStatus isExpanded={false} />
    </aside>
  );
}
