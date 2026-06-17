/**
 * FloatingAIPanel - Floating panel for AI tool modes
 * Renders the appropriate AI panel inside a draggable wrapper
 */

import { memo, useCallback } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { FloatingPanelWrapper } from './FloatingPanelWrapper';
import { UpscalePanel } from '../Properties/panels/UpscalePanel';
import { BgRemovePanel } from '../Properties/panels/BgRemovePanel';
import { InpaintPanel } from '../Properties/panels/InpaintPanel';
import { OutpaintPanel } from '../Properties/panels/OutpaintPanel';
import { FaceRestorePanel } from '../Properties/panels/FaceRestorePanel';
import { ColorizePanel } from '../Properties/panels/ColorizePanel';

const AI_MODES = ['upscale', 'bgRemove', 'inpaint', 'outpaint', 'faceRestore', 'colorize'] as const;

const AI_CONFIG: Record<string, { title: string }> = {
  upscale: { title: 'AI Upscale' },
  bgRemove: { title: 'Remove Background' },
  inpaint: { title: 'AI Inpaint' },
  outpaint: { title: 'AI Outpaint' },
  faceRestore: { title: 'Face Restore' },
  colorize: { title: 'Colorize' },
};

export const FloatingAIPanel = memo(function FloatingAIPanel() {
  const editMode = useImageEditorStore((s) => s.editMode);
  const setEditMode = useImageEditorStore((s) => s.setEditMode);

  const handleClose = useCallback(() => {
    setEditMode('none');
  }, [setEditMode]);

  if (!AI_MODES.includes(editMode as typeof AI_MODES[number])) return null;

  const config = AI_CONFIG[editMode];
  if (!config) return null;

  const renderPanel = () => {
    switch (editMode) {
      case 'upscale': return <UpscalePanel />;
      case 'bgRemove': return <BgRemovePanel />;
      case 'inpaint': return <InpaintPanel />;
      case 'outpaint': return <OutpaintPanel />;
      case 'faceRestore': return <FaceRestorePanel />;
      case 'colorize': return <ColorizePanel />;
      default: return null;
    }
  };

  return (
    <FloatingPanelWrapper
      title={config.title}
      onClose={handleClose}
      width={320}
    >
      {renderPanel()}
    </FloatingPanelWrapper>
  );
});
