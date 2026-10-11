/**
 * ChannelsSection - Photoshop-style channel management panel
 * Shows RGB composite + individual R/G/B color channels + saved alpha channels
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, type ColorChannelId } from '@/features/image-editor/stores/imageEditor.store';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Download,
} from 'lucide-react';

const COLOR_CHANNELS: Array<{
  id: ColorChannelId;
  name: string;
  color: string;
  shortcut: string;
}> = [
  { id: 'rgb', name: 'RGB', color: '#ffffff', shortcut: 'Ctrl+~' },
  { id: 'red', name: 'Red', color: '#ef4444', shortcut: 'Ctrl+1' },
  { id: 'green', name: 'Green', color: '#22c55e', shortcut: 'Ctrl+2' },
  { id: 'blue', name: 'Blue', color: '#3b82f6', shortcut: 'Ctrl+3' },
];

interface ChannelItemProps {
  name: string;
  color: string;
  isActive: boolean;
  visible: boolean;
  shortcut?: string;
  onSelect: () => void;
  onToggleVisibility: () => void;
}

const ChannelItem = memo(function ChannelItem({
  name,
  color,
  isActive,
  visible,
  shortcut,
  onSelect,
  onToggleVisibility,
}: ChannelItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-1.5 rounded-md transition-colors cursor-pointer',
        isActive
          ? 'bg-white/10 border border-white/20'
          : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-700/50'
      )}
      onClick={onSelect}
    >
      {/* Visibility toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
        className="p-0.5 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white flex-shrink-0"
      >
        {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>

      {/* Channel color indicator */}
      <span
        className="w-2 h-2 rounded-sm flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Channel name */}
      <span className={cn('text-xs flex-1', isActive ? 'text-white' : 'text-zinc-300')}>
        {name}
      </span>

      {/* Shortcut hint */}
      {shortcut && (
        <span className="text-[9px] text-zinc-600 flex-shrink-0">{shortcut}</span>
      )}
    </div>
  );
});

export const ChannelsSection = memo(function ChannelsSection() {
  const {
    activeChannelId,
    channelVisibility,
    alphaChannels,
    activeAlphaChannelId,
    selection,
    setActiveChannel,
    toggleChannelVisibility,
    saveSelectionAsChannel,
    loadChannelAsSelection,
    deleteAlphaChannel,
    toggleAlphaChannelVisibility,
  } = useImageEditorStore();

  const handleSelectColorChannel = useCallback((channelId: ColorChannelId) => {
    setActiveChannel(channelId);
  }, [setActiveChannel]);

  const handleSelectAlphaChannel = useCallback((channelId: string) => {
    useImageEditorStore.setState({ activeAlphaChannelId: channelId, activeChannelId: 'rgb' as ColorChannelId });
  }, []);

  const selectedAlphaId = activeAlphaChannelId;

  return (
    <div className="px-3 pb-3">
      {/* Color channels */}
      <div className="space-y-0.5">
        {COLOR_CHANNELS.map((ch) => (
          <ChannelItem
            key={ch.id}
            name={ch.name}
            color={ch.color}
            isActive={activeChannelId === ch.id && !activeAlphaChannelId}
            visible={channelVisibility[ch.id]}
            shortcut={ch.shortcut}
            onSelect={() => handleSelectColorChannel(ch.id)}
            onToggleVisibility={() => toggleChannelVisibility(ch.id)}
          />
        ))}
      </div>

      {/* Alpha channels */}
      {alphaChannels.length > 0 && (
        <>
          <div className="border-t border-zinc-800 my-2" />
          <div className="space-y-0.5">
            {alphaChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                name={ch.name}
                color="#9ca3af"
                isActive={selectedAlphaId === ch.id}
                visible={ch.visible}
                onSelect={() => handleSelectAlphaChannel(ch.id)}
                onToggleVisibility={() => toggleAlphaChannelVisibility(ch.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 mt-3">
        <button
          onClick={saveSelectionAsChannel}
          disabled={!selection?.maskDataUrl}
          title="Save Selection as Channel"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" />
          Save
        </button>
        <button
          onClick={() => selectedAlphaId && loadChannelAsSelection(selectedAlphaId)}
          disabled={!selectedAlphaId}
          title="Load Channel as Selection"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" />
          Load
        </button>
        <button
          onClick={() => selectedAlphaId && deleteAlphaChannel(selectedAlphaId)}
          disabled={!selectedAlphaId}
          title="Delete Channel"
          className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});
