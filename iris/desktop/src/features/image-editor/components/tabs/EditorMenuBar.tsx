/**
 * EditorMenuBar - Photoshop-style menu bar
 * File, Edit, Image, Select, Filter, View, Window
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { cn, getModifierKey } from '@/shared/lib/utils';
import { useImageEditorStore, FILTER_PRESETS } from '@/features/image-editor/stores/imageEditor.store';
import { BUILTIN_PROFILES } from '@/features/image-editor/canvas/colorProfile';
import * as F from '@/features/image-editor/canvas/filters';

// ==================== Types ====================

interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  children?: MenuItem[];
}

interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

// ==================== MenuDropdown Component ====================

interface MenuDropdownProps {
  menu: MenuDef;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onHover: () => void;
  anyMenuOpen: boolean;
}

// Renders a list of menu items (flat or with submenus)
const MenuItemList = memo(function MenuItemList({
  items,
  onClose,
  depth,
}: {
  items: MenuItem[];
  onClose: () => void;
  depth: number;
}) {
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSubmenu = useCallback((id: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredSubmenu(id), 50);
  }, []);

  const closeSubmenu = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredSubmenu(null), 150);
  }, []);

  useEffect(() => {
    return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); };
  }, []);

  return (
    <>
      {items.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="my-1 border-t border-zinc-700" />;
        }

        const hasChildren = item.children && item.children.length > 0;

        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => hasChildren ? openSubmenu(item.id) : setHoveredSubmenu(null)}
            onMouseLeave={closeSubmenu}
          >
            <button
              onClick={() => {
                if (hasChildren) return;
                if (item.action && !item.disabled) {
                  item.action();
                  onClose();
                }
              }}
              disabled={item.disabled && !hasChildren}
              className={cn(
                'w-full flex items-center justify-between px-4 py-1.5 text-xs text-left transition-colors',
                item.disabled && !hasChildren
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <span>{item.label}</span>
              {hasChildren ? (
                <span className="text-zinc-500 text-[10px]">▶</span>
              ) : item.shortcut ? (
                <span className="text-zinc-600 text-[10px]">{item.shortcut}</span>
              ) : null}
            </button>

            {hasChildren && hoveredSubmenu === item.id && (
              <div
                className="absolute left-full top-0 -ml-px z-[100] w-56 py-1 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 max-h-[70vh] overflow-visible"
                onMouseEnter={() => openSubmenu(item.id)}
                onMouseLeave={closeSubmenu}
              >
                <MenuItemList items={item.children!} onClose={onClose} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
});

const MenuDropdown = memo(function MenuDropdown({
  menu,
  isOpen,
  onOpen,
  onClose,
  onHover,
  anyMenuOpen,
}: MenuDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onOpen}
        onMouseEnter={() => { if (anyMenuOpen) onHover(); }}
        className={cn(
          'px-3 h-10 text-xs transition-colors',
          isOpen
            ? 'bg-zinc-700 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        )}
      >
        {menu.label}
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-[100] w-64 py-1 bg-zinc-800 rounded-b-lg shadow-xl border border-zinc-700 border-t-0 max-h-[80vh] overflow-visible"
        >
          <MenuItemList items={menu.items} onClose={onClose} depth={0} />
        </div>
      )}
    </div>
  );
});

// ==================== EditorMenuBar Props ====================

export interface EditorMenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDownloadOriginal: () => void;
  onCopyToClipboard: () => void;
  onExportCmykTiff?: () => void;
  onExportWebP?: () => void;
  onExportRgbTiff?: () => void;
  onExportBmp?: () => void;
  onResetChanges: () => void;
  onShowInfo: () => void;
  onCloseTab: () => void;
  onBackToGallery: () => void;
  onOpenPreset: (mode: string) => void;
  onOpenFilterGallery: () => void;
}

// ==================== EditorMenuBar Component ====================

export const EditorMenuBar = memo(function EditorMenuBar({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onDownloadOriginal,
  onCopyToClipboard,
  onExportCmykTiff,
  onExportWebP,
  onExportRgbTiff,
  onExportBmp,
  onResetChanges,
  onShowInfo,
  onCloseTab,
  onBackToGallery,
  onOpenPreset,
  onOpenFilterGallery,
}: EditorMenuBarProps) {
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    isDirty,
    isProcessing,
    setEditMode,
    showGrid,
    showRulers,
    showGuides,
    snapToGrid,
    toggleGrid,
    toggleRulers,
    toggleGuides,
    toggleSnapToGrid,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomTo100,
    clearSelection,
    invertSelection,
    selection,
    showLayersPanel,
    showHistoryPanel,
    showImageInfoPanel,
    toggleLayersPanel,
    toggleHistoryPanel,
    toggleImageInfoPanel,
    colorProofing,
    gamutWarning,
    colorProfile,
    toggleColorProofing,
    toggleGamutWarning,
    setColorProfile,
    expandSelectionBy,
    contractSelectionBy,
    smoothSelectionBy,
    borderSelectionBy,
    growSelectionByColor,
    selectSimilar,
    stampVisible,
    quickMaskEnabled,
    toggleQuickMask,
    setCropOverlay,
    applyCanvasFilter,
    applyFilterPreset,
    setSelection,
    setSelectionFeather,
    layers,
    activeLayerId,
  } = useImageEditorStore();

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const closeMenu = useCallback(() => setOpenMenuId(null), []);

  // Select All: create a full white mask covering entire canvas
  const selectAll = useCallback(() => {
    const activeLayer = layers.find(l => l.id === activeLayerId);
    const w = activeLayer?.width ?? 1920;
    const h = activeLayer?.height ?? 1080;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    setSelection({
      maskDataUrl: c.toDataURL(),
      bounds: { x: 0, y: 0, width: w, height: h },
      feather: 0,
      isInverted: false,
    });
  }, [layers, activeLayerId, setSelection]);

  // ==================== Menu Definitions ====================

  const mod = getModifierKey();

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: `${mod}+N`, action: onNew },
        { id: 'open', label: 'Open...', shortcut: `${mod}+O`, action: onOpen },
        { id: 'sep0', label: '', separator: true },
        { id: 'save', label: 'Save', shortcut: `${mod}+S`, action: onSave, disabled: !isDirty || isProcessing },
        { id: 'saveAs', label: 'Save As...', shortcut: `${mod}+Shift+S`, action: onSaveAs, disabled: isProcessing },
        { id: 'sep1', label: '', separator: true },
        { id: 'download', label: 'Download Original', action: onDownloadOriginal },
        { id: 'copy', label: 'Copy to Clipboard', action: onCopyToClipboard },
        { id: 'exportCmyk', label: 'Export CMYK TIFF...', action: onExportCmykTiff },
        { id: 'exportWebP', label: 'Export as WebP...', action: onExportWebP },
        { id: 'exportRgbTiff', label: 'Export as TIFF (RGB)...', action: onExportRgbTiff },
        { id: 'exportBmp', label: 'Export as BMP...', action: onExportBmp },
        { id: 'exportAs', label: 'Export As...', shortcut: `${mod}+Alt+Shift+W`, action: () => setEditMode('export') },
        { id: 'importSvg', label: 'Import SVG...', action: () => setEditMode('importSvg') },
        { id: 'sep2', label: '', separator: true },
        { id: 'closeTab', label: 'Close Tab', shortcut: `${mod}+W`, action: onCloseTab },
        { id: 'backToGallery', label: 'Back to Gallery', shortcut: 'Esc', action: onBackToGallery },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: `${mod}+Z`, action: undo, disabled: !canUndo() },
        { id: 'redo', label: 'Redo', shortcut: `${mod}+Shift+Z`, action: redo, disabled: !canRedo() },
        { id: 'sep1', label: '', separator: true },
        { id: 'stampVisible', label: 'Stamp Visible', shortcut: `${mod}+Shift+Alt+E`, action: stampVisible },
        { id: 'sep2', label: '', separator: true },
        { id: 'fillLayer', label: 'New Fill Layer...', action: () => setEditMode('layers') },
        { id: 'sep3', label: '', separator: true },
        { id: 'measureTool', label: 'Measure Tool', action: () => setEditMode('measure') },
        { id: 'sep4', label: '', separator: true },
        { id: 'reset', label: 'Reset All Changes', action: onResetChanges },
      ],
    },
    {
      id: 'image',
      label: 'Image',
      items: [
        { id: 'info', label: 'Image Info', action: onShowInfo },
        { id: 'sep1', label: '', separator: true },
        { id: 'adjustments', label: 'Adjustments...', action: () => setEditMode('adjust') },
        { id: 'transform', label: 'Transform...', action: () => setEditMode('transform') },
        { id: 'crop', label: 'Crop', action: () => setEditMode('crop') },
        { id: 'sep2', label: '', separator: true },
        { id: 'canvasSize', label: 'Canvas Size...', shortcut: `${mod}+Alt+C`, action: () => setEditMode('canvasSize') },
        { id: 'imageSize', label: 'Image Size...', shortcut: `${mod}+Alt+I`, action: () => setEditMode('imageSize') },
      ],
    },
    {
      id: 'ai',
      label: 'AI',
      items: [
        { id: 'upscale', label: 'Upscale', action: () => setEditMode('upscale'), disabled: isProcessing },
        { id: 'bgRemove', label: 'Background Remove', action: () => setEditMode('bgRemove'), disabled: isProcessing },
        { id: 'faceRestore', label: 'Face Restore', action: () => setEditMode('faceRestore'), disabled: isProcessing },
        { id: 'colorize', label: 'Colorize', action: () => setEditMode('colorize'), disabled: isProcessing },
        { id: 'sep1', label: '', separator: true },
        { id: 'inpaint', label: 'Inpaint', action: () => setEditMode('inpaint'), disabled: isProcessing },
        { id: 'outpaint', label: 'Outpaint', action: () => setEditMode('outpaint'), disabled: isProcessing },
        { id: 'sep2', label: '', separator: true },
        { id: 'smartPortrait', label: 'Smart Portrait', action: () => setEditMode('smartPortrait'), disabled: isProcessing },
        { id: 'superZoom', label: 'Super Zoom', action: () => setEditMode('superZoom'), disabled: isProcessing },
        { id: 'makeupTransfer', label: 'Makeup Transfer', action: () => setEditMode('makeupTransfer'), disabled: isProcessing },
        { id: 'photoRestoration', label: 'Photo Restoration', action: () => setEditMode('photoRestoration'), disabled: isProcessing },
        { id: 'landscapeMixer', label: 'Landscape Mixer', action: () => setEditMode('landscapeMixer'), disabled: isProcessing },
      ],
    },
    {
      id: 'presets',
      label: 'Presets',
      items: [
        {
          id: 'filterPresets', label: 'Filter Presets', children: FILTER_PRESETS.map((p) => ({
            id: `fp-${p.id}`, label: p.name, action: () => applyFilterPreset(p.id),
          })),
        },
        { id: 'sep0', label: '', separator: true },
        { id: '4panel', label: '4-Panel Portrait', action: () => onOpenPreset('4panel'), disabled: isProcessing },
        { id: 'sticker', label: 'Chibi Sticker Set', action: () => onOpenPreset('sticker'), disabled: isProcessing },
        { id: 'camcorder', label: 'Camcorder Collage', action: () => onOpenPreset('camcorder'), disabled: isProcessing },
        { id: 'fanedit', label: 'Fan Edit Collage', action: () => onOpenPreset('fanedit'), disabled: isProcessing },
        { id: 'sep1', label: '', separator: true },
        { id: 'productdoc', label: 'Product Documentation', action: () => onOpenPreset('productdoc'), disabled: isProcessing },
        { id: 'character', label: 'Character Concept Sheet', action: () => onOpenPreset('character'), disabled: isProcessing },
        { id: 'fashiondoc', label: 'Fashion Documentation', action: () => onOpenPreset('fashiondoc'), disabled: isProcessing },
        { id: 'sep2', label: '', separator: true },
        { id: 'popupmap', label: '3D Pop-Up Map', action: () => onOpenPreset('popupmap'), disabled: isProcessing },
        { id: 'diorama', label: 'Isometric Diorama', action: () => onOpenPreset('diorama'), disabled: isProcessing },
        { id: 'instagram3d', label: 'Instagram 3D Layout', action: () => onOpenPreset('instagram3d'), disabled: isProcessing },
      ],
    },
    {
      id: 'select',
      label: 'Select',
      items: [
        { id: 'selectAll', label: 'All', shortcut: `${mod}+A`, action: selectAll },
        { id: 'selection', label: 'Selection Tool', action: () => setEditMode('selection') },
        { id: 'sep1', label: '', separator: true },
        { id: 'deselect', label: 'Deselect', shortcut: `${mod}+D`, action: clearSelection, disabled: !selection },
        { id: 'invert', label: 'Invert Selection', shortcut: `${mod}+Shift+I`, action: invertSelection, disabled: !selection },
        { id: 'sep2', label: '', separator: true },
        { id: 'grow', label: 'Grow', action: growSelectionByColor, disabled: !selection },
        { id: 'similar', label: 'Similar', action: selectSimilar, disabled: !selection },
        { id: 'sep3', label: '', separator: true },
        { id: 'expand', label: 'Expand...', action: () => expandSelectionBy(2), disabled: !selection },
        { id: 'contract', label: 'Contract...', action: () => contractSelectionBy(2), disabled: !selection },
        { id: 'smooth', label: 'Smooth...', action: () => smoothSelectionBy(2), disabled: !selection },
        { id: 'border', label: 'Border...', action: () => borderSelectionBy(2), disabled: !selection },
        { id: 'feather', label: 'Feather...', action: () => setSelectionFeather(2), disabled: !selection },
        { id: 'sep4', label: '', separator: true },
        { id: 'colorRange', label: 'Color Range...', action: () => setEditMode('selection') },
        { id: 'transformSelection', label: 'Transform Selection', action: () => setEditMode('freeTransform') , disabled: !selection },
        { id: 'sep5', label: '', separator: true },
        { id: 'quickMask', label: `${quickMaskEnabled ? '✓ ' : ''}Quick Mask Mode`, shortcut: 'Q', action: toggleQuickMask },
        { id: 'sep6', label: '', separator: true },
        { id: 'selectSky', label: 'Sky', action: () => setEditMode('selectSky') },
        { id: 'selectFocusArea', label: 'Focus Area...', action: () => setEditMode('selectFocusArea') },
        { id: 'sep7', label: '', separator: true },
        // — Phase 15: Single Row/Column Marquee + Reselect —
        { id: 'singleRowMarquee', label: 'Single Row Marquee', action: () => setEditMode('singleRowMarquee') },
        { id: 'singleColumnMarquee', label: 'Single Column Marquee', action: () => setEditMode('singleColumnMarquee') },
        { id: 'reselect', label: 'Reselect', action: () => setEditMode('reselect') },
      ],
    },
    {
      id: 'filter',
      label: 'Filter',
      items: [
        { id: 'filterPanel', label: 'Filters...', action: () => { setEditMode('none'); setTimeout(() => setEditMode('filter'), 0); } },
        { id: 'filterGallery', label: 'Filter Gallery...', action: onOpenFilterGallery },
        {
          id: 'liquify',
          label: 'Liquify...',
          shortcut: `${mod}+Shift+X`,
          action: () =>
            applyCanvasFilter(
              (d) =>
                F.liquify(d, [
                  {
                    cx: d.width / 2,
                    cy: d.height / 2,
                    radius: Math.min(d.width, d.height) / 4,
                    dx: 30,
                    dy: 0,
                    pressure: 1,
                    tool: 'push',
                  },
                ]),
              'Liquify'
            ),
        },
        {
          id: 'adaptiveWideAngle',
          label: 'Adaptive Wide Angle...',
          action: () => applyCanvasFilter((d) => F.adaptiveWideAngle(d, -0.6, 0.2), 'Adaptive Wide Angle'),
        },
        {
          id: 'lensCorrection',
          label: 'Lens Correction...',
          action: () => applyCanvasFilter((d) => F.lensCorrection(d, 40, 0, 30, 0, 0), 'Lens Correction'),
        },
        { id: 'sep-top', label: '', separator: true },
        // — Blur —
        {
          id: 'blur-group', label: 'Blur', children: [
            { id: 'blur-basic', label: 'Blur', action: () => applyCanvasFilter((d) => F.blur(d), 'Blur') },
            { id: 'blurMore', label: 'Blur More', action: () => applyCanvasFilter((d) => F.blurMore(d), 'Blur More') },
            { id: 'gaussianBlur', label: 'Gaussian Blur...', action: () => applyCanvasFilter((d) => F.gaussianBlur(d, 3), 'Gaussian Blur') },
            { id: 'motionBlur', label: 'Motion Blur...', action: () => applyCanvasFilter((d) => F.motionBlur(d, 0, 10), 'Motion Blur') },
            { id: 'average', label: 'Average', action: () => applyCanvasFilter((d) => F.average(d), 'Average') },
            { id: 'boxBlur', label: 'Box Blur...', action: () => applyCanvasFilter((d) => F.boxBlur(d, 3), 'Box Blur') },
            { id: 'radialBlur', label: 'Radial Blur...', action: () => applyCanvasFilter((d) => F.radialBlur(d, 10), 'Radial Blur') },
            { id: 'surfaceBlur', label: 'Surface Blur...', action: () => applyCanvasFilter((d) => F.surfaceBlur(d, 5, 25), 'Surface Blur') },
            { id: 'lensBlur', label: 'Lens Blur...', action: () => applyCanvasFilter((d) => F.lensBlur(d), 'Lens Blur') },
            { id: 'shapeBlur', label: 'Shape Blur...', action: () => applyCanvasFilter((d) => F.shapeBlur(d), 'Shape Blur') },
            { id: 'smartBlur', label: 'Smart Blur...', action: () => applyCanvasFilter((d) => F.smartBlur(d), 'Smart Blur') },
          ],
        },
        // — Sharpen —
        {
          id: 'sharpen-group', label: 'Sharpen', children: [
            { id: 'sharpen', label: 'Sharpen', action: () => applyCanvasFilter((d) => F.sharpen(d), 'Sharpen') },
            { id: 'sharpenMore', label: 'Sharpen More', action: () => applyCanvasFilter((d) => F.sharpenMore(d), 'Sharpen More') },
            { id: 'sharpenEdges', label: 'Sharpen Edges', action: () => applyCanvasFilter((d) => F.sharpenEdges(d), 'Sharpen Edges') },
            { id: 'smartSharpen', label: 'Smart Sharpen...', action: () => applyCanvasFilter((d) => F.smartSharpen(d, 100, 1), 'Smart Sharpen') },
            { id: 'unsharpMask', label: 'Unsharp Mask...', action: () => applyCanvasFilter((d) => F.unsharpMask(d, 100, 2, 0), 'Unsharp Mask') },
          ],
        },
        // — Distort —
        {
          id: 'distort-group', label: 'Distort', children: [
            { id: 'twirl', label: 'Twirl...', action: () => applyCanvasFilter((d) => F.twirl(d, 45), 'Twirl') },
            { id: 'spherize', label: 'Spherize...', action: () => applyCanvasFilter((d) => F.spherize(d, 50), 'Spherize') },
            { id: 'pinch', label: 'Pinch...', action: () => applyCanvasFilter((d) => F.pinch(d, 50), 'Pinch') },
            { id: 'wave', label: 'Wave...', action: () => applyCanvasFilter((d) => F.wave(d, 10, 120), 'Wave') },
            { id: 'ripple', label: 'Ripple...', action: () => applyCanvasFilter((d) => F.ripple(d, 10, 5), 'Ripple') },
            { id: 'zigZag', label: 'ZigZag...', action: () => applyCanvasFilter((d) => F.zigZag(d, 10, 5), 'ZigZag') },
            { id: 'polarCoordinates', label: 'Polar Coordinates...', action: () => applyCanvasFilter((d) => F.polarCoordinates(d, 'rectangular-to-polar'), 'Polar Coordinates') },
            { id: 'diffuseGlow', label: 'Diffuse Glow...', action: () => applyCanvasFilter((d) => F.diffuseGlow(d), 'Diffuse Glow') },
            { id: 'glass', label: 'Glass...', action: () => applyCanvasFilter((d) => F.glass(d), 'Glass') },
            { id: 'oceanRipple', label: 'Ocean Ripple...', action: () => applyCanvasFilter((d) => F.oceanRipple(d), 'Ocean Ripple') },
            { id: 'displace', label: 'Displace...', action: () => applyCanvasFilter((d) => F.displace(d), 'Displace') },
            { id: 'shear', label: 'Shear...', action: () => applyCanvasFilter((d) => F.shear(d), 'Shear') },
          ],
        },
        // — Noise —
        {
          id: 'noise-group', label: 'Noise', children: [
            { id: 'addNoise', label: 'Add Noise...', action: () => applyCanvasFilter((d) => F.addNoise(d, 25), 'Add Noise') },
            { id: 'reduceNoise', label: 'Reduce Noise...', action: () => applyCanvasFilter((d) => F.reduceNoise(d, 5), 'Reduce Noise') },
            { id: 'despeckle', label: 'Despeckle', action: () => applyCanvasFilter((d) => F.despeckle(d), 'Despeckle') },
            { id: 'dustAndScratches', label: 'Dust & Scratches...', action: () => applyCanvasFilter((d) => F.dustAndScratches(d), 'Dust & Scratches') },
            { id: 'median', label: 'Median...', action: () => applyCanvasFilter((d) => F.median(d), 'Median') },
          ],
        },
        // — Pixelate —
        {
          id: 'pixelate-group', label: 'Pixelate', children: [
            { id: 'crystallize', label: 'Crystallize...', action: () => applyCanvasFilter((d) => F.crystallize(d), 'Crystallize') },
            { id: 'facet', label: 'Facet', action: () => applyCanvasFilter((d) => F.facet(d), 'Facet') },
            { id: 'fragment', label: 'Fragment', action: () => applyCanvasFilter((d) => F.fragment(d), 'Fragment') },
            { id: 'mezzotint', label: 'Mezzotint...', action: () => applyCanvasFilter((d) => F.mezzotint(d), 'Mezzotint') },
            { id: 'pointillize', label: 'Pointillize...', action: () => applyCanvasFilter((d) => F.pointillize(d), 'Pointillize') },
            { id: 'colorHalftone', label: 'Color Halftone...', action: () => applyCanvasFilter((d) => F.colorHalftone(d), 'Color Halftone') },
            { id: 'mosaic', label: 'Mosaic...', action: () => applyCanvasFilter((d) => F.mosaic(d), 'Mosaic') },
            { id: 'pixelate', label: 'Pixelate...', action: () => applyCanvasFilter((d) => F.pixelate(d, 8), 'Pixelate') },
          ],
        },
        // — Render —
        {
          id: 'render-group', label: 'Render', children: [
            { id: 'clouds', label: 'Clouds', action: () => applyCanvasFilter((d) => F.clouds(d), 'Clouds') },
            { id: 'differenceClouds', label: 'Difference Clouds', action: () => applyCanvasFilter((d) => F.differenceClouds(d), 'Difference Clouds') },
            { id: 'fibers', label: 'Fibers...', action: () => applyCanvasFilter((d) => F.fibers(d), 'Fibers') },
            { id: 'lensFlare', label: 'Lens Flare...', action: () => applyCanvasFilter((d) => F.lensFlare(d), 'Lens Flare') },
            { id: 'lightingEffects', label: 'Lighting Effects...', action: () => applyCanvasFilter((d) => F.lightingEffects(d), 'Lighting Effects') },
            { id: 'flame', label: 'Flame...', action: () => applyCanvasFilter((d) => F.flame(d), 'Flame') },
            { id: 'tree', label: 'Tree...', action: () => applyCanvasFilter((d) => F.tree(d), 'Tree') },
          ],
        },
        // — Stylize —
        {
          id: 'stylize-group', label: 'Stylize', children: [
            { id: 'emboss', label: 'Emboss', action: () => applyCanvasFilter((d) => F.emboss(d), 'Emboss') },
            { id: 'solarize', label: 'Solarize...', action: () => applyCanvasFilter((d) => F.solarize(d), 'Solarize') },
            { id: 'findEdges', label: 'Find Edges', action: () => applyCanvasFilter((d) => F.findEdges(d), 'Find Edges') },
            { id: 'traceContour', label: 'Trace Contour...', action: () => applyCanvasFilter((d) => F.traceContour(d), 'Trace Contour') },
            { id: 'diffuse', label: 'Diffuse...', action: () => applyCanvasFilter((d) => F.diffuse(d), 'Diffuse') },
            { id: 'glowingEdges', label: 'Glowing Edges...', action: () => applyCanvasFilter((d) => F.glowingEdges(d), 'Glowing Edges') },
            { id: 'tiles', label: 'Tiles...', action: () => applyCanvasFilter((d) => F.tiles(d), 'Tiles') },
            { id: 'wind', label: 'Wind...', action: () => applyCanvasFilter((d) => F.wind(d), 'Wind') },
            { id: 'extrude', label: 'Extrude...', action: () => applyCanvasFilter((d) => F.extrude(d), 'Extrude') },
            { id: 'oilPaint', label: 'Oil Paint...', action: () => applyCanvasFilter((d) => F.oilPaint(d), 'Oil Paint') },
          ],
        },
        // — Texture —
        {
          id: 'texture-group', label: 'Texture', children: [
            { id: 'grain', label: 'Grain...', action: () => applyCanvasFilter((d) => F.grain(d), 'Grain') },
            { id: 'mosaicTiles', label: 'Mosaic Tiles...', action: () => applyCanvasFilter((d) => F.mosaicTiles(d), 'Mosaic Tiles') },
            { id: 'patchwork', label: 'Patchwork...', action: () => applyCanvasFilter((d) => F.patchwork(d), 'Patchwork') },
            { id: 'stainedGlass', label: 'Stained Glass...', action: () => applyCanvasFilter((d) => F.stainedGlass(d), 'Stained Glass') },
            { id: 'texturizer', label: 'Texturizer...', action: () => applyCanvasFilter((d) => F.texturizer(d), 'Texturizer') },
            { id: 'craquelure', label: 'Craquelure...', action: () => applyCanvasFilter((d) => F.craquelure(d), 'Craquelure') },
          ],
        },
        // — Brush Strokes —
        {
          id: 'brushStrokes-group', label: 'Brush Strokes', children: [
            { id: 'accentedEdges', label: 'Accented Edges...', action: () => applyCanvasFilter((d) => F.accentedEdges(d), 'Accented Edges') },
            { id: 'angledStrokes', label: 'Angled Strokes...', action: () => applyCanvasFilter((d) => F.angledStrokes(d), 'Angled Strokes') },
            { id: 'crosshatch', label: 'Crosshatch...', action: () => applyCanvasFilter((d) => F.crosshatch(d), 'Crosshatch') },
            { id: 'darkStrokes', label: 'Dark Strokes...', action: () => applyCanvasFilter((d) => F.darkStrokes(d), 'Dark Strokes') },
            { id: 'inkOutlines', label: 'Ink Outlines...', action: () => applyCanvasFilter((d) => F.inkOutlines(d), 'Ink Outlines') },
            { id: 'spatter', label: 'Spatter...', action: () => applyCanvasFilter((d) => F.spatter(d), 'Spatter') },
            { id: 'sprayedStrokes', label: 'Sprayed Strokes...', action: () => applyCanvasFilter((d) => F.sprayedStrokes(d), 'Sprayed Strokes') },
            { id: 'sumie', label: 'Sumi-e...', action: () => applyCanvasFilter((d) => F.sumie(d), 'Sumi-e') },
          ],
        },
        { id: 'sep-other', label: '', separator: true },
        // — Other —
        {
          id: 'other-group', label: 'Other', children: [
            { id: 'highPass', label: 'High Pass...', action: () => applyCanvasFilter((d) => F.highPass(d, 5), 'High Pass') },
            { id: 'maximum', label: 'Maximum...', action: () => applyCanvasFilter((d) => F.maximumFilter(d), 'Maximum') },
            { id: 'minimum', label: 'Minimum...', action: () => applyCanvasFilter((d) => F.minimumFilter(d), 'Minimum') },
            { id: 'offset', label: 'Offset...', action: () => applyCanvasFilter((d) => F.offsetFilter(d), 'Offset') },
            { id: 'customFilter', label: 'Custom...', action: () => applyCanvasFilter((d) => F.customFilter(d, [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]), 'Custom Filter') },
            { id: 'pictureFrame', label: 'Picture Frame...', action: () => applyCanvasFilter((d) => F.pictureFrame(d), 'Picture Frame') },
          ],
        },
        { id: 'sep-ops', label: '', separator: true },
        // — Image Operations —
        { id: 'calculations', label: 'Calculations...', action: () => applyCanvasFilter((d) => F.calculations(d, 'gray', null), 'Calculations') },
        { id: 'applyImage', label: 'Apply Image...', action: () => applyCanvasFilter((d) => F.applyImage(d, d), 'Apply Image') },
        { id: 'perspectiveWarp', label: 'Perspective Warp...', action: () => applyCanvasFilter((d) => F.perspectiveWarp(d, { tl: { x: 0, y: 0 }, tr: { x: d.width, y: 0 }, bl: { x: 0, y: d.height }, br: { x: d.width, y: d.height } }), 'Perspective Warp') },
        { id: 'contentAwareScale', label: 'Content-Aware Scale...', action: () => applyCanvasFilter((d) => F.contentAwareScale(d, d.width, d.height), 'Content-Aware Scale') },
        { id: 'sep-auto', label: '', separator: true },
        // — Artistic —
        {
          id: 'artistic-group', label: 'Artistic', children: [
            { id: 'coloredPencil', label: 'Colored Pencil...', action: () => applyCanvasFilter((d) => F.coloredPencil(d), 'Colored Pencil') },
            { id: 'cutout', label: 'Cutout...', action: () => applyCanvasFilter((d) => F.cutout(d), 'Cutout') },
            { id: 'dryBrush', label: 'Dry Brush...', action: () => applyCanvasFilter((d) => F.dryBrush(d), 'Dry Brush') },
            { id: 'filmGrain', label: 'Film Grain...', action: () => applyCanvasFilter((d) => F.filmGrain(d), 'Film Grain') },
            { id: 'fresco', label: 'Fresco...', action: () => applyCanvasFilter((d) => F.fresco(d), 'Fresco') },
            { id: 'neonGlow', label: 'Neon Glow...', action: () => applyCanvasFilter((d) => F.neonGlow(d), 'Neon Glow') },
            { id: 'paintDaubs', label: 'Paint Daubs...', action: () => applyCanvasFilter((d) => F.paintDaubs(d), 'Paint Daubs') },
            { id: 'paletteKnife', label: 'Palette Knife...', action: () => applyCanvasFilter((d) => F.paletteKnife(d), 'Palette Knife') },
            { id: 'plasticWrap', label: 'Plastic Wrap...', action: () => applyCanvasFilter((d) => F.plasticWrap(d), 'Plastic Wrap') },
            { id: 'posterEdges', label: 'Poster Edges...', action: () => applyCanvasFilter((d) => F.posterEdges(d), 'Poster Edges') },
            { id: 'roughPastels', label: 'Rough Pastels...', action: () => applyCanvasFilter((d) => F.roughPastels(d), 'Rough Pastels') },
            { id: 'smudgeStick', label: 'Smudge Stick...', action: () => applyCanvasFilter((d) => F.smudgeStick(d), 'Smudge Stick') },
            { id: 'sponge', label: 'Sponge...', action: () => applyCanvasFilter((d) => F.sponge(d), 'Sponge') },
            { id: 'underpainting', label: 'Underpainting...', action: () => applyCanvasFilter((d) => F.underpainting(d), 'Underpainting') },
            { id: 'watercolor', label: 'Watercolor...', action: () => applyCanvasFilter((d) => F.watercolor(d), 'Watercolor') },
          ],
        },
        // — Sketch —
        {
          id: 'sketch-group', label: 'Sketch', children: [
            { id: 'basRelief', label: 'Bas Relief...', action: () => applyCanvasFilter((d) => F.basRelief(d), 'Bas Relief') },
            { id: 'chalkAndCharcoal', label: 'Chalk & Charcoal...', action: () => applyCanvasFilter((d) => F.chalkAndCharcoal(d), 'Chalk & Charcoal') },
            { id: 'charcoal', label: 'Charcoal...', action: () => applyCanvasFilter((d) => F.charcoal(d), 'Charcoal') },
            { id: 'chrome', label: 'Chrome...', action: () => applyCanvasFilter((d) => F.chrome(d), 'Chrome') },
            { id: 'conteCrayon', label: 'Conté Crayon...', action: () => applyCanvasFilter((d) => F.conteCrayon(d), 'Conté Crayon') },
            { id: 'graphicPen', label: 'Graphic Pen...', action: () => applyCanvasFilter((d) => F.graphicPen(d), 'Graphic Pen') },
            { id: 'halftonePattern', label: 'Halftone Pattern...', action: () => applyCanvasFilter((d) => F.halftonePattern(d), 'Halftone Pattern') },
            { id: 'notePaper', label: 'Note Paper...', action: () => applyCanvasFilter((d) => F.notePaper(d), 'Note Paper') },
            { id: 'photocopy', label: 'Photocopy...', action: () => applyCanvasFilter((d) => F.photocopy(d), 'Photocopy') },
            { id: 'plaster', label: 'Plaster...', action: () => applyCanvasFilter((d) => F.plaster(d), 'Plaster') },
            { id: 'reticulation', label: 'Reticulation...', action: () => applyCanvasFilter((d) => F.reticulation(d), 'Reticulation') },
            { id: 'stamp', label: 'Stamp...', action: () => applyCanvasFilter((d) => F.stamp(d), 'Stamp') },
            { id: 'tornEdges', label: 'Torn Edges...', action: () => applyCanvasFilter((d) => F.tornEdges(d), 'Torn Edges') },
            { id: 'waterPaper', label: 'Water Paper...', action: () => applyCanvasFilter((d) => F.waterPaper(d), 'Water Paper') },
          ],
        },
        // — Basic Adjustments —
        {
          id: 'basicAdj-group', label: 'Adjustments', children: [
            { id: 'invert', label: 'Invert', action: () => applyCanvasFilter((d) => F.invert(d), 'Invert') },
            { id: 'grayscale', label: 'Grayscale', action: () => applyCanvasFilter((d) => F.grayscale(d), 'Grayscale') },
            { id: 'sepia', label: 'Sepia', action: () => applyCanvasFilter((d) => F.sepia(d), 'Sepia') },
            { id: 'posterize', label: 'Posterize...', action: () => applyCanvasFilter((d) => F.posterize(d, 4), 'Posterize') },
            { id: 'edgeDetect', label: 'Edge Detect', action: () => applyCanvasFilter((d) => F.edgeDetect(d), 'Edge Detect') },
            { id: 'vignette', label: 'Vignette...', action: () => applyCanvasFilter((d) => F.vignette(d, 50, 80), 'Vignette') },
          ],
        },
        { id: 'sep-tools', label: '', separator: true },
        { id: 'newGuideLayout', label: 'New Guide Layout...', action: () => setCropOverlay?.('rule-of-thirds') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'zoomIn', label: 'Zoom In', shortcut: `${mod}++`, action: zoomIn },
        { id: 'zoomOut', label: 'Zoom Out', shortcut: `${mod}+-`, action: zoomOut },
        { id: 'zoomFit', label: 'Zoom to Fit', action: zoomToFit },
        { id: 'zoom100', label: 'Zoom 100%', action: zoomTo100 },
        { id: 'sep1', label: '', separator: true },
        { id: 'grid', label: `${showGrid ? '✓ ' : ''}Show Grid`, action: toggleGrid },
        { id: 'rulers', label: `${showRulers ? '✓ ' : ''}Show Rulers`, action: toggleRulers },
        { id: 'guides', label: `${showGuides ? '✓ ' : ''}Show Guides`, action: toggleGuides },
        { id: 'snap', label: `${snapToGrid ? '✓ ' : ''}Snap to Grid`, action: toggleSnapToGrid },
        { id: 'sep-crop', label: '', separator: true },
        { id: 'cropOverlayNone', label: 'Crop Overlay: None', action: () => setCropOverlay('none') },
        { id: 'cropOverlayThirds', label: 'Crop Overlay: Rule of Thirds', action: () => setCropOverlay('rule-of-thirds') },
        { id: 'cropOverlayGrid', label: 'Crop Overlay: Grid', action: () => setCropOverlay('grid') },
        { id: 'cropOverlayGolden', label: 'Crop Overlay: Golden Ratio', action: () => setCropOverlay('golden-ratio') },
        { id: 'sep2', label: '', separator: true },
        { id: 'proofColors', label: `${colorProofing ? '✓ ' : ''}Proof Colors`, shortcut: `${mod}+Y`, action: toggleColorProofing },
        { id: 'gamutWarning', label: `${gamutWarning ? '✓ ' : ''}Gamut Warning`, shortcut: `${mod}+Shift+Y`, action: toggleGamutWarning },
        { id: 'sep3', label: '', separator: true },
        ...BUILTIN_PROFILES.filter(p => p.colorSpace === 'CMYK').map(p => ({
          id: `profile-${p.name}`,
          label: `${colorProfile === p.name ? '● ' : '○ '}${p.name}`,
          action: () => setColorProfile(p.name),
        })),
      ],
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        { id: 'layers', label: `${showLayersPanel ? '✓ ' : ''}Layers`, shortcut: 'F7', action: toggleLayersPanel },
        { id: 'history', label: `${showHistoryPanel ? '✓ ' : ''}History`, action: toggleHistoryPanel },
        { id: 'info', label: `${showImageInfoPanel ? '✓ ' : ''}Image Info`, shortcut: 'F8', action: toggleImageInfoPanel },
      ],
    },
  ];

  return (
    <div
      ref={menuBarRef}
      className="flex items-center h-full select-none"
    >
      {menus.map((menu) => (
        <MenuDropdown
          key={menu.id}
          menu={menu}
          isOpen={openMenuId === menu.id}
          onOpen={() => setOpenMenuId(openMenuId === menu.id ? null : menu.id)}
          onClose={closeMenu}
          onHover={() => setOpenMenuId(menu.id)}
          anyMenuOpen={openMenuId !== null}
        />
      ))}
    </div>
  );
});

export default EditorMenuBar;
