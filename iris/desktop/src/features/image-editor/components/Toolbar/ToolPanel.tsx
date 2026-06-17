/**
 * ToolPanel - Left sidebar with editing tools
 * Photoshop CC-style vertical tool strip with grouped tools & sub-menus
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import {
  MousePointer2,
  Square,
  Circle,
  Pencil,
  PenTool,
  Type,
  Shapes,
  PaintBucket,
  Copy,
  Eraser,
  Droplet,
  Pipette,
  Sun,
  Moon,
  Droplets,
  Wind,
  ZoomIn,
  Wand2,
  Bandage,
  Sparkles,
  Lasso,
  Pentagon,
  Brush,
  Eye,
  Hash,
  ArrowLeftRight,
  Grid3X3,
  Trash2,
  Magnet,
  EyeOff,
  Crop,
  Hand,
  Search,
  Ruler,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, type EditMode, type DrawTool, type SelectionTool } from '@/features/image-editor/stores/imageEditor.store';

// ─── Types ───────────────────────────────────────────────────

type ToolGroupAction =
  | { type: 'editMode'; mode: EditMode }
  | { type: 'drawTool'; tool: DrawTool }
  | { type: 'selectionTool'; tool: SelectionTool }
  | { type: 'navigationTool'; tool: 'hand' | 'zoom' };

interface ToolGroupItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: ToolGroupAction;
}

interface ToolGroup {
  groupId: string;
  shortcut?: string;
  items: ToolGroupItem[];
}

// ─── Tool Group Definitions ─────────────────────────────────

const ICON_SIZE = 'w-4 h-4';
const ICON_SM = 'w-3.5 h-3.5';

const TOOL_GROUPS: ToolGroup[] = [
  // --- Selection ---
  {
    groupId: 'marquee',
    shortcut: 'M',
    items: [
      { id: 'rectangle', label: 'Rectangle Select', icon: <Square className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'rectangle' } },
      { id: 'ellipse', label: 'Ellipse Select', icon: <Circle className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'ellipse' } },
    ],
  },
  {
    groupId: 'lasso',
    shortcut: 'L',
    items: [
      { id: 'lasso', label: 'Lasso', icon: <Lasso className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'lasso' } },
      { id: 'polygonal', label: 'Polygonal Lasso', icon: <Pentagon className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'polygonal' } },
      { id: 'magneticLasso', label: 'Magnetic Lasso', icon: <Magnet className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'magneticLasso' } },
    ],
  },
  {
    groupId: 'wand',
    shortcut: 'W',
    items: [
      { id: 'magicWand', label: 'Magic Wand', icon: <Wand2 className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'magicWand' } },
      { id: 'quickSelect', label: 'Quick Selection', icon: <Brush className={ICON_SIZE} />, action: { type: 'selectionTool', tool: 'quickSelect' } },
    ],
  },
  // --- Crop & Measure ---
  {
    groupId: 'eyedropper',
    shortcut: 'I',
    items: [
      { id: 'eyedropper', label: 'Eyedropper', icon: <Pipette className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'eyedropper' } },
      { id: 'color-sampler', label: 'Color Sampler', icon: <Eye className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'color-sampler' } },
      { id: 'count-tool', label: 'Count Tool', icon: <Hash className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'count-tool' } },
      { id: 'measure', label: 'Measure', icon: <Ruler className={ICON_SIZE} />, action: { type: 'editMode', mode: 'measure' } },
    ],
  },
  // --- Retouching ---
  {
    groupId: 'healing',
    shortcut: 'J',
    items: [
      { id: 'spot-healing', label: 'Spot Healing', icon: <Sparkles className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'spot-healing' } },
      { id: 'healing', label: 'Healing Brush', icon: <Bandage className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'healing' } },
      { id: 'red-eye-removal', label: 'Red Eye Removal', icon: <EyeOff className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'red-eye-removal' } },
    ],
  },
  {
    groupId: 'stamp',
    shortcut: 'S',
    items: [
      { id: 'clone', label: 'Clone Stamp', icon: <Copy className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'clone' } },
      { id: 'pattern-stamp', label: 'Pattern Stamp', icon: <Grid3X3 className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'pattern-stamp' } },
    ],
  },
  // --- Painting ---
  {
    groupId: 'brush',
    shortcut: 'B',
    items: [
      { id: 'brush', label: 'Brush', icon: <PenTool className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'brush' } },
      { id: 'pencil', label: 'Pencil', icon: <Pencil className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'pencil' } },
      { id: 'color-replace', label: 'Color Replacement', icon: <ArrowLeftRight className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'color-replace' } },
    ],
  },
  {
    groupId: 'eraser',
    shortcut: 'E',
    items: [
      { id: 'eraser', label: 'Eraser', icon: <Eraser className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'eraser' } },
      { id: 'background-eraser', label: 'Background Eraser', icon: <Trash2 className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'background-eraser' } },
      { id: 'magic-eraser', label: 'Magic Eraser', icon: <Wand2 className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'magic-eraser' } },
    ],
  },
  {
    groupId: 'gradient',
    shortcut: 'G',
    items: [
      { id: 'gradient', label: 'Gradient', icon: <Droplet className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'gradient' } },
      { id: 'reflected-gradient', label: 'Reflected Gradient', icon: <Droplet className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'reflected-gradient' } },
      { id: 'bucket', label: 'Paint Bucket', icon: <PaintBucket className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'bucket' } },
    ],
  },
  {
    groupId: 'blur',
    shortcut: 'R',
    items: [
      { id: 'blur-brush', label: 'Blur', icon: <ZoomIn className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'blur-brush' } },
      { id: 'sharpen-brush', label: 'Sharpen', icon: <Wand2 className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'sharpen-brush' } },
      { id: 'smudge', label: 'Smudge', icon: <Wind className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'smudge' } },
    ],
  },
  {
    groupId: 'dodge',
    shortcut: 'O',
    items: [
      { id: 'dodge', label: 'Dodge', icon: <Sun className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'dodge' } },
      { id: 'burn', label: 'Burn', icon: <Moon className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'burn' } },
      { id: 'sponge', label: 'Sponge', icon: <Droplets className={ICON_SIZE} />, action: { type: 'drawTool', tool: 'sponge' } },
    ],
  },
];

// Exported for keyboard shortcut cycling in ImageEditorPage
export const TOOL_GROUP_MAP: Record<string, ToolGroup> = Object.fromEntries(
  TOOL_GROUPS.map((g) => [g.groupId, g])
);

export const SHORTCUT_TO_GROUP: Record<string, ToolGroup> = Object.fromEntries(
  TOOL_GROUPS.filter((g) => g.shortcut).map((g) => [g.shortcut!.toLowerCase(), g])
);

// ─── Sub-components ─────────────────────────────────────────

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  shortcut?: string;
  hasSubmenu?: boolean;
}

const ToolButton = memo(function ToolButton({
  icon,
  label,
  isActive,
  onClick,
  onContextMenu,
  shortcut,
  hasSubmenu,
}: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded transition-all relative',
        'hover:bg-zinc-700',
        isActive
          ? 'bg-white/10 text-white border border-white/20'
          : 'text-zinc-400 hover:text-white'
      )}
    >
      {icon}
      {hasSubmenu && (
        <span className="absolute bottom-0.5 right-0.5 w-0 h-0 border-l-[3px] border-l-transparent border-b-[3px] border-b-zinc-500 border-r-[3px] border-r-transparent rotate-[-45deg]" />
      )}
    </button>
  );
});

interface SubMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface ToolSubMenuProps {
  items: SubMenuItem[];
  position: { x: number; y: number };
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ToolSubMenu = memo(function ToolSubMenu({ items, position, onSelect, onClose }: ToolSubMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-xl py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => { onSelect(item.id); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
});

// ─── Grouped Tool Button ────────────────────────────────────

interface GroupedToolButtonProps {
  group: ToolGroup;
  isActive: boolean;
  lastUsedId: string;
  onActivate: (item: ToolGroupItem) => void;
}

const GroupedToolButton = memo(function GroupedToolButton({
  group,
  isActive,
  lastUsedId,
  onActivate,
}: GroupedToolButtonProps) {
  const [subMenuPos, setSubMenuPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const activeItem = group.items.find(i => i.id === lastUsedId) || group.items[0];
  const hasSubmenu = group.items.length > 1;

  const handleClick = useCallback(() => {
    onActivate(activeItem);
  }, [onActivate, activeItem]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!hasSubmenu) return;
    e.preventDefault();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setSubMenuPos({ x: rect.right + 2, y: rect.top });
    }
  }, [hasSubmenu]);

  const handleSubSelect = useCallback((id: string) => {
    const item = group.items.find(i => i.id === id);
    if (item) onActivate(item);
    setSubMenuPos(null);
  }, [group.items, onActivate]);

  const handleSubClose = useCallback(() => {
    setSubMenuPos(null);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={group.shortcut ? `${activeItem.label} (${group.shortcut})` : activeItem.label}
        className={cn(
          'w-8 h-8 flex items-center justify-center rounded transition-all relative',
          'hover:bg-zinc-700',
          isActive
            ? 'bg-white/10 text-white border border-white/20'
            : 'text-zinc-400 hover:text-white'
        )}
      >
        {activeItem.icon}
        {hasSubmenu && (
          <span className="absolute bottom-0.5 right-0.5 w-0 h-0 border-l-[3px] border-l-transparent border-b-[3px] border-b-zinc-500 border-r-[3px] border-r-transparent rotate-[-45deg]" />
        )}
      </button>
      {subMenuPos && (
        <ToolSubMenu
          items={group.items.map(i => ({ id: i.id, label: i.label, icon: <span className={ICON_SM}>{i.icon}</span> }))}
          position={subMenuPos}
          onSelect={handleSubSelect}
          onClose={handleSubClose}
        />
      )}
    </>
  );
});

// ─── Divider ────────────────────────────────────────────────

const Divider = ({ hidden }: { hidden?: boolean }) => {
  if (hidden) return null;
  return <div className="w-5 border-t border-zinc-800 my-0.5" />;
};

// ─── FG/BG Color Swatches ───────────────────────────────────

const ColorSwatches = memo(function ColorSwatches({ pushToBottom = true }: { pushToBottom?: boolean }) {
  const fgColor = useImageEditorStore((s) => s.brushSettings.color);
  const bgColor = useImageEditorStore((s) => s.backgroundColor);
  const setBrushSettings = useImageEditorStore((s) => s.setBrushSettings);
  const setBackgroundColor = useImageEditorStore((s) => s.setBackgroundColor);
  const swapColors = useImageEditorStore((s) => s.swapColors);
  const resetDefaultColors = useImageEditorStore((s) => s.resetDefaultColors);

  return (
    <div className={cn("relative w-8 h-8 mb-2 flex-shrink-0", pushToBottom && "mt-auto")}>
      {/* Swap icon */}
      <button
        onClick={swapColors}
        title="Swap Colors (X)"
        className="absolute -top-0.5 right-0 z-20 text-zinc-500 hover:text-white transition-colors"
      >
        <RotateCw className="w-2.5 h-2.5" />
      </button>
      {/* Reset icon */}
      <button
        onClick={resetDefaultColors}
        title="Default Colors (D)"
        className="absolute bottom-0 -left-0.5 z-20 flex items-center justify-center"
      >
        <div className="w-2.5 h-2.5 relative">
          <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-black border border-zinc-600" />
          <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-white border border-zinc-600" />
        </div>
      </button>
      {/* Background color swatch */}
      <label
        className="absolute bottom-0 right-0 w-4.5 h-4.5 border border-zinc-600 rounded-sm cursor-pointer"
        style={{ backgroundColor: bgColor }}
        title="Background Color"
      >
        <input
          type="color"
          value={bgColor}
          onChange={(e) => setBackgroundColor(e.target.value)}
          className="sr-only"
        />
      </label>
      {/* Foreground color swatch */}
      <label
        className="absolute top-1 left-0 w-4.5 h-4.5 border border-zinc-600 rounded-sm z-10 cursor-pointer"
        style={{ backgroundColor: fgColor }}
        title="Foreground Color"
      >
        <input
          type="color"
          value={fgColor}
          onChange={(e) => setBrushSettings({ color: e.target.value })}
          className="sr-only"
        />
      </label>
    </div>
  );
});

