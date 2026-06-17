import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
  flush?: boolean;
}

export function AppLayout({ children, flush }: AppLayoutProps) {
  return (
    <div className="dt-shell">
      <TitleBar />
      <div className="dt-shell-body">
        <Sidebar />
        <main className={`dt-main${flush ? ' dt-main-flush' : ''}`}>{children}</main>
      </div>
    </div>
  );
}
