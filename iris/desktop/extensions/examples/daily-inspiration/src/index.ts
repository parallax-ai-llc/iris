/**
 * Daily Inspiration
 * Get daily creative inspiration with color palettes, prompt ideas, art styles, and composition tips.
 */

interface Inspiration {
  id: number;
  type: 'palette' | 'prompt' | 'style' | 'composition';
  title: string;
  content: string;
  colors?: string[];
}

const INSPIRATIONS: Inspiration[] = [
  // Palettes
  { id: 1, type: 'palette', title: 'Warm Sunset', content: 'A warm, inviting palette inspired by golden hour sunsets.', colors: ['#FF6B35', '#F7931E', '#FFD166', '#EF476F', '#073B4C'] },
  { id: 2, type: 'palette', title: 'Ocean Depths', content: 'Deep blues and aquamarines evoking the mystery of the ocean.', colors: ['#03045E', '#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8'] },
  { id: 3, type: 'palette', title: 'Forest Morning', content: 'Fresh greens and earth tones of a misty forest morning.', colors: ['#2D6A4F', '#40916C', '#52B788', '#95D5B2', '#D8F3DC'] },
  { id: 4, type: 'palette', title: 'Neon Night', content: 'Electric neons against dark backdrops for cyberpunk vibes.', colors: ['#0D0221', '#0A0A2E', '#FF00FF', '#00FFFF', '#FF6EC7'] },
  { id: 5, type: 'palette', title: 'Pastel Dream', content: 'Soft pastels for a gentle, dreamy aesthetic.', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF'] },

  // Prompts
  { id: 6, type: 'prompt', title: 'Ethereal Portrait', content: 'A portrait with soft backlighting, lens flare, shallow depth of field, dreamy atmosphere, natural light streaming through windows.' },
  { id: 7, type: 'prompt', title: 'Dystopian Cityscape', content: 'A sprawling mega-city at twilight, neon signs reflecting in rain-slicked streets, towering holographic advertisements, misty atmosphere.' },
  { id: 8, type: 'prompt', title: 'Macro Nature', content: 'Extreme close-up of morning dew on a spider web, bokeh background of a lush garden, golden hour sunlight, crystal-clear water droplets.' },
  { id: 9, type: 'prompt', title: 'Vintage Still Life', content: 'An arrangement of antique objects on a wooden table: old books, brass compass, dried flowers, warm candlelight, oil painting style.' },
  { id: 10, type: 'prompt', title: 'Surreal Landscape', content: 'A floating island above clouds with waterfalls cascading into the void, bioluminescent plants, two moons in a twilight sky.' },

  // Art Styles
  { id: 11, type: 'style', title: 'Ukiyo-e', content: 'Japanese woodblock print style: bold outlines, flat colors, stylized waves, and nature scenes. Inspired by Hokusai and Hiroshige.' },
  { id: 12, type: 'style', title: 'Art Deco', content: 'Geometric patterns, metallic colors (gold, silver, copper), symmetrical designs, bold lines, and luxurious feel of the 1920s.' },
  { id: 13, type: 'style', title: 'Impressionism', content: 'Visible brushstrokes, emphasis on light and color, everyday scenes, outdoor settings, soft edges. Inspired by Monet and Renoir.' },
  { id: 14, type: 'style', title: 'Bauhaus', content: 'Primary colors, geometric shapes, functional design, sans-serif typography, asymmetric layouts, clean and modern.' },
  { id: 15, type: 'style', title: 'Vaporwave', content: 'Retro 80s/90s aesthetics, glitch effects, neon pink/cyan gradients, Greek statues, palm trees, VHS artifacts.' },

  // Composition Tips
  { id: 16, type: 'composition', title: 'Leading Lines', content: 'Use roads, fences, rivers, or architectural elements to guide the viewer\'s eye toward your main subject. Diagonal lines create dynamic energy.' },
  { id: 17, type: 'composition', title: 'Negative Space', content: 'Leave large empty areas around your subject to create breathing room and draw attention. Works especially well with minimalist subjects.' },
  { id: 18, type: 'composition', title: 'Frame Within Frame', content: 'Use doorways, windows, arches, or tree branches to create a natural frame around your subject, adding depth and context.' },
  { id: 19, type: 'composition', title: 'Symmetry & Patterns', content: 'Look for reflections in water, architectural symmetry, or repeating patterns. Break the symmetry with one element for added interest.' },
  { id: 20, type: 'composition', title: 'Color Contrast', content: 'Place complementary colors next to each other (blue/orange, red/green). A small area of contrasting color against a large area draws attention.' },
];

export function activate(context: IrisExtensionContext) {
  const FAVORITES_KEY = 'favorites';

  function getDailyInspiration(): Inspiration {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    return INSPIRATIONS[dayOfYear % INSPIRATIONS.length];
  }

  function buildInspirationHtml(item: Inspiration, showFavButton = true): string {
    const typeColors: Record<string, string> = {
      palette: '#3b82f6',
      prompt: '#8b5cf6',
      style: '#f59e0b',
      composition: '#22c55e',
    };
    const color = typeColors[item.type] || '#6b7280';

    const colorSwatches = item.colors
      ? `<div style="display:flex;gap:4px;margin-top:8px">
          ${item.colors.map((c) => `<div style="width:40px;height:40px;background:${c};border-radius:8px;border:1px solid rgba(0,0,0,0.1)"></div>`).join('')}
        </div>`
      : '';

    const favBtn = showFavButton
      ? `<button onclick="window.parent.postMessage({type:'toggleFav',id:${item.id}},'*');this.textContent=this.textContent==='★ Favorited'?'☆ Favorite':'★ Favorited'"
          style="margin-top:8px;padding:4px 12px;border:1px solid #d1d5db;background:white;border-radius:16px;cursor:pointer;font-size:12px">
          ☆ Favorite
        </button>`
      : '';

    return `
      <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="padding:2px 8px;background:${color}20;color:${color};border-radius:12px;font-size:11px;font-weight:600;text-transform:capitalize">${item.type}</span>
          <strong style="font-size:15px">${item.title}</strong>
        </div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#374151">${item.content}</p>
        ${colorSwatches}
        ${favBtn}
      </div>
    `;
  }

  context.subscriptions.push(
    iris.commands.register('iris-official.daily-inspiration.show', async () => {
      const daily = getDailyInspiration();

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:450px">
          <h2 style="margin:0 0 4px">Daily Inspiration</h2>
          <p style="color:#6b7280;font-size:13px;margin:0 0 16px">${new Date().toLocaleDateString()}</p>
          ${buildInspirationHtml(daily)}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Daily Inspiration', location: 'floating' });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.daily-inspiration.random', async () => {
      const random = INSPIRATIONS[Math.floor(Math.random() * INSPIRATIONS.length)];

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:450px">
          <h2 style="margin:0 0 16px">Random Inspiration</h2>
          ${buildInspirationHtml(random)}
          <button onclick="window.parent.postMessage({type:'refresh'},'*')"
            style="padding:8px 16px;border:1px solid #d1d5db;background:white;border-radius:20px;cursor:pointer;font-size:13px">
            Shuffle
          </button>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Random Inspiration', location: 'floating' });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.daily-inspiration.favorites', async () => {
      const favIds = ((await iris.storage.get(FAVORITES_KEY)) as number[]) || [];
      const favorites = INSPIRATIONS.filter((i) => favIds.includes(i.id));

      if (favorites.length === 0) {
        await iris.window.showMessage('No favorites yet. Star inspirations to save them.', 'info');
        return;
      }

      const cards = favorites.map((f) => buildInspirationHtml(f, false)).join('');
      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:450px">
          <h2 style="margin:0 0 16px">Favorites (${favorites.length})</h2>
          ${cards}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Favorite Inspirations', location: 'floating' });
    })
  );

  iris.log.info('Daily Inspiration activated');
}

export function deactivate() {}
