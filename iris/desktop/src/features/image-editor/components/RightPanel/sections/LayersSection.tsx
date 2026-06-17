/**
 * LayersSection - Layer management for right panel
 * Reuses logic from the original LayersPanel
 */

import { memo, useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, type Layer } from '@/features/image-editor/stores/imageEditor.store';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Layers,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Palette,
  MousePointer2,
  Check,
} from 'lucide-react';


const BLEND_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
] as const;

const LABEL_COLORS = [
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'yellow', label: 'Yellow', hex: '#eab308' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
] as const;

interface LayerItemProps {
  layer: Layer;
  isActive: boolean;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const LayerItem = memo(function LayerItem({
  layer,
  isActive,
  index,
  isFirst,
  isLast,
  isDragging,
  isDragOver,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
}: LayerItemProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(index)}
      onContextMenu={onContextMenu}
      className={cn(
        'flex items-center gap-1.5 p-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing',
        isActive ? 'bg-white/10 border border-white/20' : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-700/50',
        isDragging && 'opacity-50',
        isDragOver && 'border-t-2 border-t-white'
      )}
    >
      {/* Color indicator */}
      {layer.labelColor && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: LABEL_COLORS.find(c => c.id === layer.labelColor)?.hex }}
        />
      )}

      {/* Visibility toggle */}
      <button
        onClick={onToggleVisibility}
        className="p-0.5 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white flex-shrink-0"
      >
        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>

      {/* Reorder buttons */}
      <div className="flex flex-col gap-0">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className="p-0 text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className="p-0 text-zinc-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      <div
        className="w-8 h-8 rounded bg-zinc-700 flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer"
        onClick={onSelect}
      >
        {layer.imageData ? (
          <img src={layer.imageData} alt="" className="w-full h-full object-cover" />
        ) : (
          <Layers className="w-3 h-3 text-zinc-500" />
        )}
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <span className={cn('text-xs truncate block', isActive ? 'text-white' : 'text-zinc-300')}>
          {layer.name}
        </span>
        <span className="text-[10px] text-zinc-500">{layer.opacity}%</span>
      </div>

      <button
        onClick={onToggleLock}
        className="p-0.5 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white flex-shrink-0"
      >
        {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>
    </div>
  );
});

