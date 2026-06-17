/**
 * Font Preview Panel
 * Browse and preview system fonts for text overlay with favorites and category filtering.
 */

const FONT_CATEGORIES: Record<string, string[]> = {
  'Sans-Serif': [
    'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
    'Gill Sans', 'Segoe UI', 'Roboto', 'Open Sans', 'Lato',
    'Inter', 'SF Pro Display', 'Noto Sans',
  ],
  Serif: [
    'Times New Roman', 'Georgia', 'Garamond', 'Palatino', 'Book Antiqua',
    'Baskerville', 'Cambria', 'Didot', 'Noto Serif',
  ],
  Monospace: [
    'Courier New', 'Consolas', 'Monaco', 'Menlo', 'SF Mono',
    'JetBrains Mono', 'Fira Code', 'Source Code Pro',
  ],
  Display: [
    'Impact', 'Comic Sans MS', 'Copperplate', 'Papyrus',
    'Brush Script MT', 'Luminari', 'Chalkduster',
  ],
  CJK: [
    'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC',
    'Malgun Gothic', 'MS Gothic', 'PingFang SC',
    'Apple SD Gothic Neo', 'Hiragino Sans',
  ],
};

export function activate(context: IrisExtensionContext) {
  const FAVORITES_KEY = 'favoriteFonts';

  context.subscriptions.push(
    iris.commands.register('iris-official.font-preview.open', async () => {
      const sampleText =
        ((await iris.storage.get('sampleText')) as string) ||
        'The quick brown fox jumps over the lazy dog';
      const fontSize =
        ((await iris.storage.get('fontSize')) as number) || 24;
      const favorites =
        ((await iris.storage.get(FAVORITES_KEY)) as string[]) || [];

      // Build favorites section
      const favSection =
        favorites.length > 0
          ? `
          <div style="margin-bottom:20px">
            <h3 style="margin:0 0 8px;font-size:14px;color:#f59e0b">Favorites (${favorites.length})</h3>
            ${favorites
              .map(
                (font) => `
              <div style="padding:8px;border:1px solid #fef3c7;border-radius:6px;margin-bottom:4px;cursor:pointer"
                onclick="navigator.clipboard.writeText('${font}');this.style.borderColor='#22c55e';setTimeout(()=>this.style.borderColor='#fef3c7',800);">
                <div style="font-family:'${font}',sans-serif;font-size:${fontSize}px;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${sampleText}</div>
                <div style="font-size:11px;color:#6b7280;margin-top:2px">${font}</div>
              </div>
            `
              )
              .join('')}
          </div>
        `
          : '';

      // Build category sections
      const categorySections = Object.entries(FONT_CATEGORIES)
        .map(([category, fonts]) => {
          const fontCards = fonts
            .map(
              (font) => `
              <div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
                <div style="flex:1;cursor:pointer"
                  onclick="navigator.clipboard.writeText('${font}');this.parentElement.style.borderColor='#22c55e';setTimeout(()=>this.parentElement.style.borderColor='#e5e7eb',800);">
                  <div style="font-family:'${font}',sans-serif;font-size:${fontSize}px;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${sampleText}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px">${font}</div>
                </div>
                <button onclick="window.parent.postMessage({type:'toggleFav',font:'${font}'},'*');this.textContent=this.textContent==='☆'?'★':'☆';"
                  style="background:none;border:none;font-size:18px;cursor:pointer;padding:4px;color:#f59e0b">
                  ${favorites.includes(font) ? '★' : '☆'}
                </button>
              </div>
            `
            )
            .join('');

          return `
            <div style="margin-bottom:20px">
              <h3 style="margin:0 0 8px;font-size:14px;color:#374151">${category}</h3>
              ${fontCards}
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Font Preview</h2>

          <input type="text" id="fontSearch" placeholder="Search fonts..."
            style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:12px;font-size:14px;box-sizing:border-box"
            oninput="
              const q = this.value.toLowerCase();
              document.querySelectorAll('[data-font-card]').forEach(card => {
                card.style.display = card.dataset.fontName.toLowerCase().includes(q) ? '' : 'none';
              });
            ">

          <div style="margin-bottom:12px">
            <label style="font-size:13px;color:#6b7280">
              Preview size:
              <input type="range" min="12" max="48" value="${fontSize}"
                style="vertical-align:middle;width:100px"
                oninput="document.querySelectorAll('[data-preview]').forEach(el => el.style.fontSize=this.value+'px')">
            </label>
          </div>

          ${favSection}
          ${categorySections}

          <div style="padding:8px;background:#f9fafb;border-radius:8px;font-size:11px;color:#9ca3af;margin-top:8px">
            Click any font to copy its name. Star to add to favorites.
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Font Preview',
        location: 'sidebar',
      });
    })
  );

  iris.log.info('Font Preview Panel activated');
}

export function deactivate() {}
