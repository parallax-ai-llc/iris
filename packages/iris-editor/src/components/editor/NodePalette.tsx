'use client';

import { useState, useCallback, useEffect } from 'react';
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
  onAddNode: (nodeType: string, nodeData: Record<string, unknown>) => void;
}

function PaletteNode({ node, localizedLabel, isMobile, inUse, onAddNode }: PaletteNodeProps) {
  const c = categoryPalette[node.category];
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

  const handleClick = useCallback(() => {
    if (isMobile) {
      onAddNode(node.type, getNodeData());
    }
  }, [isMobile, node.type, getNodeData, onAddNode]);

  return (
    <div
      draggable={!isMobile}
      onDragStart={!isMobile ? handleDragStart : undefined}
      onClick={handleClick}
      className="we-lib-item flex items-center"
      style={{
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.72)',
        cursor: isMobile ? 'pointer' : 'grab',
        position: 'relative',
        transition: 'background 0.12s, color 0.12s',
      }}
      title={node.description}
    >
      {/* grip / plus */}
      <span
        style={{
          color: 'rgba(255,255,255,0.22)',
          fontSize: 10,
          letterSpacing: -1,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {isMobile ? <Plus size={11} /> : '⠿'}
      </span>

      {/* icon block */}
      <span
        className="inline-flex items-center justify-center flex-shrink-0"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          color: c.text,
          background: c.soft,
          border: `1px solid ${c.stroke}33`,
        }}
      >
        {Icon && <Icon size={12} />}
      </span>

      {/* label */}
      <span
        className="flex-1 truncate"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {localizedLabel}
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
            color: c.text,
            background: c.soft,
            border: `1px solid ${c.stroke}33`,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          IN USE
        </span>
      )}
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
  onAddNode: (nodeType: string, nodeData: Record<string, unknown>) => void;
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
  onAddNode,
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
    <div style={{ margin: '8px 0' }}>
      <button
        onClick={onToggle}
        className="uppercase w-full flex items-center"
        style={{
          gap: 8,
          padding: '8px 10px',
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.5)',
          background: 'transparent',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: c.stroke,
            boxShadow: `0 0 0 2px ${c.soft}`,
            flexShrink: 0,
          }}
        />
        <span>{categoryLabel}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 10.5,
            color: 'rgba(255,255,255,0.34)',
            fontWeight: 400,
          }}
        >
          {nodes.length}
        </span>
        <span
          style={{
            color: 'rgba(255,255,255,0.34)',
            fontSize: 10,
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          ›
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col" style={{ paddingLeft: 4, gap: 1 }}>
          {filteredNodes.map((node) => (
            <PaletteNode
              key={node.type}
              node={node}
              localizedLabel={getNodeLabel(node.type)}
              isMobile={isMobile}
              inUse={usedTypes.has(node.type)}
              onAddNode={onAddNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NodePaletteProps {
  onNodeAdded?: () => void;
}

export function NodePalette({ onNodeAdded }: NodePaletteProps = {}) {
  const { t } = useI18n();
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
        borderRight: '1px solid var(--color-iris-line-2)',
        background: 'linear-gradient(180deg, #0d0e15, #0a0b11)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 14px 10px' }}>
        <div
          className="uppercase"
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 10,
          }}
        >
          {t('iris.nodePalette.title') || 'Node Library'}
        </div>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.34)',
            }}
          >
            <Search size={13} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              t('iris.nodePalette.searchPlaceholder') || `Search ${totalNodes}+ nodes…`
            }
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px 0 34px',
              background: 'var(--color-iris-surf-1)',
              border: '1px solid var(--color-iris-line-2)',
              borderRadius: 10,
              fontSize: 12.5,
              color: 'var(--color-iris-text-1)',
              outline: 'none',
            }}
          />
          <kbd
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.34)',
              padding: '1px 6px',
              border: '1px solid var(--color-iris-line-2)',
              borderRadius: 4,
            }}
          >
            /
          </kbd>
        </div>
      </div>

      {/* Categories */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '4px 8px 18px' }}
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
            onAddNode={handleAddNode}
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
            color: 'rgba(255,255,255,0.34)',
            margin: 0,
          }}
        >
          {isMobile
            ? t('iris.nodePalette.tapHint')
            : t('iris.nodePalette.dragHint')}
        </p>
      </div>
    </aside>
  );
}
