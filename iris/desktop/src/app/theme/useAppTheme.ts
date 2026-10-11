/**
 * Applies the appearance theme to <html>.
 *
 * effective = an editor is open ? 'dark' : resolve(preference, OS setting)
 *
 * Editors (image, video, workflow canvas) stay dark in every theme. Their root
 * already carries data-theme="dark" (FullScreenLayout); forcing <html> too
 * keeps body-level portals (menus, dialogs, toasts) dark while they are open.
 *
 * The first paint is handled by the inline script in index.html (reads the
 * localStorage mirror); this hook takes over once React mounts and then
 * reconciles with electron-store.
 */

import { useEffect, useState } from 'react';
import { useUIStore } from '@/shared/stores/ui.store';
import { useThemeStore } from '@/shared/stores/theme.store';
import { applyDocumentTheme, resolveTheme, systemPrefersDark, watchSystemTheme } from '@/shared/lib/theme';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';

export function useAppTheme(): void {
  const preference = useThemeStore((s) => s.preference);
  const hydrate = useThemeStore((s) => s.hydrate);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  const imageEditorOpen = useEditorTabsStore((s) => s.tabs.length > 0 && s.isEditorVisible);
  const videoEditorOpen = useEditorStore((s) => s.isEditorOpen);
  const workflowEditorOpen = useUIStore((s) => s.editingWorkflowId !== null);
  const editorOpen = imageEditorOpen || videoEditorOpen || workflowEditorOpen;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => watchSystemTheme(setSystemDark), []);

  const effective = editorOpen ? 'dark' : resolveTheme(preference, systemDark);
  useEffect(() => {
    applyDocumentTheme(effective);
  }, [effective]);
}
