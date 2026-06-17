/**
 * Color Harmony Generator
 * Generate complementary, triadic, analogous, and split-complementary palettes from any color.
 */

type HarmonyType = 'complementary' | 'triadic' | 'analogous' | 'split-complementary' | 'tetradic';

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateHarmony(base: HSL, type: HarmonyType): HSL[] {
  const wrap = (h: number) => ((h % 360) + 360) % 360;

  switch (type) {
    case 'complementary':
      return [base, { ...base, h: wrap(base.h + 180) }];
    case 'triadic':
      return [base, { ...base, h: wrap(base.h + 120) }, { ...base, h: wrap(base.h + 240) }];
    case 'analogous':
      return [
        { ...base, h: wrap(base.h - 30) },
        base,
        { ...base, h: wrap(base.h + 30) },
      ];
    case 'split-complementary':
      return [
        base,
        { ...base, h: wrap(base.h + 150) },
        { ...base, h: wrap(base.h + 210) },
      ];
    case 'tetradic':
      return [
        base,
        { ...base, h: wrap(base.h + 90) },
        { ...base, h: wrap(base.h + 180) },
        { ...base, h: wrap(base.h + 270) },
      ];
  }
}

function getDominantColor(data: Uint8Array): { r: number; g: number; b: number } {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  const step = Math.max(4, Math.floor(data.length / 4 / 1000) * 4);

  for (let i = 0; i < data.length; i += step) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    count++;
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
}

export function activate(context: IrisExtensionContext) {
  const harmonyTypes: HarmonyType[] = [
    'complementary',
    'triadic',
    'analogous',
    'split-complementary',
    'tetradic',
  ];

  async function showHarmonyPanel(baseHsl: HSL) {
    const format = ((await iris.storage.get('format')) as string) || 'hex';

    const sections = harmonyTypes
      .map((type) => {
        const colors = generateHarmony(baseHsl, type);
        const swatches = colors
          .map((c) => {
            const hex = hslToHex(c.h, c.s, c.l);
            let label = hex;
            if (format === 'rgb') label = `rgb(${hexToRgbStr(hex)})`;
            else if (format === 'hsl') label = `hsl(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%)`;
            else if (format === 'tailwind') label = hex;

            return `
              <div style="text-align:center;cursor:pointer" onclick="navigator.clipboard.writeText('${label}');window.parent.postMessage({type:'copied'},'*');" title="Click to copy">
                <div style="width:60px;height:60px;background:${hex};border-radius:8px;border:1px solid rgba(0,0,0,0.1)"></div>
                <div style="font-size:11px;margin-top:4px;color:#374151">${hex}</div>
              </div>
            `;
          })
          .join('');

        return `
          <div style="margin-bottom:16px">
            <h3 style="margin:0 0 8px;text-transform:capitalize;font-size:14px">${type}</h3>
            <div style="display:flex;gap:8px">${swatches}</div>
          </div>
        `;
      })
      .join('');

    const baseHex = hslToHex(baseHsl.h, baseHsl.s, baseHsl.l);

    const html = `
      <div style="padding:16px;font-family:system-ui">
        <h2 style="margin:0 0 4px">Color Harmony Generator</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <div style="width:24px;height:24px;background:${baseHex};border-radius:4px;border:1px solid rgba(0,0,0,0.1)"></div>
          <span style="color:#6b7280;font-size:14px">Base: ${baseHex}</span>
        </div>
        ${sections}
        <p style="font-size:12px;color:#9ca3af;margin-top:8px">Click any swatch to copy its color code.</p>
      </div>
    `;

    await iris.window.createPanel(html, { title: 'Color Harmony', location: 'floating' });
  }

  context.subscriptions.push(
    iris.commands.register('iris-official.color-harmony.generate', async () => {
      const hexInput = await iris.window.showInputBox({
        prompt: 'Enter a base color (hex)',
        value: '#3B82F6',
        placeholder: '#RRGGBB',
      });

      if (!hexInput) return;

      const hex = hexInput.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      await showHarmonyPanel(rgbToHsl(r, g, b));
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.color-harmony.fromImage', async () => {
      const image = await iris.image.getActive();
      if (!image) {
        await iris.window.showMessage('No active image found.', 'warn');
        return;
      }

      const dominant = getDominantColor(image.data);
      await showHarmonyPanel(rgbToHsl(dominant.r, dominant.g, dominant.b));
    })
  );

  iris.log.info('Color Harmony Generator activated');
}

function hexToRgbStr(hex: string): string {
  const h = hex.replace('#', '');
  return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
}

export function deactivate() {}
