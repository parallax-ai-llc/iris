/**
 * Editor Components Export
 *
 * Adobe Premiere-style video editor components:
 * - VideoEditor: Main editor layout
 * - EditorTimeline: Multi-track timeline
 * - EditorPreview: Video preview with subtitle overlay
 * - EditorInspector: Properties panel
 * - PlayheadControls: Playback controls
 * - TimelineClip: Draggable clip component
 * - TrackHeader: Track controls
 */

// Main editor component
export { VideoEditor, type VideoEditorProps, type EditorProjectData, type ExportOptions } from './VideoEditor';

// Timeline components
export { EditorTimeline } from './EditorTimeline';
export { TimelineClip } from './TimelineClip';
export { TrackHeader } from './TrackHeader';

// Preview and inspector
export { EditorPreview } from './EditorPreview';
export { EditorInspector } from './EditorInspector';

// Controls
export { PlayheadControls } from './PlayheadControls';

// Video Project Editor panels (Premiere Pro-style)
export { MediaPanel } from './MediaPanel';
export { EffectsPanel, EFFECT_CATEGORIES, type EffectDefinition } from './EffectsPanel';
export { KeyframeEditor } from './KeyframeEditor';
export { AudioMixerPanel } from './AudioMixerPanel';

// Re-export store types for convenience
export type {
  Track,
  TrackType,
  Clip,
  VideoClip,
  AudioClip,
  SubtitleClip,
  MusicClip,
  SubtitleStyle,
} from '@/features/video-editor/stores/editor.store';

export { useEditorStore, DEFAULT_SUBTITLE_STYLE } from '@/features/video-editor/stores/editor.store';
