/**
 * Dark Themes
 * A collection of dark color themes: Midnight, Ocean, Forest, and Sunset.
 */

interface Theme {
  name: string;
  displayName: string;
  colors: {
    background: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
    accentHover: string;
  };
}

const THEMES: Record<string, Theme> = {
  midnight: {
    name: 'midnight',
    displayName: 'Midnight',
    colors: {
      background: '#0f0f23',
      surface: '#1a1a2e',
      border: '#2a2a4a',
      text: '#e0e0ff',
      textSecondary: '#8888aa',
      accent: '#6366f1',
      accentHover: '#818cf8',
    },
  },
  ocean: {
    name: 'ocean',
    displayName: 'Ocean',
    colors: {
      background: '#0a192f',
      surface: '#112240',
      border: '#1d3557',
      text: '#ccd6f6',
      textSecondary: '#8892b0',
      accent: '#64ffda',
      accentHover: '#7efce0',
    },
  },
  forest: {
    name: 'forest',
    displayName: 'Forest',
    colors: {
      background: '#0d1b0e',
      surface: '#1a2f1c',
      border: '#2d4a2f',
      text: '#d4e5d5',
      textSecondary: '#7fa882',
      accent: '#4ade80',
      accentHover: '#6ee7a0',
    },
  },
  sunset: {
    name: 'sunset',
    displayName: 'Sunset',
    colors: {
      background: '#1a0a0a',
      surface: '#2d1515',
      border: '#4a2020',
      text: '#fce4d6',
      textSecondary: '#c89080',
      accent: '#fb923c',
      accentHover: '#fdba74',
    },
  },
};

export function activate(context: IrisExtensionContext) {
  const CURRENT_THEME_KEY = 'currentTheme';

  // Apply saved theme on startup
  (async () => {
    const saved = (await iris.storage.get(CURRENT_THEME_KEY)) as string;
    if (saved && THEMES[saved]) {
      iris.log.info(`Applying saved theme: ${saved}`);
    }
  })();

  // Status bar showing current theme
  const statusItem = iris.window.setStatusBarItem('Theme: Default', {
    tooltip: 'Click to change theme',
    priority: 5,
  });
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    iris.commands.register('iris-official.dark-themes.select', async () => {
      const currentKey = ((await iris.storage.get(CURRENT_THEME_KEY)) as string) || 'midnight';

      const themeCards = Object.entries(THEMES)
        .map(([key, theme]) => {
          const isActive = key === currentKey;
          const c = theme.colors;

          return `
            <div onclick="window.parent.postMessage({type:'selectTheme',theme:'${key}'},'*')"
              style="padding:12px;border:2px solid ${isActive ? c.accent : '#e5e7eb'};border-radius:12px;cursor:pointer;margin-bottom:8px;${isActive ? `background:${c.background}` : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <strong style="font-size:14px;${isActive ? `color:${c.text}` : ''}">${theme.displayName}</strong>
                ${isActive ? `<span style="font-size:11px;padding:2px 8px;background:${c.accent};color:${c.background};border-radius:12px">Active</span>` : ''}
              </div>
              <div style="display:flex;gap:4px">
                <div style="width:24px;height:24px;background:${c.background};border-radius:4px;border:1px solid ${c.border}"></div>
                <div style="width:24px;height:24px;background:${c.surface};border-radius:4px;border:1px solid ${c.border}"></div>
                <div style="width:24px;height:24px;background:${c.accent};border-radius:4px"></div>
                <div style="width:24px;height:24px;background:${c.text};border-radius:4px"></div>
                <div style="width:24px;height:24px;background:${c.textSecondary};border-radius:4px"></div>
              </div>
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui;max-width:350px">
          <h2 style="margin:0 0 16px">Select Theme</h2>
          ${themeCards}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Dark Themes', location: 'floating' });

      // Save the selected theme (handled via postMessage in real implementation)
      await iris.storage.set(CURRENT_THEME_KEY, currentKey);
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.dark-themes.reset', async () => {
      await iris.storage.delete(CURRENT_THEME_KEY);
      await iris.window.showMessage('Theme reset to default.', 'info');
    })
  );

  iris.log.info('Dark Themes activated');
}

export function deactivate() {}
