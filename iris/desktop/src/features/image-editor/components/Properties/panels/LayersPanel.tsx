/**
 * LayersPanel - Layer management
 */

import { memo, useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, Layer, AdjustmentLayerType } from '@/features/image-editor/stores/imageEditor.store';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Layers,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  SunMedium,
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
  depth: number;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onToggleExpand?: () => void;
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
  depth,
  isDragging,
  isDragOver,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
}: LayerItemProps) {
  const isGroup = layer.type === 'group';
  const isAdjustment = layer.type === 'adjustment';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(index)}
      onContextMenu={onContextMenu}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      className={cn(
        'flex items-center gap-2 pr-2 py-1.5 rounded-lg transition-colors cursor-grab active:cursor-grabbing',
        isActive ? 'bg-white/10 border border-white/20' : 'bg-zinc-800 border border-transparent hover:bg-zinc-700',
        isDragging && 'opacity-50',
        isDragOver && 'border-t-2 border-t-white'
      )}
    >
      {/* Group expand toggle */}
      {isGroup ? (
        <button
          onClick={onToggleExpand}
          className="text-zinc-400 hover:text-white flex-shrink-0"
        >
          {layer.isExpanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <div className="w-3 flex-shrink-0" />
      )}

      {/* Thumbnail / Icon */}
      <div
        className="w-8 h-8 rounded bg-zinc-700 flex-shrink-0 flex items-center justify-center overflow-hidden"
        onClick={onSelect}
      >
        {isGroup ? (
          layer.isExpanded
            ? <FolderOpen className="w-4 h-4 text-zinc-400" />
            : <Folder className="w-4 h-4 text-zinc-400" />
        ) : isAdjustment ? (
          <SunMedium className="w-4 h-4 text-blue-400" />
        ) : layer.imageData ? (
          <img src={layer.imageData} alt="" className="w-full h-full object-cover" />
        ) : (
          <Layers className="w-4 h-4 text-zinc-500" />
        )}
      </div>

      {/* Layer info */}
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <span className={cn(
          'text-xs truncate block cursor-pointer',
          isActive ? 'text-white' : 'text-zinc-300'
        )}>
          {layer.name}
        </span>
        {isGroup ? (
          <span className="text-[10px] text-zinc-500">
            {layer.children?.length ?? 0} layers
          </span>
        ) : isAdjustment ? (
          <span className="text-[10px] text-blue-500">{layer.adjustmentType}</span>
        ) : (
          <span className="text-[10px] text-zinc-500">
            {layer.opacity}%
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        {layer.labelColor && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: LABEL_COLORS.find(c => c.id === layer.labelColor)?.hex }}
          />
        )}
        <button
          onClick={onToggleVisibility}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white"
          title={layer.visible ? 'Hide' : 'Show'}
        >
          {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
        <button
          onClick={onToggleLock}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-400 hover:text-white"
          title={layer.locked ? 'Unlock' : 'Lock'}
        >
          {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
});

