/**
 * Social Media Preview
 * Preview how your image will look on Instagram, Twitter, YouTube thumbnails, and more.
 */

interface PlatformSpec {
  name: string;
  aspectRatio: string;
  width: number;
  height: number;
  safeArea: { top: number; bottom: number; left: number; right: number };
  borderRadius: number;
  description: string;
}

const PLATFORMS: Record<string, PlatformSpec> = {
  instagram: {
    name: 'Instagram Post',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    safeArea: { top: 60, bottom: 80, left: 20, right: 20 },
    borderRadius: 0,
    description: 'Square post in feed',
  },
  'instagram-story': {
    name: 'Instagram Story',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    safeArea: { top: 120, bottom: 200, left: 40, right: 40 },
    borderRadius: 0,
    description: 'Full-screen story',
  },
  twitter: {
    name: 'Twitter / X Post',
    aspectRatio: '16:9',
    width: 1200,
    height: 675,
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    borderRadius: 16,
    description: 'In-feed image card',
  },
  youtube: {
    name: 'YouTube Thumbnail',
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    safeArea: { top: 0, bottom: 60, left: 0, right: 120 },
    borderRadius: 12,
    description: 'Video thumbnail with timestamp overlay',
  },
  tiktok: {
    name: 'TikTok Cover',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    safeArea: { top: 150, bottom: 280, left: 40, right: 40 },
    borderRadius: 0,
    description: 'Full-screen cover with UI overlays',
  },
  facebook: {
    name: 'Facebook Post',
    aspectRatio: '1.91:1',
    width: 1200,
    height: 628,
    safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
    borderRadius: 8,
    description: 'Link preview / shared image',
  },
};

export function activate(context: IrisExtensionContext) {
  context.subscriptions.push(
    iris.commands.register('iris-official.social-preview.show', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const platformCards = Object.entries(PLATFORMS)
        .map(([key, spec]) => {
          const fit = calculateFit(image.width, image.height, spec.width, spec.height);
          const statusColor = fit === 'perfect' ? '#22c55e' : fit === 'crop' ? '#f59e0b' : '#ef4444';
          const statusText = fit === 'perfect' ? 'Perfect fit' : fit === 'crop' ? 'Will be cropped' : 'Will have letterbox';

          const previewW = 200;
          const previewH = (spec.height / spec.width) * previewW;

          return `
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;width:220px;flex-shrink:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <strong>${spec.name}</strong>
              </div>
              <div style="width:${previewW}px;height:${Math.min(previewH, 280)}px;background:#f3f4f6;border-radius:${spec.borderRadius}px;overflow:hidden;margin:0 auto;display:flex;align-items:center;justify-content:center;position:relative">
                <div style="font-size:11px;color:#9ca3af">Preview Area</div>
                ${spec.safeArea.top > 0 || spec.safeArea.bottom > 0 ? `
                  <div style="position:absolute;top:0;left:0;right:0;height:${(spec.safeArea.top / spec.height) * 100}%;background:rgba(0,0,0,0.15)"></div>
                  <div style="position:absolute;bottom:0;left:0;right:0;height:${(spec.safeArea.bottom / spec.height) * 100}%;background:rgba(0,0,0,0.15)"></div>
                ` : ''}
              </div>
              <div style="margin-top:8px;font-size:12px;color:#6b7280">
                <div>${spec.width} × ${spec.height} (${spec.aspectRatio})</div>
                <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block"></span>
                  ${statusText}
                </div>
                <div style="color:#9ca3af;margin-top:2px">${spec.description}</div>
              </div>
            </div>
          `;
        })
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 4px">Social Media Preview</h2>
          <p style="color:#6b7280;margin:0 0 16px;font-size:14px">
            Your image: ${image.width} × ${image.height}
          </p>
          <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">
            ${platformCards}
          </div>
          <div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px">
            <strong>Safe Area Legend:</strong>
            <span style="color:#6b7280">Shaded regions indicate areas that may be covered by platform UI elements (headers, buttons, timestamps).</span>
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: 'Social Media Preview',
        location: 'floating',
      });
    })
  );

  iris.log.info('Social Media Preview activated');
}

function calculateFit(
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number
): 'perfect' | 'crop' | 'letterbox' {
  const imgRatio = imgW / imgH;
  const targetRatio = targetW / targetH;
  const diff = Math.abs(imgRatio - targetRatio);

  if (diff < 0.05) return 'perfect';
  if (imgRatio > targetRatio) return 'crop';
  return 'letterbox';
}

export function deactivate() {}