export const LayersSection = memo(function LayersSection() {
  const {
    layers,
    activeLayerId,
    setActiveLayer,
    addLayer,
    removeLayer,
    updateLayer,
    duplicateLayer,
    reorderLayers,
    flattenLayers,
    mergeLayerDown,
    selectLayerPixels,
  } = useImageEditorStore();

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const pad = 8;
    let nx = contextMenu.x;
    let ny = contextMenu.y;
    if (rect.right > window.innerWidth - pad) {
      nx = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (rect.bottom > window.innerHeight - pad) {
      ny = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (nx !== contextMenu.x || ny !== contextMenu.y) {
      setContextMenu({ ...contextMenu, x: nx, y: ny });
    }
  }, [contextMenu]);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [showFlattenConfirm, setShowFlattenConfirm] = useState(false);

  const handleAddLayer = useCallback(() => {
    addLayer('', 'New Layer');
  }, [addLayer]);

  const handleToggleVisibility = useCallback((layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) updateLayer(layerId, { visible: !layer.visible });
  }, [layers, updateLayer]);

  const handleToggleLock = useCallback((layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) updateLayer(layerId, { locked: !layer.locked });
  }, [layers, updateLayer]);

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderLayers(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, reorderLayers]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleMouseDown = () => {
      setContextMenu(null);
      setShowColorSubmenu(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [contextMenu]);

  const handleLayerContextMenu = useCallback((e: React.MouseEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveLayer(layerId);
    setContextMenu({ x: e.clientX, y: e.clientY, layerId });
    setShowColorSubmenu(false);
  }, [setActiveLayer]);

  // Move up/down handlers (in UI, "up" means higher z-order = higher array index)
  const handleMoveUp = useCallback((index: number) => {
    if (index < layers.length - 1) reorderLayers(index, index + 1);
  }, [reorderLayers, layers.length]);

  const handleMoveDown = useCallback((index: number) => {
    if (index > 0) reorderLayers(index, index - 1);
  }, [reorderLayers]);

  return (
    <div className="p-3">
      {/* Single-row toolbar: Add | Dup | Blend | Opacity | Delete */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={handleAddLayer}
          title="Add Layer"
          aria-label="Add Layer"
          className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => activeLayerId && duplicateLayer(activeLayerId)}
          disabled={!activeLayerId}
          title="Duplicate Layer"
          aria-label="Duplicate Layer"
          className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <select
          value={activeLayer?.blendMode ?? 'normal'}
          disabled={!activeLayer}
          onChange={(e) =>
            activeLayer && updateLayer(activeLayer.id, { blendMode: e.target.value as Layer['blendMode'] })
          }
          title="Blend Mode"
          aria-label="Blend Mode"
          className="flex-1 min-w-0 px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white disabled:opacity-50"
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>{mode.label}</option>
          ))}
        </select>
        <div
          className="flex items-center gap-1 flex-1 min-w-0"
          title={activeLayer ? `Opacity ${activeLayer.opacity}%` : 'Opacity'}
        >
          <input
            type="range"
            min={0}
            max={100}
            disabled={!activeLayer}
            value={activeLayer?.opacity ?? 100}
            onChange={(e) =>
              activeLayer && updateLayer(activeLayer.id, { opacity: Number(e.target.value) })
            }
            aria-label="Opacity"
            className="flex-1 min-w-0 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-2.5
              [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-[10px] text-zinc-500 tabular-nums w-7 text-right">
            {activeLayer?.opacity ?? 100}%
          </span>
        </div>
        <button
          onClick={() => activeLayerId && removeLayer(activeLayerId)}
          disabled={!activeLayerId}
          title="Delete Layer"
          aria-label="Delete Layer"
          className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Layers list (reversed: topmost layer at top of list, like Photoshop) */}
      {layers.length === 0 ? (
        <div className="py-4 text-center text-zinc-500 text-xs">No layers yet</div>
      ) : (
        <div className="space-y-1">
          {[...layers].reverse().map((layer) => {
            const index = layers.indexOf(layer);
            return (
              <LayerItem
                key={layer.id}
                layer={layer}
                isActive={layer.id === activeLayerId}
                index={index}
                isFirst={index === layers.length - 1}
                isLast={index === 0}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index}
                onSelect={() => setActiveLayer(layer.id)}
                onToggleVisibility={() => handleToggleVisibility(layer.id)}
                onToggleLock={() => handleToggleLock(layer.id)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                onContextMenu={(e) => handleLayerContextMenu(e, layer.id)}
              />
            );
          })}
        </div>
      )}

      {/* Flatten */}
      {layers.length > 1 && (
        <button
          onClick={() => setShowFlattenConfirm(true)}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 mt-2 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-xs transition-colors"
        >
          <Layers className="w-3 h-3" />
          Flatten All
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (() => {
        const ctxLayer = layers.find(l => l.id === contextMenu.layerId);
        const ctxIndex = layers.findIndex(l => l.id === contextMenu.layerId);
        const isBottom = ctxIndex === 0;
        const isGroupOrAdjustment = ctxLayer?.type === 'group' || ctxLayer?.type === 'adjustment';

        return (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Duplicate */}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
              onClick={() => { duplicateLayer(contextMenu.layerId); setContextMenu(null); }}
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate Layer
            </button>

            {/* Merge Down */}
            <button
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                isBottom ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
              )}
              disabled={isBottom}
              onClick={() => { if (!isBottom) { mergeLayerDown(contextMenu.layerId); setContextMenu(null); } }}
            >
              <Layers className="w-3.5 h-3.5" />
              Merge Down
            </button>

            <div className="border-t border-zinc-700 my-1" />

            {/* Delete */}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-red-500/10 hover:text-red-400 transition-colors text-left"
              onClick={() => { removeLayer(contextMenu.layerId); setContextMenu(null); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Layer
            </button>

            <div className="border-t border-zinc-700 my-1" />

            {/* Select Pixels */}
            <button
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                isGroupOrAdjustment ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
              )}
              disabled={isGroupOrAdjustment}
              onClick={() => { if (!isGroupOrAdjustment) { selectLayerPixels(contextMenu.layerId); setContextMenu(null); } }}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              Select Pixels
            </button>

            <div className="border-t border-zinc-700 my-1" />

            {/* Color Label */}
            <div className="relative">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                onMouseEnter={() => setShowColorSubmenu(true)}
              >
                <Palette className="w-3.5 h-3.5" />
                Label Color
                <ChevronRight className="w-3 h-3 ml-auto" />
              </button>

              {showColorSubmenu && (
                <div
                  className="absolute left-full top-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[120px]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {LABEL_COLORS.map(color => (
                    <button
                      key={color.id}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                      onClick={() => {
                        updateLayer(contextMenu.layerId, { labelColor: color.id as Layer['labelColor'] });
                        setContextMenu(null);
                        setShowColorSubmenu(false);
                      }}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color.hex }} />
                      {color.label}
                      {ctxLayer?.labelColor === color.id && <Check className="w-3 h-3 ml-auto" />}
                    </button>
                  ))}
                  <div className="border-t border-zinc-700 my-1" />
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                    onClick={() => {
                      updateLayer(contextMenu.layerId, { labelColor: null });
                      setContextMenu(null);
                      setShowColorSubmenu(false);
                    }}
                  >
                    <span className="w-3 h-3 rounded-full border border-zinc-600" />
                    None
                    {!ctxLayer?.labelColor && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Flatten confirmation */}
      <ConfirmDialog
        isOpen={showFlattenConfirm}
        onClose={() => setShowFlattenConfirm(false)}
        onConfirm={() => {
          flattenLayers();
          setShowFlattenConfirm(false);
        }}
        title="Flatten All Layers"
        message="This will merge all layers into a single layer. This action cannot be undone easily. Do you want to continue?"
        confirmText="Flatten"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
});