// ─── Main ToolPanel ─────────────────────────────────────────

// Approximate single-column height: 18 buttons×34px + 6 dividers×6px + swatches 40px + padding 12px
const SINGLE_COL_MIN_HEIGHT = 700;

export const ToolPanel = memo(function ToolPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [doubleCol, setDoubleCol] = useState(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const check = () => {
      setDoubleCol(el.clientHeight < SINGLE_COL_MIN_HEIGHT);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const editMode = useImageEditorStore((s) => s.editMode);
  const activeTool = useImageEditorStore((s) => s.activeTool);
  const selectionTool = useImageEditorStore((s) => s.selectionTool);
  const navigationTool = useImageEditorStore((s) => s.navigationTool);
  const lastUsedToolPerGroup = useImageEditorStore((s) => s.lastUsedToolPerGroup);
  const setEditMode = useImageEditorStore((s) => s.setEditMode);
  const setActiveTool = useImageEditorStore((s) => s.setActiveTool);
  const setSelectionTool = useImageEditorStore((s) => s.setSelectionTool);
  const setNavigationTool = useImageEditorStore((s) => s.setNavigationTool);
  const setLastUsedToolForGroup = useImageEditorStore((s) => s.setLastUsedToolForGroup);

  const handleGroupActivate = useCallback((group: ToolGroup, item: ToolGroupItem) => {
    setLastUsedToolForGroup(group.groupId, item.id);
    const { action } = item;
    switch (action.type) {
      case 'editMode':
        setNavigationTool('none');
        setEditMode(action.mode);
        break;
      case 'drawTool':
        setNavigationTool('none');
        setEditMode('drawing');
        setActiveTool(action.tool);
        break;
      case 'selectionTool':
        setNavigationTool('none');
        setSelectionTool(action.tool);
        setEditMode('selection');
        break;
      case 'navigationTool':
        setNavigationTool(action.tool);
        break;
    }
  }, [setEditMode, setActiveTool, setSelectionTool, setNavigationTool, setLastUsedToolForGroup]);

  // Determine active state per group
  const isGroupActive = useCallback((group: ToolGroup): boolean => {
    return group.items.some((item) => {
      const { action } = item;
      switch (action.type) {
        case 'editMode':
          return editMode === action.mode;
        case 'drawTool':
          return editMode === 'drawing' && activeTool === action.tool;
        case 'selectionTool':
          return editMode === 'selection' && selectionTool === action.tool;
        case 'navigationTool':
          return navigationTool === action.tool;
        default:
          return false;
      }
    });
  }, [editMode, activeTool, selectionTool, navigationTool]);

  const renderGroupBtn = (group: ToolGroup) => (
    <GroupedToolButton
      key={group.groupId}
      group={group}
      isActive={isGroupActive(group)}
      lastUsedId={lastUsedToolPerGroup[group.groupId] || group.items[0].id}
      onActivate={(item) => handleGroupActivate(group, item)}
    />
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        'bg-zinc-900 border-r border-zinc-800 flex flex-col py-1.5 gap-0.5 flex-shrink-0',
        doubleCol
          ? 'w-[76px] flex-wrap content-start items-start pl-1 overflow-hidden'
          : 'w-10 items-center overflow-y-auto'
      )}
    >
      {/* Move Tool */}
      <ToolButton
        icon={<MousePointer2 className={ICON_SIZE} />}
        label="Move Tool"
        isActive={editMode === 'select' || editMode === 'move'}
        onClick={() => { setNavigationTool('none'); setEditMode('move'); }}
        shortcut="V"
      />

      <Divider hidden={doubleCol} />

      {/* Selection Tools: Marquee, Lasso, Wand */}
      {TOOL_GROUPS.slice(0, 3).map(renderGroupBtn)}

      <Divider hidden={doubleCol} />

      {/* Crop */}
      <ToolButton
        icon={<Crop className={ICON_SIZE} />}
        label="Crop"
        isActive={editMode === 'crop'}
        onClick={() => { setNavigationTool('none'); setEditMode('crop'); }}
        shortcut="C"
      />

      {/* Eyedropper group */}
      {TOOL_GROUPS.slice(3, 4).map(renderGroupBtn)}

      <Divider hidden={doubleCol} />

      {/* Retouching: Healing, Stamp */}
      {TOOL_GROUPS.slice(4, 6).map(renderGroupBtn)}

      <Divider hidden={doubleCol} />

      {/* Painting: Brush, Eraser, Gradient, Blur, Dodge */}
      {TOOL_GROUPS.slice(6, 11).map(renderGroupBtn)}

      <Divider hidden={doubleCol} />

      {/* Vector & Text: Pen, Text, Shapes */}
      <ToolButton
        icon={<PenTool className={ICON_SIZE} />}
        label="Pen Tool"
        isActive={editMode === 'pen'}
        onClick={() => { setNavigationTool('none'); setEditMode('pen'); }}
        shortcut="P"
      />
      <ToolButton
        icon={<Type className={ICON_SIZE} />}
        label="Text"
        isActive={editMode === 'text'}
        onClick={() => { setNavigationTool('none'); setEditMode('text'); }}
        shortcut="T"
      />
      <ToolButton
        icon={<Shapes className={ICON_SIZE} />}
        label="Shapes"
        isActive={editMode === 'shape'}
        onClick={() => { setNavigationTool('none'); setEditMode('shape'); }}
        shortcut="U"
      />

      <Divider hidden={doubleCol} />

      {/* Navigation: Hand, Zoom */}
      <ToolButton
        icon={<Hand className={ICON_SIZE} />}
        label="Hand"
        isActive={navigationTool === 'hand'}
        onClick={() => setNavigationTool('hand')}
        shortcut="H"
      />
      <ToolButton
        icon={<Search className={ICON_SIZE} />}
        label="Zoom"
        isActive={navigationTool === 'zoom'}
        onClick={() => setNavigationTool('zoom')}
        shortcut="Z"
      />

      {/* FG/BG Color Swatches */}
      <ColorSwatches pushToBottom={!doubleCol} />
    </div>
  );
});

export default ToolPanel;
