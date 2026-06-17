/**
 * Style Transfer Presets
 * Quick-apply art style presets to your prompts — Ghibli, Cyberpunk, Watercolor, and more.
 */

interface StylePreset {
  key: string;
  name: string;
  prompt: string;
  tags: string[];
  preview: string; // emoji/icon
}

const BUILTIN_PRESETS: StylePreset[] = [
  {
    key: 'ghibli',
    name: 'Studio Ghibli',
    prompt: 'In the style of Studio Ghibli, hand-painted backgrounds, soft pastel colors, detailed nature scenes, whimsical atmosphere, warm lighting, cel-shaded characters',
    tags: ['anime', 'warm', 'nature'],
    preview: '🏔️',
  },
  {
    key: 'cyberpunk',
    name: 'Cyberpunk',
    prompt: 'Cyberpunk aesthetic, neon-lit cityscape, rain-soaked streets, holographic displays, dark atmosphere with vibrant neon accents in cyan and magenta, futuristic technology',
    tags: ['sci-fi', 'neon', 'dark'],
    preview: '🌃',
  },
  {
    key: 'watercolor',
    name: 'Watercolor',
    prompt: 'Watercolor painting style, soft color bleeds, visible paper texture, delicate washes, wet-on-wet technique, organic edges, translucent layers',
    tags: ['traditional', 'soft', 'artistic'],
    preview: '🎨',
  },
  {
    key: 'oil-painting',
    name: 'Oil Painting',
    prompt: 'Classical oil painting, rich impasto brushstrokes, deep saturated colors, chiaroscuro lighting, canvas texture, reminiscent of old masters',
    tags: ['traditional', 'classic', 'rich'],
    preview: '🖼️',
  },
  {
    key: 'pixel-art',
    name: 'Pixel Art',
    prompt: '16-bit pixel art style, limited color palette, crisp pixel edges, retro game aesthetic, dithering effects, nostalgic 90s feel',
    tags: ['retro', 'digital', 'game'],
    preview: '👾',
  },
  {
    key: 'minimalist',
    name: 'Minimalist',
    prompt: 'Minimalist design, clean lines, limited color palette, generous white space, geometric shapes, flat design, modern typography',
    tags: ['clean', 'modern', 'simple'],
    preview: '◻️',
  },
  {
    key: 'art-nouveau',
    name: 'Art Nouveau',
    prompt: 'Art Nouveau style, flowing organic lines, floral motifs, decorative borders, muted earth tones with gold accents, Alphonse Mucha inspired',
    tags: ['decorative', 'vintage', 'organic'],
    preview: '🌸',
  },
  {
    key: 'pop-art',
    name: 'Pop Art',
    prompt: 'Andy Warhol pop art style, bold primary colors, Ben-Day dots, high contrast, comic book aesthetics, repetitive patterns, bold outlines',
    tags: ['bold', 'colorful', 'graphic'],
    preview: '🎭',
  },
  {
    key: 'ukiyo-e',
    name: 'Ukiyo-e',
    prompt: 'Japanese ukiyo-e woodblock print, bold outlines, flat color areas, waves and nature themes, traditional Japanese composition, Hokusai inspired',
    tags: ['japanese', 'traditional', 'nature'],
    preview: '🌊',
  },
  {
    key: 'noir',
    name: 'Film Noir',
    prompt: 'Film noir style, high contrast black and white, dramatic shadows, venetian blind lighting, smoky atmosphere, 1940s detective aesthetic',
    tags: ['dark', 'dramatic', 'vintage'],
    preview: '🎬',
  },
];

export function activate(context: IrisExtensionContext) {
  const CUSTOM_KEY = 'customPresets';

  context.subscriptions.push(
    iris.commands.register('iris-official.style-presets.select', async () => {
      const customPresets = ((await iris.storage.get(CUSTOM_KEY)) as StylePreset[]) || [];
      const allPresets = [...BUILTIN_PRESETS, ...customPresets];

      const favStr = ((await iris.storage.get('favorites')) as string) || 'ghibli,cyberpunk';
      const favKeys = favStr.split(',').map((s) => s.trim());

      // Favorites first, then rest
      const sorted = [
        ...allPresets.filter((p) => favKeys.includes(p.key)),
        ...allPresets.filter((p) => !favKeys.includes(p.key)),
      ];

      const cards = sorted
        .map((preset) => {
          const isFav = favKeys.includes(preset.key);
          return `
            <div style="padding:10px;border:1px solid ${isFav ? '#fbbf24' : '#e5e7eb'};border-radius:8px;margin-bottom:6px;${isFav ? 'background:#fffbeb' : ''}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:20px">${preset.preview}</span>
                <strong style="font-size:13px;flex:1">${preset.name}</strong>
                ${isFav ? '<span style="font-size:11px;color:#f59e0b">★</span>' : ''}
              </div>
              <p style="margin:0;font-size:12px;color:#374151;line-height:1.5;max-height:40px;overflow:hidden">${preset.prompt}</p>
              <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                ${preset.tags.map((t) => `<span style="padding:1px 6px;background:#f3f4f6;border-radius:4px;font-size:10px;color:#6b7280">${t}</span>`).join('')}
              </div>
              <button onclick="navigator.clipboard.writeText(\`${preset.prompt.replace(/`/g, '\\`')}\`);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Prompt',800)"
                style="margin-top:6px;padding:3px 10px;border:1px solid #d1d5db;background:white;border-radius:12px;cursor:pointer;font-size:11px">
                Copy Prompt
              </button>
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:420px">
          <h2 style="margin:0 0 12px">Style Presets</h2>
          <input type="text" placeholder="Search styles..."
            style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:12px;font-size:13px;box-sizing:border-box"
            oninput="
              const q = this.value.toLowerCase();
              this.parentElement.querySelectorAll('[style*=border-radius\\:8px]').forEach(el => {
                if (el === this.parentElement.firstElementChild) return;
                el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
              });
            ">
          ${cards}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Style Presets', location: 'sidebar' });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.style-presets.custom', async () => {
      const name = await iris.window.showInputBox({
        prompt: 'Preset name',
        placeholder: 'e.g. My Custom Style',
      });
      if (!name) return;

      const prompt = await iris.window.showInputBox({
        prompt: 'Style prompt text',
        placeholder: 'Describe the visual style...',
      });
      if (!prompt) return;

      const tagsInput = await iris.window.showInputBox({
        prompt: 'Tags (comma-separated)',
        value: 'custom',
        placeholder: 'e.g. dark, moody, cinematic',
      });

      const key = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const tags = (tagsInput || 'custom').split(',').map((t) => t.trim());

      const customPresets = ((await iris.storage.get(CUSTOM_KEY)) as StylePreset[]) || [];
      customPresets.push({ key, name, prompt, tags, preview: '✨' });
      await iris.storage.set(CUSTOM_KEY, customPresets);

      await iris.window.showMessage(`Style preset "${name}" saved.`, 'info');
    })
  );

  iris.log.info('Style Transfer Presets activated');
}

export function deactivate() {}
