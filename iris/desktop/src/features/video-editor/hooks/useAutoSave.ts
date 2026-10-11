/**
 * useAutoSave - mounts the video project auto-save (lib/autoSave.ts) for the
 * lifetime of the editor page and clears its timer on unmount.
 */

import { useEffect } from 'react';
import { setupAutoSave } from '../lib/autoSave';

export function useAutoSave() {
  useEffect(() => setupAutoSave(), []);
}
