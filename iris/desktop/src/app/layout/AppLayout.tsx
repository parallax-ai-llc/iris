import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ShellBody } from './ShellBody';

interface AppLayoutProps {
  children: ReactNode;
  flush?: boolean;
}

export function AppLayout({ children, flush }: AppLayoutProps) {
  return (
    <div className="dt-shell">
      <TitleBar />
      <ShellBody className="dt-shell-body" rail={<Sidebar />}>
        <main className={`dt-main${flush ? ' dt-main-flush' : ''}`}>{children}</main>
      </ShellBody>
    </div>
  );
}
