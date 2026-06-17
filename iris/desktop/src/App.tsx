import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n, { resolveInitialLanguage } from '@/shared/lib/i18n';
import { AppLayout } from '@/app/layout/AppLayout';
import { ToastContainer } from '@/shared/components/ui/Toast';
import { ErrorBoundary } from '@/shared/components/ui/ErrorBoundary';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useUIStore } from '@/shared/stores/ui.store';
import { useKeyboardShortcuts } from '@/shared/hooks/useKeyboardShortcuts';
import { useServerConnection } from '@/shared/hooks/useServerConnection';
import { HomePage } from '@/app/home/HomePage';
import { ImagesPage } from '@/app/images/ImagesPage';
import { VideosPage } from '@/app/videos/VideosPage';
import { WorkflowsPage } from '@/app/workflows/WorkflowsPage';
import { WorkflowEditorPage } from '@/app/workflows/WorkflowEditorPage';
import { LibraryPage } from '@/app/library/LibraryPage';
import { StoragePage } from '@/app/storage/StoragePage';
import { SettingsPage } from '@/app/settings/SettingsPage';
import { LoginPage } from '@/app/auth/LoginPage';
import { ImageEditorPage } from '@/app/editor/ImageEditorPage';
import { VideoEditorPage } from '@/app/editor/VideoEditorPage';
import { ProjectsPage } from '@/app/projects/ProjectsPage';
import { TemplatesPage } from '@/app/templates/TemplatesPage';
import { BatchPage } from '@/app/batch/BatchPage';
import { BatchCreatePage } from '@/app/batch/BatchCreatePage';
import { BatchDetailPage } from '@/app/batch/BatchDetailPage';
import { ExtensionsPage } from '@/app/extensions/ExtensionsPage';
import { ProfilePage } from '@/app/profile/ProfilePage';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { IrisLogo } from '@/shared/components/common/IrisLogo';
import { IS_SELF_HOST } from '@/config/self-host';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { currentPage, editingWorkflowId, selectedBatchId, setSelectedBatchId, isCreatingBatch } = useUIStore();
  const isImageEditorOpen = useEditorTabsStore((state) => state.tabs.length > 0 && state.isEditorVisible);
  const isVideoEditorOpen = useEditorStore((state) => state.isEditorOpen);
  const loadProject = useVideoProjectStore((state) => state.loadProject);

  useKeyboardShortcuts();
  useServerConnection();

  // Expose Zustand stores globally in dev mode for QA/E2E testing
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as Window & { __ZUSTAND_STORES__?: Record<string, unknown> }).__ZUSTAND_STORES__ = {
        editorTabs: useEditorTabsStore,
        imageEditor: useImageEditorStore,
        ui: useUIStore,
        editor: useEditorStore,
        auth: useAuthStore,
      };
    }
  }, []);

  useEffect(() => {
    // Self-host (open-source) mode has no cloud account — skip auth entirely.
    if (!IS_SELF_HOST) checkAuth();
  }, [checkAuth]);

  // 언어 결정 우선순위:
  //   1. electron-store 에 저장된 사용자 선택 (수동으로 설정 페이지에서 고른 값)
  //   2. 없으면 브라우저/OS 언어 감지
  //   3. 둘 다 매칭 안 되면 영어
  useEffect(() => {
    void resolveInitialLanguage().then((lang) => {
      if (lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    });
  }, []);

  // Cloud mode only: show loading + login gate. Self-host has no login flow.
  if (!IS_SELF_HOST) {
    // Show loading state
    if (isLoading) {
      return (
        <div className="h-screen flex items-center justify-center bg-zinc-900">
          <div className="flex flex-col items-center gap-4">
            <IrisLogo variant="white" size="xl" />
            <p className="text-zinc-400 text-sm">Loading...</p>
          </div>
        </div>
      );
    }

    // Show login if not authenticated
    if (!isAuthenticated) {
      return <LoginPage />;
    }
  }

  // Show image editor if open (full-screen mode)
  if (isImageEditorOpen) {
    return <ImageEditorPage />;
  }

  // Show video editor if open (full-screen mode)
  if (isVideoEditorOpen) {
    return <VideoEditorPage />;
  }

  // Show workflow editor (shared iris-editor, local engine) if one is open
  if (editingWorkflowId) {
    return <WorkflowEditorPage />;
  }

  // Show batch create page
  if (isCreatingBatch) {
    return (
      <AppLayout>
        <BatchCreatePage />
      </AppLayout>
    );
  }

  // Show batch detail page if a batch job is selected
  if (selectedBatchId) {
    return (
      <AppLayout>
        <BatchDetailPage
          jobId={selectedBatchId}
          onBack={() => setSelectedBatchId(null)}
        />
      </AppLayout>
    );
  }

  // Render current page based on navigation state
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'templates':
        return <TemplatesPage />;
      case 'images':
        return <ImagesPage />;
      case 'videos':
        return <VideosPage />;
      case 'workflows':
        return <WorkflowsPage />;
      case 'batch':
        return <BatchPage />;
      case 'projects':
        return (
          <ProjectsPage
            onOpenProject={async (projectId) => {
              // Load project and open video editor
              const project = await loadProject(projectId);
              if (project) {
                // Load timeline data into editor store
                const loadFromTimelineData = useEditorStore.getState().loadFromTimelineData;
                loadFromTimelineData(project.timelineData, project.duration);
              }
            }}
          />
        );
      case 'extensions':
        return <ExtensionsPage />;
      case 'library':
        // Library is a community (cloud) feature — unavailable when self-hosting.
        return IS_SELF_HOST ? <WorkflowsPage /> : <LibraryPage />;
      case 'storage':
        return <StoragePage />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <HomePage />;
    }
  };

  return <AppLayout>{renderPage()}</AppLayout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <ToastContainer />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
