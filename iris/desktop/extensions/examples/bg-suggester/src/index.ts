/**
 * AI Background Suggester
 * Detect image subjects and suggest matching background prompts by category.
 */

interface BackgroundSuggestion {
  prompt: string;
  category: string;
  style: string;
}

const CATEGORY_HINTS: Record<string, string> = {
  nature:
    'Natural environments: forests, mountains, oceans, fields, sunsets, meadows.',
  studio:
    'Professional studio setups: solid backdrops, gradient lighting, product photography.',
  abstract:
    'Abstract patterns: geometric shapes, bokeh, particles, waves, gradients.',
  urban:
    'Urban cityscapes: streets, architecture, neon lights, rooftops, cafes.',
  gradient:
    'Smooth color gradients: pastel tones, duotones, warm/cool transitions.',
};

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.bg-suggester.suggest', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const category =
        ((await iris.storage.get('category')) as string) || 'all';

      const categoryInstructions =
        category === 'all'
          ? 'Suggest backgrounds across all categories: nature, studio, abstract, urban, gradient.'
          : `Focus on this category: ${category}. ${CATEGORY_HINTS[category] || ''}`;

      const prompt = [
        'Analyze the main subject in this image.',
        'Suggest 6 background prompts that would complement the subject well.',
        categoryInstructions,
        'For each suggestion, provide a detailed prompt suitable for AI image generation.',
        'Return as JSON array: [{ "prompt": "...", "category": "...", "style": "..." }]',
      ].join('\n');

      await iris.window.showMessage('Analyzing image and generating suggestions...', 'info');

      try {
        const result = await iris.ai.executeModel('openai', {
          model: 'gpt-4o',
          prompt,
          image: image.data,
        });

        const suggestions: BackgroundSuggestion[] =
          typeof result === 'string' ? JSON.parse(result) : (result as BackgroundSuggestion[]);

        const categoryColors: Record<string, string> = {
          nature: '#22c55e',
          studio: '#6b7280',
          abstract: '#a855f7',
          urban: '#f59e0b',
          gradient: '#ec4899',
        };

        const cards = suggestions
          .map(
            (s) => `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="padding:2px 8px;background:${categoryColors[s.category] || '#6b7280'}20;color:${categoryColors[s.category] || '#6b7280'};border-radius:12px;font-size:11px;font-weight:600;text-transform:capitalize">${s.category}</span>
                <span style="font-size:12px;color:#9ca3af">${s.style}</span>
              </div>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#374151">${s.prompt}</p>
              <button onclick="navigator.clipboard.writeText(\`${s.prompt.replace(/`/g, '\\`')}\`);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Prompt',1000);"
                style="margin-top:8px;padding:4px 12px;border:1px solid #d1d5db;background:white;border-radius:16px;cursor:pointer;font-size:12px">
                Copy Prompt
              </button>
            </div>
          `
          )
          .join('');

        const html = `
          <div style="padding:16px;font-family:system-ui;max-width:500px">
            <h2 style="margin:0 0 4px">Background Suggestions</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 16px">
              ${suggestions.length} prompts generated for your subject
            </p>
            ${cards}
          </div>
        `;

        await iris.window.createPanel(html, {
          title: 'Background Suggestions',
          location: 'floating',
        });
      } catch (err) {
        iris.log.error('Background suggestion failed', err);
        await iris.window.showMessage('Failed to generate suggestions.', 'error');
      }
    })
  );

  iris.log.info('AI Background Suggester activated');
}

export function deactivate() {}
