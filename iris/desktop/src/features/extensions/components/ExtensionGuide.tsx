import { memo } from 'react';
import { X, BookOpen, Puzzle, Workflow, Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';

export const ExtensionGuide = memo(function ExtensionGuide() {
  const { isGuideOpen, closeGuide } = useExtensionStore();
  const { t } = useTranslation('extensions');

  if (!isGuideOpen) return null;

  const sections = [
    {
      icon: BookOpen,
      titleKey: 'guide.overview.title',
      contentKey: 'guide.overview.content',
    },
    {
      icon: Puzzle,
      titleKey: 'guide.aiTool.title',
      contentKey: 'guide.aiTool.content',
    },
    {
      icon: Workflow,
      titleKey: 'guide.workflow.title',
      contentKey: 'guide.workflow.content',
    },
    {
      icon: Plug,
      titleKey: 'guide.integration.title',
      contentKey: 'guide.integration.content',
    },
    {
      icon: BookOpen,
      titleKey: 'guide.steps.title',
      contentKey: 'guide.steps.content',
    },
    {
      icon: BookOpen,
      titleKey: 'guide.policy.title',
      contentKey: 'guide.policy.content',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800 rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">{t('guide.title')}</h2>
          </div>
          <button
            onClick={closeGuide}
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {sections.map((section, idx) => {
            const Icon = section.icon;
            return (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-white">
                    {t(section.titleKey)}
                  </h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed pl-6 whitespace-pre-line">
                  {t(section.contentKey)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end px-6 py-4 bg-zinc-900 border-t border-zinc-800 rounded-b-2xl">
          <button
            onClick={closeGuide}
            className="px-4 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            {t('guide.close')}
          </button>
        </div>
      </div>
    </div>
  );
});
