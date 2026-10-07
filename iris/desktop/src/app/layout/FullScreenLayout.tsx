import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { ShellBody } from './ShellBody';

interface FullScreenLayoutProps {
  /** Window title bar. Rendered full-width, outside the dock inset. */
  titleBar?: ReactNode;
  /** Page body. Inset by the extension panel rail while a panel is docked. */
  children: ReactNode;
  /** Extra root classes (background, mostly). */
  className?: string;
  /** Extra root styles (token-driven background/colour). */
  style?: CSSProperties;
}

/**
 * FullScreenLayout — shell for surfaces that take over the whole window
 * (the image / video / workflow editors) instead of rendering inside
 * `AppLayout`.
 *
 * Why this exists: the extension panel dock is a fixed rail pinned to the
 * window's right edge, and the only thing keeping it from covering the app is
 * a matching inset on whatever sits underneath. `AppLayout` gets that inset
 * from `.dt-shell-body`; a page rendered outside `AppLayout` gets it from
 * `.ext-dock-inset` here. Hand-rolling `h-screen flex flex-col` in a page
 * skips the inset, and the dock lands on top of the page's own right panel.
 *
 * The title bar is deliberately *outside* the inset, matching `AppLayout`:
 * the window controls stay pinned to the window's right edge.
 *
 * The body goes through `ShellBody`, which puts the app-wide assistant panel
 * on the left; `children` fill the rest as a column.
 */
export function FullScreenLayout({ titleBar, children, className, style }: FullScreenLayoutProps) {
  return (
    <div className={cn('h-screen flex flex-col overflow-hidden', className)} style={style}>
      {titleBar}
      <ShellBody className="ext-dock-inset flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">{children}</div>
      </ShellBody>
    </div>
  );
}
