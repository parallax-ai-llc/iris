'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@editor/lib/convert/string';
import {
  getNodeCategories,
  NodeDefinition,
  NodeCategory,
  getNodeDefaultSettings,
} from '../../constants/node-definitions';
import { Plus, Search } from 'lucide-react';
import { useI18n } from '@editor/hooks/usei18n';
import { useIrisEditorStore } from '@editor/store/iris-editor';
import { categoryPalette } from './nodes/nodeColors';

interface PaletteNodeProps {
  node: NodeDefinition;
  localizedLabel: string;
  isMobile: boolean;
  inUse: boolean;
  clickToAdd: boolean;
  onAddNode: (nodeType: string, nodeData: Record<string, unknown>) => void;
  onAdded?: () => void;
}

function PaletteNode({ node, localizedLabel, isMobile, inUse, clickToAdd, onAddNode, onAdded }: PaletteNodeProps) {
  const Icon = node.icon;

  const getNodeData = useCallback(() => {
    const defaultSettings = getNodeDefaultSettings(node.type);
    return {
      type: node.type,
      label: localizedLabel,
      category: node.category,
      config: { settings: defaultSettings },
    };
  }, [node, localizedLabel]);

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      const nodeData = getNodeData();
      event.dataTransfer.setData('application/reactflow/nodeType', node.type);
      event.dataTransfer.setData('application/reactflow/nodeData', JSON.stringify(nodeData));
      event.dataTransfer.effectAllowed = 'move';
    },
    [node.type, getNodeData],
  );

  // Mobile adds directly; desktop also adds on click (at the middle of the
  // view, see WorkflowCanvas) besides drag-and-drop.
  const handleClick = useCallback(() => {
    if (isMobile || !clickToAdd) {
      if (isMobile) onAddNode(node.type, getNodeData());
      return;
    }
    window.dispatchEvent(
      new CustomEvent('iris-node-add-request', { detail: { nodeType: node.type, nodeData: getNodeData() } }),
    );
    onAdded?.();
  }, [isMobile, clickToAdd, node.type, getNodeData, onAddNode, onAdded]);

  return (
    <div
      draggable={!isMobile}
      onDragStart={!isMobile ? handleDragStart : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role={clickToAdd || isMobile ? 'button' : undefined}
      tabIndex={clickToAdd || isMobile ? 0 : undefined}
      className="we-lib-item flex items-center"
      style={{
        gap: 11,
        padding: '7px 8px',
        borderRadius: 10,
        fontSize: 12.5,
        color: 'var(--color-iris-text-1)',
        cursor: isMobile || clickToAdd ? 'pointer' : 'grab',
        position: 'relative',
        transition: 'background 0.12s, color 0.12s',
      }}
      title={node.description}
    >
      {/* icon tile */}
      <span
        className="inline-flex items-center justify-center flex-shrink-0"
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          color: 'var(--color-iris-text-2)',
          background: 'var(--color-iris-surf-2)',
          border: '1px solid var(--color-iris-line-2)',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--color-iris-fg, #fff) 5%, transparent)',
        }}
      >
        {Icon && <Icon size={14} />}
      </span>

      {/* label + description */}
      <span className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
        <span
          className="truncate"
          style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {localizedLabel}
        </span>
        <span
          className="truncate"
          style={{ fontSize: 11, color: 'var(--color-iris-text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {node.description}
        </span>
      </span>

      {/* IN USE pill */}
      {inUse && (
        <span
          title="In use"
          style={{
            fontSize: 9.5,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            padding: '1px 6px',
            borderRadius: 999,
            color: 'var(--color-iris-text-3)',
            background: 'var(--color-iris-surf-2)',
            border: '1px solid var(--color-iris-line-2)',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          IN USE
        </span>
      )}
      {isMobile && <Plus size={12} style={{ color: 'var(--color-iris-text-4)', flexShrink: 0 }} />}
    </div>
  );
}

interface PaletteCategoryProps {
  category: NodeCategory;
  nodes: NodeDefinition[];
  isOpen: boolean;
  onToggle: () => void;
  searchQuery: string;
  categoryLabel: string;
  getNodeLabel: (nodeType: string) => string;
  isMobile: boolean;
  usedTypes: Set<string>;
  clickToAdd: boolean;
  onAddNode: (nodeType: string, nodeData: Record<string, unknown>) => void;
  onAdded?: () => void;
}

function PaletteCategory({
  category,
  nodes,
  isOpen,
  onToggle,
  searchQuery,
  categoryLabel,
  getNodeLabel,
  isMobile,
  usedTypes,
  clickToAdd,
  onAddNode,
  onAdded,
}: PaletteCategoryProps) {
  const c = categoryPalette[category];

  const filteredNodes = searchQuery
    ? nodes.filter((node) => {
        const localizedLabel = getNodeLabel(node.type);
        return (
          localizedLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : nodes;

  if (searchQuery && filteredNodes.length === 0) return null;

  return (
    <div style={{ margin: '6px 0' }}>
      <button
        onClick={onToggle}
        className="uppercase w-full flex items-center"
        aria-expanded={isOpen}
        style={{
          gap: 8,
          padding: '8px 8px 6px',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.14em',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          color: 'var(--color-iris-text-4)',
          background: 'transparent',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: c.stroke,
            flexShrink: 0,
          }}
        />
        <span>{categoryLabel}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 10.5,
            color: 'var(--color-iris-text-4)',
            fontWeight: 400,
          }}
        >
          {nodes.length}
        </span>
        <span
          style={{
            color: 'var(--color-iris-text-4)',
            fontSize: 10,
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          ›
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col" style={{ gap: 1 }}>
          {filteredNodes.map((node) => (
            <PaletteNode
              key={node.type}
              node={node}
              localizedLabel={getNodeLabel(node.type)}
              isMobile={isMobile}
              inUse={usedTypes.has(node.type)}
              clickToAdd={clickToAdd}
              onAddNode={onAddNode}
              onAdded={onAdded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

interface NodePaletteProps {
  onNodeAdded?: () => void;
  /**
   * 'floating': a "Create anything" menu card (iris/web) — no side border, and
   * clicking an item adds it to the middle of the canvas. 'sidebar' (default)
   * keeps the docked drag-only list other hosts lay out themselves.
   */
  variant?: 'sidebar' | 'floating';
  /** Focus the search field when the palette opens. */
  autoFocus?: boolean;
}

export function NodePalette({ onNodeAdded, variant = 'sidebar', autoFocus = false }: NodePaletteProps = {}) {
  const { t } = useI18n();
  const floating = variant === 'floating';
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<NodeCategory>>(
    new Set(['TRIGGER', 'GENERATOR']),
  );
  const [isMobile, setIsMobile] = useState(false);

  const { addNode, nodes } = useIrisEditorStore();
  const categories = getNodeCategories();

  // Track which node types are currently in use in the workflow
  const usedTypes = new Set(nodes.map((n) => n.data?.type as string).filter(Boolean));

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleCategory = useCallback((category: NodeCategory) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const handleAddNode = useCallback(
    (nodeType: string, nodeData: Record<string, unknown>) => {
      const position = { x: 200, y: 200 };
      addNode(nodeType, position, nodeData);
      onNodeAdded?.();
    },
    [addNode, onNodeAdded],
  );

  const effectiveOpenCategories = searchQuery
    ? new Set(categories.map((c) => c.category))
    : openCategories;

  const getCategoryLabel = (category: NodeCategory): string =>
    t(`iris.nodePalette.categories.${category}`);

  const getNodeLabel = useCallback(
    (nodeType: string): string => {
      const translated = t(`iris.nodePalette.nodes.${nodeType}`);
      if (translated) return translated;
      const nodeDef = categories.flatMap((c) => c.nodes).find((n) => n.type === nodeType);
      return nodeDef?.label || nodeType;
    },
    [t, categories],
  );

  const totalNodes = categories.reduce((sum, c) => sum + c.nodes.length, 0);

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        borderRight: floating ? undefined : '1px solid var(--color-iris-line-2)',
        background: floating
          ? 'transparent'
          : 'linear-gradient(180deg, var(--color-iris-panel-top, #0d0e15), var(--color-iris-panel-bottom, #0a0b11))',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Header: search */}
      <div style={{ padding: floating ? '10px 10px 4px' : '14px 14px 10px' }}>
        {!floating && (
          <div
            className="uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.16em',
              color: 'var(--color-iris-text-4)',
              marginBottom: 10,
            }}
          >
            {t('iris.nodePalette.title') || 'Node Library'}
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 13,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-iris-text-4)',
              display: 'inline-flex',
            }}
          >
            <Search size={15} />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              t('iris.nodePalette.searchPlaceholder') || `Search ${totalNodes}+ nodes…`
            }
            aria-label={t('iris.nodePalette.title') || 'Node Library'}
            style={{
              width: '100%',
              height: floating ? 42 : 34,
              padding: '0 44px 0 38px',
              background: 'var(--color-iris-surf-2)',
              border: '1px solid var(--color-iris-line-2)',
              borderRadius: 11,
              fontSize: floating ? 13.5 : 12.5,
              color: 'var(--color-iris-text-1)',
              outline: 'none',
            }}
          />
          {!isMobile && (
          <kbd
            className="we-kbd"
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {floating ? (isMacPlatform() ? '⌘ K' : 'Ctrl K') : '/'}
          </kbd>
          )}
        </div>
      </div>

      {/* Categories */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: floating ? '2px 6px 10px' : '4px 8px 18px' }}
      >
        {categories.map(({ category, nodes }) => (
          <PaletteCategory
            key={category}
            category={category}
            nodes={nodes}
            isOpen={effectiveOpenCategories.has(category)}
            onToggle={() => toggleCategory(category)}
            searchQuery={searchQuery}
            categoryLabel={getCategoryLabel(category)}
            getNodeLabel={getNodeLabel}
            isMobile={isMobile}
            usedTypes={usedTypes}
            clickToAdd={floating}
            onAddNode={handleAddNode}
            onAdded={onNodeAdded}
          />
        ))}
      </div>

      {/* Help text */}
      <div
        className="text-center"
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--color-iris-line-1)',
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-iris-text-4)',
            margin: 0,
          }}
        >
          {isMobile
            ? t('iris.nodePalette.tapHint')
            : floating
            ? t('iris.nodePalette.clickOrDragHint') || 'Click to add, or drag onto the canvas'
            : t('iris.nodePalette.dragHint')}
        </p>
      </div>
    </aside>
  );
}
