import { memo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';
import { ExtensionType, ExtensionCategory } from '@/shared/api/extension.types';

const TYPES: { value: ExtensionType; labelKey: string }[] = [
  { value: 'ai_tool', labelKey: 'categories.ai_tools' },
  { value: 'workflow_template', labelKey: 'categories.workflows' },
  { value: 'integration', labelKey: 'categories.integrations' },
];

const CATEGORIES: { value: ExtensionCategory; label: string }[] = [
  { value: 'image_processing', label: 'Image Processing' },
  { value: 'video_effects', label: 'Video Effects' },
  { value: 'style_transfer', label: 'Style Transfer' },
  { value: 'filters', label: 'Filters' },
  { value: 'automation', label: 'Automation' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'social', label: 'Social' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'communication', label: 'Communication' },
  { value: 'data', label: 'Data' },
  { value: 'developer_tools', label: 'Developer Tools' },
];

export const ExtensionSubmitModal = memo(function ExtensionSubmitModal() {
  const { isSubmitModalOpen, closeSubmitModal, submitExtension, openGuide } = useExtensionStore();
  const { t } = useTranslation('extensions');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [type, setType] = useState<ExtensionType>('ai_tool');
  const [category, setCategory] = useState<ExtensionCategory>('image_processing');
  const [icon, setIcon] = useState('');
  const [tags, setTags] = useState('');
  const [price, setPrice] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setShortDescription('');
    setType('ai_tool');
    setCategory('image_processing');
    setIcon('');
    setTags('');
    setPrice(0);
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !description.trim()) return;
    setIsSubmitting(true);
    try {
      const success = await submitExtension({
        name: name.trim(),
        description: description.trim(),
        shortDescription: shortDescription.trim() || undefined,
        type,
        category,
        icon: icon.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        price,
      });
      if (success) {
        resetForm();
        closeSubmitModal();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSubmitModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800 rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('submit.title')}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{t('submit.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { closeSubmitModal(); openGuide(); }}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg transition-colors"
            >
              {t('guide.viewGuide')}
            </button>
            <button
              onClick={closeSubmitModal}
              className="p-1.5 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('submit.name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('submit.namePlaceholder')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Short Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('submit.shortDescription')}
            </label>
            <input
              type="text"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder={t('submit.shortDescriptionPlaceholder')}
              maxLength={500}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('submit.description')} *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('submit.descriptionPlaceholder')}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Type & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t('submit.type')}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ExtensionType)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                {TYPES.map((t_item) => (
                  <option key={t_item.value} value={t_item.value}>
                    {t(t_item.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t('submit.category')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExtensionCategory)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Icon & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t('submit.icon')}
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🧩"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                {t('submit.price')}
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
                min={0}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t('submit.tags')}
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('submit.tagsPlaceholder')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 px-6 py-4 bg-zinc-900 border-t border-zinc-800 rounded-b-2xl">
          <button
            onClick={closeSubmitModal}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {t('submit.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !description.trim() || isSubmitting}
            className="px-4 py-2 text-sm font-medium bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? t('submit.submitting') : t('submit.submit')}
          </button>
        </div>
      </div>
    </div>
  );
});