export const LayersPanel = memo(function LayersPanel() {
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
    createLayerGroup,
    moveLayerToGroup,
    toggleGroupExpansion,
    ungroupLayers,
    addAdjustmentLayer,
    mergeLayerDown,
    selectLayerPixels,
  } = useImageEditorStore();
  const [showAdjustMenu, setShowAdjustMenu] = useState(false);
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

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAddLayer = useCallback(() => {
    addLayer('', 'New Layer');
  }, [addLayer]);

  const handleAddGroup = useCallback(() => {
    createLayerGroup('Group');
  }, [createLayerGroup]);

  const handleToggleVisibility = useCallback((layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      updateLayer(layerId, { visible: !layer.visible });
    }
  }, [layers, updateLayer]);

  const handleToggleLock = useCallback((layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      updateLayer(layerId, { locked: !layer.locked });
    }
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

  // Build flat render list with depth info (Photoshop-style: groups show children below them)
  const flatList = useCallback((): Array<{ layer: Layer; depth: number; index: number }> => {
    const result: Array<{ layer: Layer; depth: number; index: number }> = [];
    const rendered = new Set<string>();

    const visit = (layerId: string, depth: number) => {
      if (rendered.has(layerId)) return;
      rendered.add(layerId);
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;
      const index = layers.indexOf(layer);
      result.push({ layer, depth, index });
      if (layer.type === 'group' && layer.isExpanded && layer.children) {
        // Render children in reverse order (top child first in panel)
        [...layer.children].reverse().forEach(childId => visit(childId, depth + 1));
      }
    };

    // Render root-level layers (no parentId) in reverse order (topmost first)
    [...layers].reverse().forEach(l => {
      if (!l.parentId) visit(l.id, 0);
    });

    return result;
  }, [layers]);

  const renderedList = flatList();

  return (
    <div className="p-4 space-y-4">
      {/* Layer actions toolbar */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleAddLayer}
          title="Add Layer"
          className={cn(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-xs transition-colors'
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
        <button
          onClick={handleAddGroup}
          title="New Group"
          className={cn(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-xs transition-colors'
          )}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Group
        </button>
        <button
          onClick={() => activeLayerId && duplicateLayer(activeLayerId)}
          disabled={!activeLayerId}
          title="Duplicate"
          className={cn(
            'p-1.5 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => activeLayerId && removeLayer(activeLayerId)}
          disabled={!activeLayerId}
          title="Delete"
          className={cn(
            'p-1.5 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Adjustment layer creation */}
      <div className="relative">
        <button
          onClick={() => setShowAdjustMenu(o => !o)}
          className={cn(
            'w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-xs transition-colors'
          )}
        >
          <SunMedium className="w-3.5 h-3.5" />
          Add Adjustment Layer
          <ChevronDown className="w-3 h-3 ml-auto" />
        </button>
        {showAdjustMenu && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 py-1">
            {([
              ['brightness-contrast', 'Brightness/Contrast'],
              ['hue-saturation', 'Hue/Saturation'],
              ['levels', 'Levels'],
              ['curves', 'Curves'],
              ['exposure', 'Exposure'],
            ] as [AdjustmentLayerType, string][]).map(([type, label]) => (
              <button
                key={type}
                onClick={() => {
                  addAdjustmentLayer(type);
                  setShowAdjustMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active layer properties */}
      {activeLayer && (
        <div className="space-y-3 p-3 bg-zinc-800/50 rounded-lg">
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Opacity</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={activeLayer.opacity}
                onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-zinc-500 w-8 text-right">{activeLayer.opacity}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Fill</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={activeLayer.fillOpacity ?? 100}
                onChange={(e) => updateLayer(activeLayer.id, { fillOpacity: Number(e.target.value) })}
                className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-zinc-500 w-8 text-right">{activeLayer.fillOpacity ?? 100}%</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Blend Mode</label>
            <select
              value={activeLayer.blendMode}
              onChange={(e) => updateLayer(activeLayer.id, { blendMode: e.target.value as Layer['blendMode'] })}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm text-white"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Layers list */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Layers ({layers.filter(l => !l.parentId).length})
        </h3>

        {renderedList.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            No layers yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {renderedList.map(({ layer, depth, index }) => (
              <LayerItem
                key={layer.id}
                layer={layer}
                isActive={layer.id === activeLayerId}
                index={index}
                depth={depth}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index}
                onSelect={() => setActiveLayer(layer.id)}
                onToggleVisibility={() => handleToggleVisibility(layer.id)}
                onToggleLock={() => handleToggleLock(layer.id)}
                onToggleExpand={layer.type === 'group' ? () => toggleGroupExpansion(layer.id) : undefined}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                onContextMenu={(e) => handleLayerContextMenu(e, layer.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Group-specific actions */}
      {activeLayer?.type === 'group' && (
        <button
          onClick={() => activeLayerId && ungroupLayers(activeLayerId)}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-xs transition-colors'
          )}
        >
          <Folder className="w-3.5 h-3.5" />
          Ungroup
        </button>
      )}

      {/* Move active layer to group */}
      {activeLayer && activeLayer.type !== 'group' && layers.some(l => l.type === 'group') && (
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Move to group</label>
          <select
            onChange={(e) => {
              if (!activeLayerId) return;
              moveLayerToGroup(activeLayerId, e.target.value || null);
              e.target.value = '';
            }}
            defaultValue=""
            className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-white"
          >
            <option value="">— select group —</option>
            {layers.filter(l => l.type === 'group').map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Flatten button */}
      {layers.length > 1 && (
        <button
          onClick={flattenLayers}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
            'text-sm transition-colors'
          )}
        >
          <Layers className="w-4 h-4" />
          Flatten All Layers
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
    </div>
  );
});

export default LayersPanel;
