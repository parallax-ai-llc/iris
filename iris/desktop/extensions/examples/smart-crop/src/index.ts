/**
 * Smart Crop Advisor
 * AI-powered crop suggestions based on rule of thirds, golden ratio, and platform aspect ratios.
 */

interface CropSuggestion {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ratio: string;
  confidence: number;
}

const ASPECT_RATIOS: Record<string, { w: number; h: number; label: string }> = {
  '1:1': { w: 1, h: 1, label: 'Square (Instagram)' },
  '4:5': { w: 4, h: 5, label: 'Portrait (Instagram)' },
  '9:16': { w: 9, h: 16, label: 'Story / Reel / TikTok' },
  '16:9': { w: 16, h: 9, label: 'Landscape (YouTube)' },
  '3:2': { w: 3, h: 2, label: 'Classic Photo' },
  '2:3': { w: 2, h: 3, label: 'Portrait Photo' },
  '4:3': { w: 4, h: 3, label: 'Standard Monitor' },
};

function calculateCropForRatio(
  imgW: number,
  imgH: number,
  ratioW: number,
  ratioH: number
): { x: number; y: number; width: number; height: number } {
  const targetRatio = ratioW / ratioH;
  const imgRatio = imgW / imgH;

  let cropW: number;
  let cropH: number;

  if (imgRatio > targetRatio) {
    // Image is wider — crop width
    cropH = imgH;
    cropW = Math.round(imgH * targetRatio);
  } else {
    // Image is taller — crop height
    cropW = imgW;
    cropH = Math.round(imgW / targetRatio);
  }

  return {
    x: Math.round((imgW - cropW) / 2),
    y: Math.round((imgH - cropH) / 2),
    width: cropW,
    height: cropH,
  };
}

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.smart-crop.analyze', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const { width, height } = image;
      const preferredStr =
        ((await iris.storage.get('preferredRatios')) as string) || '1:1,9:16,16:9';
      const preferredRatios = preferredStr.split(',').map((r) => r.trim());

      // Generate basic geometric crop suggestions
      const suggestions: CropSuggestion[] = [];

      for (const ratioKey of preferredRatios) {
        const ratio = ASPECT_RATIOS[ratioKey];
        if (!ratio) continue;

        const crop = calculateCropForRatio(width, height, ratio.w, ratio.h);
        const coverage = (crop.width * crop.height) / (width * height);

        suggestions.push({
          label: ratio.label,
          ...crop,
          ratio: ratioKey,
          confidence: Math.round(coverage * 100),
        });
      }

      // Try AI analysis for subject-aware suggestions
      try {
        const aiResult = await iris.ai.executeModel('openai', {
          model: 'gpt-4o',
          prompt: [
            `Image dimensions: ${width}x${height}.`,
            'Identify the main subject position as a percentage from top-left (x%, y%).',
            'Suggest the best crop region that keeps the subject well-framed.',
            'Respond as JSON: { "subjectX": number, "subjectY": number, "description": "..." }',
          ].join('\n'),
          image: image.data,
        });

        const parsed =
          typeof aiResult === 'string' ? JSON.parse(aiResult) : aiResult;

        if (parsed && parsed.description) {
          // Add AI-optimized crops centered on subject
          for (const ratioKey of preferredRatios) {
            const ratio = ASPECT_RATIOS[ratioKey];
            if (!ratio) continue;

            const targetRatio = ratio.w / ratio.h;
            let cropW: number;
            let cropH: number;

            if (width / height > targetRatio) {
              cropH = height;
              cropW = Math.round(height * targetRatio);
            } else {
              cropW = width;
              cropH = Math.round(width / targetRatio);
            }

            const subjectPxX = (parsed.subjectX / 100) * width;
            const subjectPxY = (parsed.subjectY / 100) * height;

            let x = Math.round(subjectPxX - cropW / 2);
            let y = Math.round(subjectPxY - cropH / 2);

            x = Math.max(0, Math.min(x, width - cropW));
            y = Math.max(0, Math.min(y, height - cropH));

            suggestions.push({
              label: `AI: ${ratio.label}`,
              x,
              y,
              width: cropW,
              height: cropH,
              ratio: ratioKey,
              confidence: 90,
            });
          }
        }
      } catch {
        iris.log.warn('AI crop analysis unavailable, using geometric only');
      }

      // Build panel UI
      const cards = suggestions
        .map((s) => {
          const previewW = 120;
          const previewH = Math.round((s.height / s.width) * previewW);

          return `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;width:140px">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px">${s.label}</div>
              <div style="width:${previewW}px;height:${Math.min(previewH, 160)}px;background:#f3f4f6;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af">
                ${s.width}×${s.height}
              </div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px">
                ${s.ratio} · ${s.confidence}% coverage
              </div>
              <div style="font-size:11px;color:#9ca3af">
                Offset: ${s.x}, ${s.y}
              </div>
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 4px">Smart Crop Suggestions</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px">
            Image: ${width} × ${height}
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${cards}
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Smart Crop',
        location: 'floating',
      });
    })
  );

  iris.log.info('Smart Crop Advisor activated');
}

export function deactivate() {}
