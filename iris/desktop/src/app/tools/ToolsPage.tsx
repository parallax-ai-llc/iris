import { memo, useState, useMemo } from 'react';
import { Search, Video, Image, ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ALL_TOOLS, type IrisTool } from '@/config/tools';
import { useUIStore } from '@/shared/stores/ui.store';
import { PresetCreatorModal } from '@/features/tools/components/PresetCreatorModal';

type FilterTab = 'all' | 'video' | 'image';

function Badge({ type }: { type: 'new' | 'pro' | 'popular' }) {
  const styles = {
    new: 'bg-gradient-to-r from-slate-300 to-white text-neutral-900',
    pro: 'bg-gradient-to-r from-purple-400 to-pink-400 text-white',
    popular: 'bg-gradient-to-r from-slate-400 to-slate-200 text-neutral-900',
  };
  const labels = { new: 'NEW', pro: 'PRO', popular: 'POPULAR' };

  return (
    <span className={cn('px-2 py-0.5 text-[10px] font-bold rounded', styles[type])}>
      {labels[type]}
    </span>
  );
}

const ToolCard = memo(function ToolCard({
  tool,
  onClick,
}: {
  tool: IrisTool;
  onClick: () => void;
}) {
  const [mediaError, setMediaError] = useState(false);
  const isVideo = tool.thumbnailUrl.endsWith('.mp4');

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 cursor-pointer group text-left"
    >
      <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-zinc-800 mb-3 ring-1 ring-white/10 group-hover:ring-white/30 transition-all">
        {!mediaError ? (
          isVideo ? (
            <video
              src={tool.thumbnailUrl}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              autoPlay
              muted
              loop
              playsInline
              onError={() => setMediaError(true)}
            />
          ) : (
            <img
              src={tool.thumbnailUrl}
              alt={tool.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setMediaError(true)}
            />
          )
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-700" />
        )}
        {tool.badge && (
          <div className="absolute top-3 left-3">
            <Badge type={tool.badge} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-white font-medium">{tool.title}</span>
        <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white transition-colors" />
      </div>
      <p className="text-zinc-500 text-sm line-clamp-2">{tool.description}</p>
    </button>
  );
});

export const ToolsPage = memo(function ToolsPage() {
  const { setCurrentPage, setPendingToolMode } = useUIStore();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPresetMode, setSelectedPresetMode] = useState<string | null>(null);

  const filteredTools = useMemo(() => {
    return ALL_TOOLS.filter((tool) => {
      const matchesFilter = activeFilter === 'all' || tool.category === activeFilter;
      const matchesSearch =
        searchQuery === '' ||
        tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery]);

  const videoTools = useMemo(
    () => filteredTools.filter((t) => t.category === 'video'),
    [filteredTools]
  );
  const imageTools = useMemo(
    () => filteredTools.filter((t) => t.category === 'image'),
    [filteredTools]
  );

  const handleToolClick = (tool: IrisTool) => {
    // Preset tools: open preset creator modal directly
    if (tool.toolType === 'preset' && tool.mode) {
      setSelectedPresetMode(tool.mode);
      return;
    }

    if (tool.category === 'video') {
      if (tool.requiresAsset && tool.mode) {
        // Video tools needing an asset: set pending mode, go to videos
        setPendingToolMode(tool);
      }
      setCurrentPage('videos');
    } else {
      // Image AI tools: set pending mode, go to images
      if (tool.mode) {
        setPendingToolMode(tool);
      }
      setCurrentPage('images');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">All Tools</h1>
          <p className="text-zinc-400">
            Explore all AI-powered tools for image and video creation
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'video', 'image'] as FilterTab[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  'px-4 py-2.5 rounded-xl text-sm font-medium transition-all capitalize',
                  activeFilter === filter
                    ? 'bg-gradient-to-r from-slate-300 to-white text-neutral-900'
                    : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 border border-zinc-700'
                )}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Video' : 'Image'}
              </button>
            ))}
          </div>
        </div>

        {activeFilter === 'all' ? (
          <>
            {videoTools.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <Video size={20} className="text-zinc-500" />
                  <h2 className="text-lg font-semibold text-white">Video Tools</h2>
                  <span className="text-zinc-500 text-sm">({videoTools.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {videoTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onClick={() => handleToolClick(tool)}
                    />
                  ))}
                </div>
              </section>
            )}

            {imageTools.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <Image size={20} className="text-zinc-500" />
                  <h2 className="text-lg font-semibold text-white">Image Tools</h2>
                  <span className="text-zinc-500 text-sm">({imageTools.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {imageTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onClick={() => handleToolClick(tool)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onClick={() => handleToolClick(tool)}
              />
            ))}
          </div>
        )}

        {filteredTools.length === 0 && (
          <div className="text-center py-16">
            <Search size={48} className="mx-auto text-zinc-700 mb-4" />
            <p className="text-zinc-500">No tools found matching your search</p>
          </div>
        )}
      </div>

      {/* Preset Creator Modal */}
      {selectedPresetMode && (
        <PresetCreatorModal
          isOpen={!!selectedPresetMode}
          onClose={() => setSelectedPresetMode(null)}
          presetMode={selectedPresetMode}
        />
      )}
    </div>
  );
});

export default ToolsPage;
