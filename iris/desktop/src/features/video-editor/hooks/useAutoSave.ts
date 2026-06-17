/**
 * useAutoSave - React hook for video project auto-save lifecycle.
 * Manages the subscription and timer cleanup properly via useEffect.
 */

import { useEffect } from 'react';
import { setupAutoSave } from '@/features/video-editor/stores/videoProject.store';

export function useAutoSave() {
  useEffect(() => {
    const cleanup = setupAutoSave();
    return cleanup;
  }, []);
}
