import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { readStore, TEST_CLIP_1 } from '../../helpers/shortcut.helper';
import { makeTestImages, stubOpenDialog, waitDocReady } from '../../helpers/lifecycle.helper';
import {
  assertClean,
  galleryCard,
  galleryCardAt,
  galleryCardCount,
  galleryCount,
  galleryNames,
  goTo,
  preparePage,
  sandboxState,
  type ErrorLog,
} from '../../helpers/pages.helper';

/**
 * Basic-feature specs, part 2: Images gallery (4) and Videos gallery (5).
 *
 * Gallery content is the deterministic stand-in data of helpers/pages.helper.ts:
 *   images (newest first): bravo(upscaled) alpha(uploaded) delta(generated) charlie(generated)
 *   videos (newest first): yankee(uploaded) xray(generated) zulu(generated)
 * Deleting only hits stand-in assets (the sandbox answers the DELETE itself); the generate
 * button is never pressed.
 */

let errors: ErrorLog;

test.beforeEach(async ({ page }) => {
  errors = await preparePage(page);
});
test.afterEach(async ({ page }) => {
  await assertClean(page, errors);
});

interface GalleryCase {
  kind: 'Images' | 'Videos';
  title: string;
  searchPlaceholder: string;
  newest: string[];
  filters: Record<string, string[]>; // filter option label -> names shown (newest first)
  deleteDialog: string;
  idPrefix: string;
}

const CASES: GalleryCase[] = [
  {
    kind: 'Images',
    title: 'Image Gallery',
    searchPlaceholder: 'Search images...',
    newest: ['bravo.png', 'alpha.png', 'delta.png', 'charlie.png'],
    filters: { Uploaded: ['alpha.png'], Generated: ['delta.png', 'charlie.png'], Edited: ['bravo.png'] },
    deleteDialog: 'Delete Selected Images',
    idPrefix: 'e2e-mock-img-',
  },
  {
    kind: 'Videos',
    title: 'Video Gallery',
    searchPlaceholder: 'Search videos...',
    newest: ['yankee.mp4', 'xray.mp4', 'zulu.mp4'],
    filters: { Uploaded: ['yankee.mp4'], Generated: ['xray.mp4', 'zulu.mp4'] },
    deleteDialog: 'Delete Selected Videos',
    idPrefix: 'e2e-mock-vid-',
  },
];

const selects = (page: Page) => page.locator('.dt-gallery select');
const selectBtn = (page: Page) => page.locator('.dt-gallery button:has(span:text-is("Select"))');

