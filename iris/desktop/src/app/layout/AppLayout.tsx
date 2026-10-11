import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ShellBody } from './ShellBody';
import { usePageHistoryNavigation } from '@/shared/hooks/useKeyboardShortcuts';

interface AppLayoutProps {
  children: ReactNode;
  flush?: boolean;
}

export function AppLayout({ children, flush }: AppLayoutProps) {
  // Back / forward (keys, mouse side buttons) only between shell pages.
  usePageHistoryNavigation();

  return (
    <div className="dt-shell">
      <TitleBar historyNav />
      <ShellBody className="dt-shell-body" rail={<Sidebar />}>
        <main className={`dt-main${flush ? ' dt-main-flush' : ''}`}>{children}</main>
      </ShellBody>
    </div>
  );
}
