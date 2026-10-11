import type { Page } from '@playwright/test';

/**
 * Theme helpers for the light-mode specs.
 *
 * Contrast is measured from computed styles: the element's text colour against
 * the background it actually sits on (its own and every ancestor's
 * background-color composited from <html> down). Colours are normalised to
 * sRGB through a 1x1 canvas, so oklch()/color-mix() values work too.
 * Background images (gradients, photos) are ignored: point this at text that
 * sits on flat surfaces.
 */

/** The theme currently on <html> (`data-theme`). */
export const htmlTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);

/** Pick a theme in Settings → Appearance (the tab must be open). */
export async function setThemeViaSettings(page: Page, label: 'Light' | 'Dark' | 'System'): Promise<void> {
  await page.locator('[role="radiogroup"][aria-label="Theme"] [role="radio"]', { hasText: label }).click();
}

/** WCAG contrast ratio of the first visible element matching `selector` (0 when none is visible). */
export async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(
      (n) => n.offsetParent !== null || n.getClientRects().length > 0,
    );
    if (!el) return 0;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const toRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: number[], bottom: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
    };

    // background: composite every ancestor's background-color, root first
    const chain: HTMLElement[] = [];
    for (let n: HTMLElement | null = el; n; n = n.parentElement) chain.unshift(n);
    let bg = [255, 255, 255, 1];
    const rootBg = toRgba(getComputedStyle(document.documentElement).backgroundColor);
    if (rootBg[3] > 0) bg = over(rootBg, bg);
    for (const n of chain) {
      const c = toRgba(getComputedStyle(n).backgroundColor);
      const op = parseFloat(getComputedStyle(n).opacity || '1');
      if (c[3] > 0) bg = over([c[0], c[1], c[2], c[3] * op], bg);
    }
    const fgRaw = toRgba(getComputedStyle(el).color);
    const fg = over(fgRaw, bg);

    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = lum(fg);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }, selector);
}
