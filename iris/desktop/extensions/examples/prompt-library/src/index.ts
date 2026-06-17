/**
 * Prompt Library
 * Save, organize, and quickly insert your favorite AI prompts.
 */

interface SavedPrompt {
  id: number;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

const CATEGORIES = ['image-gen', 'video-gen', 'editing', 'style'];

const BUILTIN_PROMPTS: SavedPrompt[] = [
  { id: 1, title: 'Cinematic Portrait', content: 'A cinematic portrait with dramatic lighting, shallow depth of field, film grain, warm color grading, 85mm lens, golden hour backlight', category: 'image-gen', createdAt: '2024-01-01' },
  { id: 2, title: 'Product Photo', content: 'Professional product photography on a clean white background, soft studio lighting, subtle shadows, high-key, commercial quality, 4K resolution', category: 'image-gen', createdAt: '2024-01-01' },
  { id: 3, title: 'Enhance Details', content: 'Enhance fine details, sharpen textures, improve clarity while maintaining natural look, reduce noise, preserve skin tones', category: 'editing', createdAt: '2024-01-01' },
  { id: 4, title: 'Smooth Transition', content: 'Create a smooth zoom transition from wide shot to close-up, 3 seconds duration, ease-in-out timing, cinematic camera movement', category: 'video-gen', createdAt: '2024-01-01' },
  { id: 5, title: 'Anime Style', content: 'In the style of anime, cel-shaded, vibrant colors, detailed eyes, clean lineart, Studio Ghibli-inspired backgrounds, soft pastel sky', category: 'style', createdAt: '2024-01-01' },
];

export function activate(context: IrisExtensionContext) {
  const PROMPTS_KEY = 'savedPrompts';
  let nextId = 100;

  async function getPrompts(): Promise<SavedPrompt[]> {
    const saved = ((await iris.storage.get(PROMPTS_KEY)) as SavedPrompt[]) || [];
    return [...BUILTIN_PROMPTS, ...saved];
  }

  context.subscriptions.push(
    iris.commands.register('iris-official.prompt-library.open', async () => {
      const prompts = await getPrompts();

      const categoryTabs = CATEGORIES
        .map(
          (cat) => `
          <button onclick="
            document.querySelectorAll('[data-category]').forEach(el => {
              el.style.display = el.dataset.category === '${cat}' || '${cat}' === 'all' ? '' : 'none';
            });
            document.querySelectorAll('.tab-btn').forEach(b => b.style.background = '#f3f4f6');
            this.style.background = '#0a0a0a'; this.style.color = 'white';
          " class="tab-btn"
            style="padding:4px 12px;border:none;background:#f3f4f6;border-radius:16px;cursor:pointer;font-size:12px;text-transform:capitalize">
            ${cat.replace('-', ' ')}
          </button>
        `
        )
        .join('');

      const promptCards = prompts
        .map(
          (p) => `
          <div data-category="${p.category}" style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong style="font-size:13px">${p.title}</strong>
              <span style="font-size:10px;padding:2px 6px;background:#f3f4f6;border-radius:4px;text-transform:capitalize">${p.category.replace('-', ' ')}</span>
            </div>
            <p style="margin:0;font-size:12px;color:#374151;line-height:1.5">${p.content}</p>
            <button onclick="navigator.clipboard.writeText(\`${p.content.replace(/`/g, '\\`')}\`);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',800)"
              style="margin-top:6px;padding:2px 10px;border:1px solid #d1d5db;background:white;border-radius:12px;cursor:pointer;font-size:11px">
              Copy
            </button>
          </div>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Prompt Library</h2>

          <input type="text" placeholder="Search prompts..."
            style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:8px;font-size:13px;box-sizing:border-box"
            oninput="
              const q = this.value.toLowerCase();
              document.querySelectorAll('[data-category]').forEach(el => {
                el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
              });
            ">

          <div style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap">
            ${categoryTabs}
          </div>

          ${promptCards}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Prompt Library', location: 'sidebar' });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.prompt-library.add', async () => {
      const title = await iris.window.showInputBox({
        prompt: 'Prompt title',
        placeholder: 'e.g. My Custom Style',
      });
      if (!title) return;

      const content = await iris.window.showInputBox({
        prompt: 'Prompt content',
        placeholder: 'Enter the full prompt text...',
      });
      if (!content) return;

      const category = await iris.window.showInputBox({
        prompt: 'Category (image-gen, video-gen, editing, style)',
        value: 'image-gen',
      });

      const saved = ((await iris.storage.get(PROMPTS_KEY)) as SavedPrompt[]) || [];
      saved.push({
        id: nextId++,
        title,
        content,
        category: category || 'image-gen',
        createdAt: new Date().toISOString(),
      });

      await iris.storage.set(PROMPTS_KEY, saved);
      await iris.window.showMessage(`Prompt "${title}" saved.`, 'info');
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.prompt-library.search', async () => {
      const query = await iris.window.showInputBox({
        prompt: 'Search prompts',
        placeholder: 'Enter search term...',
      });
      if (!query) return;

      const prompts = await getPrompts();
      const q = query.toLowerCase();
      const matches = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q)
      );

      if (matches.length === 0) {
        await iris.window.showMessage(`No prompts found for "${query}".`, 'info');
        return;
      }

      // Copy first match to clipboard
      await iris.clipboard.write(matches[0].content);
      await iris.window.showMessage(
        `Found ${matches.length} match(es). "${matches[0].title}" copied to clipboard.`,
        'info'
      );
    })
  );

  iris.log.info('Prompt Library activated');
}

export function deactivate() {}
