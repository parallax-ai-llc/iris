import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantPanel, useAssistantStore, type AssistantBlock } from '@/features/assistant';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useImageStore } from '@/features/images/stores/image.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useUIStore } from '@/shared/stores/ui.store';
import { IS_SELF_HOST } from '@/config/self-host';
import { useAssistantContext } from './useAssistantContext';

let workspaceListsRequested = false;

/**
 * The assistant column, mounted once by the app shell (AppLayout and
 * FullScreenLayout) to the left of every screen. Editors never render their
 * own chat; this picks the adapter for whatever is on screen.
 */
export function AssistantDock() {
  const { t } = useTranslation('common');
  const isOpen = useAssistantStore((s) => s.isOpen);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const openLogin = useUIStore((s) => s.openLogin);
  const { adapter, detail } = useAssistantContext();

  // The workspace prompt lists models, projects and recent assets by id. The
  // galleries load those on mount; load them once here so the assistant can
  // act on them from any screen.
  const isWorkspace = adapter.surface === 'workspace';
  useEffect(() => {
    if (!isOpen || !isWorkspace || !isAuthenticated || workspaceListsRequested) return;
    workspaceListsRequested = true;
    void useImageStore.getState().fetchModels();
    void useVideoStore.getState().fetchModels();
    void useVideoProjectStore.getState().fetchProjects();
  }, [isOpen, isWorkspace, isAuthenticated]);

  // The assistant talks to the Parallax LLM service, which needs an account.
  const blocked = useMemo<AssistantBlock | null>(() => {
    if (IS_SELF_HOST) {
      return { message: t('assistant.blocked.selfHost') };
    }
    // Session restore (checkAuth) has not finished yet: keep the input
    // disabled but don't flash the sign-in notice at a signed-in user.
    if (!isAuthenticated && isAuthLoading) {
      return { message: '' };
    }
    if (!isAuthenticated) {
      return {
        message: t('assistant.blocked.signIn'),
        actionLabel: t('assistant.blocked.signInAction'),
        onAction: openLogin,
      };
    }
    return null;
  }, [isAuthenticated, isAuthLoading, openLogin, t]);

  if (!isOpen) return null;
  return <AssistantPanel adapter={adapter} contextDetail={detail} blocked={blocked} />;
}
