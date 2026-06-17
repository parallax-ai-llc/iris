/**
 * Auto Tagger
 * Automatically generate descriptive tags for images using AI analysis.
 */

interface TagResult {
  tags: string[];
  timestamp: string;
  fileName?: string;
}

export function activate(context: IrisExtensionContext) {
  const HISTORY_KEY = 'tagHistory';

  context.subscriptions.push(
    iris.commands.register('iris-official.auto-tagger.tag', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      await iris.window.showMessage('Analyzing image...', 'info');

      try {
        const result = await iris.ai.executeModel('openai', {
          model: 'gpt-4o',
          prompt: [
            'Analyze this image and generate 10-15 descriptive tags.',
            'Tags should cover: subject, colors, mood, style, composition, objects, setting.',
            'Return as JSON: { "tags": ["tag1", "tag2", ...] }',
          ].join('\n'),
          image: image.data,
        });

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        const tags: string[] = parsed.tags || [];

        // Save to history
        const history = ((await iris.storage.get(HISTORY_KEY)) as TagResult[]) || [];
        history.unshift({
          tags,
          timestamp: new Date().toISOString(),
        });
        if (history.length > 50) history.length = 50;
        await iris.storage.set(HISTORY_KEY, history);

        // Display tags
        const tagChips = tags
          .map(
            (tag) =>
              `<span onclick="navigator.clipboard.writeText('${tag}');this.style.background='#22c55e';this.style.color='white';setTimeout(()=>{this.style.background='#f3f4f6';this.style.color='#374151'},600)"
                style="display:inline-block;padding:4px 12px;background:#f3f4f6;border-radius:16px;font-size:13px;margin:3px;cursor:pointer;color:#374151;transition:all 0.2s">${tag}</span>`
          )
          .join('');

        const allTagsStr = tags.join(', ');

        const html = `
          <div style="padding:16px;font-family:system-ui;max-width:400px">
            <h2 style="margin:0 0 4px">Auto Tags</h2>
            <p style="color:#6b7280;font-size:14px;margin:0 0 12px">${tags.length} tags generated</p>
            <div style="margin-bottom:12px">${tagChips}</div>
            <button onclick="navigator.clipboard.writeText('${allTagsStr}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy All Tags',1000)"
              style="padding:8px 16px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer;font-size:13px">
              Copy All Tags
            </button>
            <p style="font-size:11px;color:#9ca3af;margin-top:8px">Click individual tags to copy.</p>
          </div>
        `;

        await iris.window.createPanel(html, { title: 'Auto Tags', location: 'floating' });
      } catch (err) {
        iris.log.error('Auto tagging failed', err);
        await iris.window.showMessage('Failed to generate tags.', 'error');
      }
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.auto-tagger.history', async () => {
      const history = ((await iris.storage.get(HISTORY_KEY)) as TagResult[]) || [];

      if (history.length === 0) {
        await iris.window.showMessage('No tag history yet.', 'info');
        return;
      }

      const rows = history
        .slice(0, 20)
        .map(
          (entry, i) => `
          <div style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;font-weight:600">#${i + 1}</span>
              <span style="font-size:11px;color:#9ca3af">${new Date(entry.timestamp).toLocaleString()}</span>
            </div>
            <div style="font-size:12px;color:#374151">${entry.tags.join(', ')}</div>
          </div>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Tag History (${history.length})</h2>
          ${rows}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Tag History', location: 'floating' });
    })
  );

  iris.log.info('Auto Tagger activated');
}

export function deactivate() {}
