/**
 * KeyboardShortcutsModal - Displays available keyboard shortcuts for the video editor
 */

import { memo, useMemo } from 'react';
import { X, Keyboard } from 'lucide-react';
import { formatCombo, useModalShortcutBlock } from '@/shared/lib/shortcuts';
import {
  VIDEO_EDITOR_KEYMAP,
  VIDEO_EDITOR_SHORTCUT_GROUPS,
  type VideoEditorCommand,
} from '@/features/video-editor/lib/shortcuts/videoEditorKeymap';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; action: string }[];
}

/** Display text for a command: its keys, minus Shift-variants of a key already shown. */
function keysLabel(command: VideoEditorCommand): string {
  if (command === 'multicamAngle') return '1-9';
  const keys = VIDEO_EDITOR_KEYMAP[command].keys;
  // Shift aliases (Shift+← etc.) are the same action; show the plain key only.
  const shown = keys.filter((k, i) => i === 0 || !/(^|\+)Shift\+/.test(k));
  return shown.map((k) => formatCombo(k)).join(' / ');
}

/** Mouse gestures are not keyboard shortcuts, so they are not in the keymap. */
const MOUSE_GESTURES: ShortcutGroup = {
  title: 'Mouse',
  shortcuts: [
    { key: 'Alt + Trim', action: 'Roll edit (adjust boundary)' },
    { key: 'Alt + Drag', action: 'Slip edit (shift source)' },
    { key: 'Alt + Shift + Trim End', action: 'Rate stretch (change speed)' },
  ],
};

function buildShortcutGroups(): ShortcutGroup[] {
  return [
    ...VIDEO_EDITOR_SHORTCUT_GROUPS.map((group) => ({
      title: group.title,
      shortcuts: group.commands.map((command) => ({
        key: keysLabel(command),
        action: VIDEO_EDITOR_KEYMAP[command].description,
      })),
    })),
    MOUSE_GESTURES,
  ];
}

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  // Block editor/global shortcuts while this dialog is open.
  useModalShortcutBlock(isOpen);
  const shortcutGroups = useMemo(() => buildShortcutGroups(), []);

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
