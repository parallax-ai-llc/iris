import type { ReactNode } from 'react';
import { AssistantDock } from '@/app/assistant/AssistantDock';

interface ShellBodyProps {
  /** Carrier class: `.dt-shell-body` (AppLayout) or `.ext-dock-inset …` (FullScreenLayout). */
  className: string;
  /** Optional navigation rail, left of the assistant (AppLayout only). */
  rail?: ReactNode;
  /** The screen itself. */
  children: ReactNode;
}

/**
 * Body row shared by both app shells: `[rail] [assistant] [screen]`.
 *
 * This is the single place the assistant panel is mounted, so every screen,
 * including the full-screen image / video / workflow editors, gets the same
 * prompt column on the left without the editors knowing about it.
 */
export function ShellBody({ className, rail, children }: ShellBodyProps) {
  return (
    <div className={className}>
      {rail}
      <AssistantDock />
      {children}
    </div>
  );
}
