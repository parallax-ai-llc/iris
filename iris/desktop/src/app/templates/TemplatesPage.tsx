import { memo, useState, useMemo } from 'react';
import { Search, Workflow, ArrowRight, Loader2 } from 'lucide-react';
import {
  PRESET_TEMPLATES,
  getCategoryIcon,
  type WorkflowTemplate,
} from '@/config/templates';
import { useUIStore } from '@/shared/stores/ui.store';
import { useRequiresServer } from '@/shared/hooks/useRequiresServer';
import { ServerRequiredOverlay } from '@/shared/components/common/ServerRequiredOverlay';

const categories = [
  { id: 'all', name: 'All' },
  { id: 'image', name: 'Image' },
  { id: 'video', name: 'Video' },
  { id: 'content', name: 'Content' },
  { id: 'automation', name: 'Automation' },
];

const TemplateCard = memo(function TemplateCard({
  template,
  isCreating,
  onUse,
}: {
  template: WorkflowTemplate;
  isCreating: boolean;
  onUse: () => void;
}) {
  return (
    <div className="dt-tpl">
      <div className="dt-tpl-head">
        <div className="dt-tpl-icon">{getCategoryIcon(template.category)}</div>
        <div className="flex-1 min-w-0">
          <div className="dt-tpl-title truncate">{template.name}</div>
          <div className="dt-tpl-cat">{template.category}</div>
        </div>
      </div>
      <div className="dt-tpl-desc">{template.description || 'No description'}</div>
      <div className="dt-tpl-meta">
        <span>{template.nodeCount || 0} NODES</span>
        {template.usageCount ? (
          <span>{template.usageCount.toLocaleString()} USES</span>
        ) : (
          <span>{template.tags?.length || 0} TAGS</span>
        )}
      </div>
      <button onClick={onUse} disabled={isCreating} className="dt-tpl-cta">
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating…
          </>
        ) : (
          <>
            Use template
            <ArrowRight size={14} />
          </>
        )}
      </button>
    </div>
  );
});

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="iris-card flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
      <Workflow size={48} className="mb-4" style={{ color: 'var(--text-4)' }} />
      <h2 className="t-display" style={{ fontSize: 24, marginBottom: 6 }}>No templates found</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
        {searchQuery ? 'Try adjusting your search or filters' : 'No workflow templates available'}
      </p>
    </div>
  );
}

function TemplatesPageContent() {
  const { setCurrentPage } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    return PRESET_TEMPLATES.filter((template) => {
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === '' ||
        template.name.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query) ||
        template.tags?.some((tag) => tag.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    setCreatingTemplateId(template.id);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setCurrentPage('workflows');
    setCreatingTemplateId(null);
  };

  return (
    <div className="dt-page-wide">
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Workflows</div>
          <h1 className="dt-page-title">
            Workflow <em>templates</em>
          </h1>
          <p className="dt-page-sub">
            Start your workflow with pre-built templates for common use cases.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative" style={{ width: 320, maxWidth: '100%' }}>
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-4)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            className="iris-input"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div className="dt-seg">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className="dt-seg-item"
              data-active={selectedCategory === category.id}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <EmptyState searchQuery={searchQuery} />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}
        >
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isCreating={creatingTemplateId === template.id}
              onUse={() => handleUseTemplate(template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const TemplatesPage = memo(function TemplatesPage() {
  const { isServerConnected } = useRequiresServer();
  if (!isServerConnected) return <ServerRequiredOverlay pageName="Templates" />;
  return <TemplatesPageContent />;
});

export default TemplatesPage;
