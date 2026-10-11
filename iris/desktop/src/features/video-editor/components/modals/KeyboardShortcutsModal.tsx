/**
 * KeyboardShortcutsModal - Displays available keyboard shortcuts for the video editor
 */

import { memo, useMemo } from 'react';
import { X, Keyboard } from 'lucide-react';
import { getModifierKey } from '@/shared/lib/utils';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; action: string }[];
}

function buildShortcutGroups(mod: string): ShortcutGroup[] {
  return [
    {
      title: 'Playback',
      shortcuts: [
        { key: 'Space', action: 'Play / Pause' },
        { key: 'J', action: 'Reverse / Speed up reverse' },
        { key: 'K', action: 'Stop' },
        { key: 'L', action: 'Forward / Speed up forward' },
        { key: 'Left Arrow', action: 'Previous frame' },
        { key: 'Right Arrow', action: 'Next frame' },
        { key: 'Shift + Left/Right', action: 'Skip 10 frames' },
        { key: 'Home', action: 'Go to start' },
        { key: 'End', action: 'Go to end' },
      ],
    },
    {
      title: 'Editing',
      shortcuts: [
        { key: 'C', action: 'Split clip at playhead (Razor)' },
        { key: 'Delete', action: 'Delete selected clips' },
        { key: 'Shift + Delete', action: 'Ripple delete (close gap)' },
        { key: `${mod} + C`, action: 'Copy clip' },
        { key: `${mod} + V`, action: 'Paste clip at playhead' },
        { key: `${mod} + A`, action: 'Select all clips' },
        { key: `${mod} + D`, action: 'Duplicate clip' },
        { key: 'M', action: 'Mute/unmute selected clip' },
        { key: 'Alt + Trim', action: 'Roll edit (adjust boundary)' },
        { key: 'Alt + Drag', action: 'Slip edit (shift source)' },
        { key: 'Alt + Shift + Trim End', action: 'Rate stretch (change speed)' },
        { key: 'Escape', action: 'Deselect all' },
      ],
    },
    {
      title: 'In/Out Points',
      shortcuts: [
        { key: 'I', action: 'Set in point at playhead' },
        { key: 'O', action: 'Set out point at playhead' },
        { key: 'Alt + X', action: 'Clear in/out points' },
      ],
    },
    {
      title: 'Project',
      shortcuts: [
        { key: `${mod} + Z`, action: 'Undo' },
        { key: `${mod} + Shift + Z`, action: 'Redo' },
        { key: `${mod} + S`, action: 'Save project' },
        { key: 'G', action: 'Toggle snap to grid' },
        { key: '?', action: 'Show shortcuts' },
      ],
    },
  ];
}

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  const shortcutGroups = useMemo(() => buildShortcutGroups(getModifierKey()), []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{group.title}</h3>
              <div className="space-y-1.5">
                {group.shortcuts.map(({ key, action }) => (
                  <div key={key} className="flex justify-between items-center py-0.5">
                    <span className="text-sm text-zinc-300">{action}</span>
                    <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-200 font-mono">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
