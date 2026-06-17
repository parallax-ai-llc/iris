/**
 * AI Image Captioner
 * Generate social media captions, alt text, and SEO descriptions from images using AI.
 */

const TONE_PROMPTS: Record<string, string> = {
  casual: 'Write in a casual, friendly tone suitable for social media.',
  professional: 'Write in a professional, polished tone suitable for business use.',
  humorous: 'Write in a witty, humorous tone that entertains the reader.',
  poetic: 'Write in a poetic, evocative tone with vivid imagery.',
};

interface CaptionResult {
  caption: string;
  altText: string;
  seoDescription: string;
  hashtags: string[];
}

export function activate(context: IrisExtensionContext) {
  const HISTORY_KEY = 'captionHistory';

  context.subscriptions.push(
    iris.commands.register('iris-official.ai-captioner.generate', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const tone = (await iris.storage.get('tone')) || 'casual';
      const language = (await iris.storage.get('language')) || 'en';
      const includeHashtags = (await iris.storage.get('includeHashtags')) ?? true;

      const toneInstruction = TONE_PROMPTS[tone as string] || TONE_PROMPTS.casual;

      const prompt = [
        'Analyze this image and generate the following:',
        `1. A social media caption (2-3 sentences). ${toneInstruction}`,
        '2. An accessibility alt text (1 sentence, descriptive).',
        '3. An SEO meta description (under 160 characters).',
        includeHashtags ? '4. 5-8 relevant hashtags.' : '',
        `Respond in ${language === 'ko' ? 'Korean' : language === 'ja' ? 'Japanese' : language === 'zh' ? 'Chinese' : 'English'}.`,
        'Return as JSON: { "caption": "...", "altText": "...", "seoDescription": "...", "hashtags": ["..."] }',
      ]
        .filter(Boolean)
        .join('\n');

      await iris.window.showMessage('Generating caption...', 'info');

      try {
        const result = await iris.ai.executeModel('openai', {
          model: 'gpt-4o',
          prompt,
          image: image.data,
        });

        const parsed: CaptionResult =
          typeof result === 'string' ? JSON.parse(result) : (result as CaptionResult);

        const history: CaptionResult[] =
          (await iris.storage.get(HISTORY_KEY)) as CaptionResult[] || [];
        history.unshift(parsed);
        if (history.length > 50) history.length = 50;
        await iris.storage.set(HISTORY_KEY, history);

        const hashtagLine = parsed.hashtags?.length
          ? `<p style="color:#6b7280;margin-top:8px">${parsed.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}</p>`
          : '';

        const html = `
          <div style="padding:16px;font-family:system-ui;max-width:480px">
            <h2 style="margin:0 0 12px">Caption</h2>
            <p id="caption" style="background:#f3f4f6;padding:12px;border-radius:8px;line-height:1.6">${parsed.caption}</p>
            ${hashtagLine}
            <button onclick="navigator.clipboard.writeText(document.getElementById('caption').textContent + ' ${parsed.hashtags?.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}');window.parent.postMessage({type:'copied',field:'caption'},'*');"
              style="margin:8px 0;padding:8px 16px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer">
              Copy Caption
            </button>

            <h2 style="margin:16px 0 12px">Alt Text</h2>
            <p id="alt" style="background:#f3f4f6;padding:12px;border-radius:8px">${parsed.altText}</p>
            <button onclick="navigator.clipboard.writeText(document.getElementById('alt').textContent);window.parent.postMessage({type:'copied',field:'alt'},'*');"
              style="margin:8px 0;padding:8px 16px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer">
              Copy Alt Text
            </button>

            <h2 style="margin:16px 0 12px">SEO Description</h2>
            <p id="seo" style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:14px">${parsed.seoDescription}</p>
            <button onclick="navigator.clipboard.writeText(document.getElementById('seo').textContent);window.parent.postMessage({type:'copied',field:'seo'},'*');"
              style="margin:8px 0;padding:8px 16px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer">
              Copy SEO Description
            </button>
          </div>
        `;

        await iris.window.createPanel(html, { title: 'AI Caption', location: 'floating' });
      } catch (err) {
        iris.log.error('Caption generation failed', err);
        await iris.window.showMessage('Failed to generate caption.', 'error');
      }
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.ai-captioner.history', async () => {
      const history =
        ((await iris.storage.get(HISTORY_KEY)) as CaptionResult[]) || [];

      if (history.length === 0) {
        await iris.window.showMessage('No caption history yet.', 'info');
        return;
      }

      const rows = history
        .slice(0, 20)
        .map(
          (item, i) =>
            `<tr>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.caption}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb">
                <button onclick="navigator.clipboard.writeText('${item.caption.replace(/'/g, "\\'")}');window.parent.postMessage({type:'copied'},'*');"
                  style="padding:4px 8px;border:1px solid #d1d5db;background:white;border-radius:4px;cursor:pointer">Copy</button>
              </td>
            </tr>`
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 12px">Caption History (${history.length})</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">#</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Caption</th>
              <th style="padding:8px;border-bottom:2px solid #e5e7eb"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Caption History', location: 'floating' });
    })
  );

  iris.log.info('AI Image Captioner activated');
}

export function deactivate() {}