for (const c of CASES) {
  test.describe(`${c.kind === 'Images' ? '4' : '5'}. ${c.title}`, () => {
    test.beforeEach(async ({ page }) => {
      await goTo(page, c.kind);
      await expect.poll(() => galleryCount(page), { timeout: 20_000 }).toBe(c.newest.length);
    });

    test('lists the assets newest first with their count', async ({ page }) => {
      expect(await galleryNames(page)).toEqual(c.newest);
      await expect(page.locator('.dt-gallery-head .pill').first()).toHaveText(String(c.newest.length));
    });

    test('search narrows the list; the clear button and "Clear filters" restore it', async ({ page }) => {
      const search = page.locator(`input[placeholder="${c.searchPlaceholder}"]`);
      await search.fill(c.newest[1].slice(0, 3));
      expect(await galleryNames(page)).toEqual([c.newest[1]]);
      await expect(page.locator('.dt-gallery-head .pill').first()).toHaveText(`1 / ${c.newest.length}`);

      // the little X inside the search box
      await search.locator('xpath=following-sibling::button').click();
      expect(await galleryCount(page)).toBe(c.newest.length);

      await search.fill('zzz-no-such-asset');
      await expect(page.locator('text=No results found')).toBeVisible();
      await page.locator('button:has-text("Clear filters")').click();
      expect(await galleryCount(page)).toBe(c.newest.length);
      await expect(search).toHaveValue('');
    });

    test('sort: name A-Z / Z-A and oldest first', async ({ page }) => {
      const sorted = [...c.newest].sort();
      await selects(page).nth(1).selectOption({ label: 'Name (A-Z)' });
      expect(await galleryNames(page)).toEqual(sorted);
      await selects(page).nth(1).selectOption({ label: 'Name (Z-A)' });
      expect(await galleryNames(page)).toEqual([...sorted].reverse());
      await selects(page).nth(1).selectOption({ label: 'Oldest First' });
      expect(await galleryNames(page)).toEqual([...c.newest].reverse());
      await selects(page).nth(1).selectOption({ label: 'Newest First' });
      expect(await galleryNames(page)).toEqual(c.newest);
    });

    test('filter by source (generated / uploaded / edited)', async ({ page }) => {
      for (const [label, names] of Object.entries(c.filters)) {
        await selects(page).nth(0).selectOption({ label });
        expect(await galleryNames(page), `filter ${label}`).toEqual(names);
      }
      await selects(page).nth(0).selectOption({ label: c.kind === 'Images' ? 'All Images' : 'All Videos' });
      expect(await galleryCount(page)).toBe(c.newest.length);
    });

    test('selection mode: select cards, select all, cancel', async ({ page }) => {
      await selectBtn(page).click();
      await galleryCardAt(page, 0).click();
      await galleryCardAt(page, 1).click();
      await expect(page.locator('.dt-gallery button:has-text("Delete (2)")')).toBeVisible();

      // clicking a selected card again deselects it
      await galleryCardAt(page, 1).click();
      await expect(page.locator('.dt-gallery button:has-text("Delete (1)")')).toBeVisible();

      await page.locator('.dt-gallery button:has-text("Select All")').click();
      await expect(page.locator(`.dt-gallery button:has-text("Delete (${c.newest.length})")`)).toBeVisible();
      await expect(page.locator('.dt-gallery button:has-text("Select All")')).toBeDisabled();

      await page.locator('.dt-gallery button:has(span:text-is("Cancel"))').click();
      await expect(page.locator('.dt-gallery button:has-text("Delete (")')).toHaveCount(0);
      // selection mode is off: a card click must not toggle anything
      expect(await selectBtn(page).count()).toBe(1);
    });

    test('Esc closes the delete confirmation without deleting', async ({ page }) => {
      await selectBtn(page).click();
      await galleryCardAt(page, 0).click();
      await page.locator('.dt-gallery button:has-text("Delete (1)")').click();
      await expect(page.locator(`text=${c.deleteDialog}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(`text=${c.deleteDialog}`)).toBeHidden();
      expect(await galleryCardCount(page)).toBe(c.newest.length);
      expect((await sandboxState(page)).deleted).toEqual([]);
    });

    test('delete several selected assets (stand-in assets only)', async ({ page }) => {
      await selectBtn(page).click();
      await galleryCardAt(page, 0).click();
      await galleryCardAt(page, 2).click();
      await page.locator('.dt-gallery button:has-text("Delete (2)")').click();
      await expect(page.locator(`text=${c.deleteDialog}`)).toBeVisible();
      await page.locator('[class*="fixed"] button:text-is("Delete")').last().click();

      await expect.poll(() => galleryCount(page), { timeout: 10_000 }).toBe(c.newest.length - 2);
      const left = await galleryNames(page);
      expect(left).toEqual([c.newest[1], ...c.newest.slice(3)]);
      const { deleted } = await sandboxState(page);
      expect(deleted.sort()).toEqual(
        [c.newest[0], c.newest[2]].map((n) => c.idPrefix + n.replace(/\..*$/, '')).sort(),
      );
    });

    test('delete one asset with the card trash button', async ({ page }) => {
      const card = galleryCardAt(page, 1);
      await card.hover();
      await card.locator('button[title="Delete"]').click();
      await expect(page.locator(`text=${c.deleteDialog}`)).toBeVisible();
      await expect(page.locator('text=/delete 1 selected/i')).toBeVisible();
      await page.locator('[class*="fixed"] button:text-is("Delete")').last().click();
      await expect.poll(() => galleryNames(page), { timeout: 10_000 }).toEqual(
        c.newest.filter((n) => n !== c.newest[1]),
      );
    });
  });
}

// ------------------------------------------------------------------ local files -> editors

test.describe('4. Image gallery: open a local file', () => {
  test('"Open" with a local PNG opens the image editor on it', async ({ page, electronApp }) => {
    await goTo(page, 'Images');
    const [img] = makeTestImages();
    await stubOpenDialog(electronApp, [img.path]);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.waitForSelector('button:has-text("File")', { timeout: 20_000 });
    await waitDocReady(page, img.name);
    const tabs = await readStore(page, 'editorTabs', (s) => s.tabs.map((t: any) => t.asset.name) as string[]);
    expect(tabs).toEqual([img.name]);
  });

  test('"Open" cancelled in the dialog changes nothing', async ({ page, electronApp }) => {
    await goTo(page, 'Images');
    await stubOpenDialog(electronApp, []); // empty queue = user cancels
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.waitForTimeout(1_000);
    expect(await readStore(page, 'editorTabs', (s) => s.tabs.length as number)).toBe(0);
    await expect(page.locator('button:has-text("Generate Image")')).toBeVisible();
  });
});

test.describe('5. Video gallery: open a local file', () => {
  test('"Open" with a local clip opens the video editor with that clip on the timeline', async ({ page, electronApp }) => {
    await goTo(page, 'Videos');
    await stubOpenDialog(electronApp, [TEST_CLIP_1]);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(() => readStore(page, 'editor', (s) => s.isEditorOpen as boolean), { timeout: 30_000 }).toBe(true);
    await expect
      .poll(() => readStore(page, 'editor', (s) => s.tracks.reduce((n: number, t: any) => n + t.clips.length, 0) as number), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ generation panel (no execution)

test.describe('4/5. Generation panel (input only, nothing is generated)', () => {
  test('images: prompt, model, aspect ratio, negative prompt; Generate stays unpressed', async ({ page }) => {
    await goTo(page, 'Images');
    const generate = page.locator('button.dt-gen-cta');
    await expect(generate).toBeDisabled(); // empty prompt

    const prompt = page.locator('.dt-sidepanel textarea').first();
    await prompt.fill('a calm lake at dawn');
    await expect(prompt).toHaveValue('a calm lake at dawn');
    await expect(generate).toBeEnabled();

    // model dropdown: open, options listed, choose another, trigger shows it
    const trigger = page.locator('.dt-sidepanel label:text-is("Model") + div > button');
    const before = (await trigger.textContent())?.trim();
    await trigger.click();
    const options = page.locator('.dt-sidepanel div.absolute.z-50 button');
    expect(await options.count()).toBeGreaterThan(1);
    const second = (await options.nth(1).locator('span.text-sm').first().textContent())?.trim();
    await options.nth(1).click();
    await expect(trigger).toContainText(second!);
    expect(before).not.toBe(second);

    // aspect ratio tile selection moves the active marker
    const tiles = page.locator('.dt-ar-tile');
    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(tiles.nth(0)).toHaveAttribute('data-active', 'false');

    // negative prompt toggle reveals a second textarea
    const count = await page.locator('.dt-sidepanel textarea').count();
    await page.locator('.dt-sidepanel button:has-text("Negative")').first().click();
    expect(await page.locator('.dt-sidepanel textarea').count()).toBe(count + 1);

    expect((await sandboxState(page)).blocked, 'nothing was submitted').toEqual([]);
  });

  test('videos: prompt and model picker open; Generate needs a prompt', async ({ page }) => {
    await goTo(page, 'Videos');
    const generate = page.locator('button.dt-gen-cta');
    await expect(generate).toBeDisabled();
    const prompt = page.locator('.dt-sidepanel textarea').first();
    await prompt.fill('waves on a beach');
    await expect(generate).toBeEnabled();
    const trigger = page.locator('.dt-sidepanel label:text-is("Model") + div > button');
    await trigger.click();
    await expect(page.locator('.dt-sidepanel div.absolute.z-50')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.dt-sidepanel div.absolute.z-50')).toBeHidden();
  });
});
