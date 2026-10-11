import { test, expect } from '../../fixtures/authenticated.fixture';
import { readStore } from '../../helpers/shortcut.helper';
import {
  NAV_ITEMS,
  assertClean,
  createWorkflowViaEngine,
  currentPageId,
  deleteWorkflowsCreatedSince,
  goTo,
  librarySearchInput,
  listWorkflowIds,
  navButton,
  preparePage,
  resetFocus,
  sandboxState,
  type ErrorLog,
} from '../../helpers/pages.helper';

/**
 * Basic-feature specs for the pages OUTSIDE the editors, part 1:
 * sidebar, Home, Templates, Projects, Batch, Library, Storage.
 *
 * Every test is independent (own app launch) and runs against deterministic stand-in cloud data
 * (see helpers/pages.helper.ts). Cloud writes are refused and reported by afterEach; so are
 * renderer console errors.
 */

let errors: ErrorLog;

test.beforeEach(async ({ page }) => {
  errors = await preparePage(page);
});
test.afterEach(async ({ page }) => {
  await assertClean(page, errors);
});

// ===================================================================== 1. sidebar

test.describe('1. Sidebar', () => {
  for (const item of NAV_ITEMS) {
    test(`menu "${item.label}" opens its page`, async ({ page }) => {
      const btn = navButton(page, item.label);
      test.skip((await btn.count()) === 0, `"${item.label}" is hidden in this build (self-host)`);

      // start from another page so a no-op click cannot pass
      await goTo(page, item.id === 'home' ? 'Images' : 'Home');
      await btn.click();

      await expect.poll(() => currentPageId(page), { timeout: 10_000 }).toBe(item.id);
      await expect(btn).toHaveAttribute('aria-current', 'page');
      await expect(page.locator(item.marker).first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test('Ctrl+1..0 and Ctrl+, match the sidebar order and the tooltips', async ({ page }) => {
    // begin on a page that is none of the targets' predecessors
    await goTo(page, 'Batch');
    for (const item of NAV_ITEMS) {
      const btn = navButton(page, item.label);
      if ((await btn.count()) === 0) continue; // hidden in self-host
      await resetFocus(page);
      await page.keyboard.press(`Control+${item.key}`);
      await expect
        .poll(() => currentPageId(page), { timeout: 5_000, message: `Ctrl+${item.key} should open ${item.id}` })
        .toBe(item.id);
      // tooltip advertises the same digit
      expect.soft(await btn.getAttribute('title'), `tooltip of ${item.label}`).toContain(`Ctrl+${item.key}`);
      // move away so the next combo is observable even when targets repeat
      await goTo(page, item.id === 'batch' ? 'Home' : 'Batch');
    }

    await resetFocus(page);
    await page.keyboard.press('Control+,');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  });

  test('back / forward navigation', async ({ page }) => {
    // three sidebar moves: Images -> Videos -> Library
    await goTo(page, 'Images');
    await goTo(page, 'Videos');
    await goTo(page, 'Library');
    await expect.poll(() => currentPageId(page)).toBe('library');

    // keyboard: Alt+Left twice, then Alt+Right
    await resetFocus(page);
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('videos');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('images');
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('videos');

    // title bar buttons, tooltips show the shortcut
    const back = page.getByTestId('titlebar-back');
    const forward = page.getByTestId('titlebar-forward');
    await expect(back).toHaveAttribute('title', /Alt\+←/);
    await expect(forward).toHaveAttribute('title', /Alt\+→/);
    await forward.click();
    await expect.poll(() => currentPageId(page)).toBe('library');
    await expect(forward).toBeDisabled();
    await back.click();
    await expect.poll(() => currentPageId(page)).toBe('videos');
    await expect(forward).toBeEnabled();

    // mouse side buttons (real Chromium input via CDP: button 3 = back, 4 = forward)
    const cdp = await page.context().newCDPSession(page);
    const side = async (button: 'back' | 'forward') => {
      for (const type of ['mousePressed', 'mouseReleased'] as const) {
        await cdp.send('Input.dispatchMouseEvent', { type, x: 400, y: 300, button, clickCount: 1 });
      }
    };
    await side('back');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('images');
    await side('forward');
    await expect.poll(() => currentPageId(page), { timeout: 5_000 }).toBe('videos');

    // a new move after going back clears forward
    await back.click();
    await expect.poll(() => currentPageId(page)).toBe('images');
    await goTo(page, 'Home');
    await expect(forward).toBeDisabled();

    // typing in a text field keeps Alt+Left for the field
    await goTo(page, 'Library');
    const search = librarySearchInput(page);
    if ((await search.count()) > 0) {
      await search.click();
      await page.keyboard.press('Alt+ArrowLeft');
      await page.waitForTimeout(300);
      expect(await currentPageId(page)).toBe('library');
    }
  });
});

// ===================================================================== 2. home

test.describe('2. Home', () => {
  const tiles = [
    { title: 'Create Image', page: 'images' },
    { title: 'Create Video', page: 'videos' },
    { title: 'Build Workflow', page: 'workflows' },
  ];
  for (const tile of tiles) {
    test(`quick-start tile "${tile.title}" goes to ${tile.page}`, async ({ page }) => {
      await goTo(page, 'Home');
      await page.locator('.dt-qa', { hasText: tile.title }).click();
      await expect.poll(() => currentPageId(page)).toBe(tile.page);
    });
  }

  test('stats and recent activity reflect the gallery; image card opens the image editor', async ({ page }) => {
    await goTo(page, 'Home');
    const stats = page.locator('.dt-bigstat-value');
    await expect(stats.nth(0)).toHaveText('4'); // images
    await expect(stats.nth(1)).toHaveText('3'); // videos

    const imageCard = page.locator('button.iris-card', { has: page.locator('.pill', { hasText: /^image$/ }) }).first();
    await expect(imageCard).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('button.iris-card').count()).toBe(6); // newest 6 of 7

    await imageCard.click();
    await expect.poll(() => readStore(page, 'editorTabs', (s) => s.tabs.length as number), { timeout: 15_000 }).toBe(1);
    await expect(page.locator('button:has-text("File")').first()).toBeVisible({ timeout: 20_000 });
  });

  test('video card in recent activity opens the video editor', async ({ page }) => {
    await goTo(page, 'Home');
    const videoCard = page.locator('button.iris-card', { has: page.locator('.pill', { hasText: /^video$/ }) }).first();
    await expect(videoCard).toBeVisible({ timeout: 10_000 });
    await videoCard.click();
    await expect.poll(() => readStore(page, 'editor', (s) => s.isEditorOpen as boolean), { timeout: 15_000 }).toBe(true);
  });

  test('"View all" goes to the Library', async ({ page }) => {
    await goTo(page, 'Home');
    await page.locator('button:has-text("View all")').click();
    await expect.poll(() => currentPageId(page)).toBe('library');
  });
});

// ===================================================================== 3. templates

test.describe('3. Templates', () => {
  let workflowsBefore: string[] = [];
  test.beforeEach(async ({ page }) => {
    workflowsBefore = await listWorkflowIds(page).catch(() => []);
    await goTo(page, 'Templates');
    await expect(page.locator('h1:has-text("Workflow templates")')).toBeVisible();
  });
  test.afterEach(async ({ page }) => {
    await deleteWorkflowsCreatedSince(page, workflowsBefore);
  });

  test('category filter narrows the cards and "All" restores them', async ({ page }) => {
    const cards = page.locator('.dt-tpl');
    const all = await cards.count();
    expect(all).toBeGreaterThan(0);

    await page.locator('.dt-seg-item', { hasText: /^Image$/ }).click();
    const cats = await page.locator('.dt-tpl .dt-tpl-cat').allTextContents();
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => c.trim().toLowerCase() === 'image')).toBe(true);
    expect(cats.length).toBeLessThanOrEqual(all);

    await page.locator('.dt-seg-item', { hasText: /^All$/ }).click();
    await expect(cards).toHaveCount(all);
  });

  test('search filters by name and shows the empty state', async ({ page }) => {
    const search = page.locator('input[placeholder^="Search templates"]');
    const firstTitle = (await page.locator('.dt-tpl .dt-tpl-title').first().textContent())!.trim();
    await search.fill(firstTitle.slice(0, 6));
    const shown = await page.locator('.dt-tpl .dt-tpl-title').allTextContents();
    expect(shown.map((s) => s.trim())).toContain(firstTitle);

    await search.fill('zzzz-no-such-template');
    await expect(page.locator('text=No templates found')).toBeVisible();
    await search.fill('');
    expect(await page.locator('.dt-tpl').count()).toBeGreaterThan(0);
  });

  test('"Use template" creates a local workflow and opens it in the editor with the template graph', async ({ page }) => {
    const card = page.locator('.dt-tpl').first();
    const nodeLabel = (await card.locator('.dt-tpl-meta span').first().textContent()) ?? '';
    const expected = Number(/(\d+)/.exec(nodeLabel)?.[1] ?? 0);
    expect(expected, 'template card advertises a node count').toBeGreaterThan(0);

    await card.locator('.dt-tpl-cta').click();
    await expect(page.locator('.iris-editor-host')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('.react-flow__node').count(), 'nodes on the canvas').toBe(expected);

    const editingId = await readStore(page, 'ui', (s) => s.editingWorkflowId as string | null);
    expect(editingId).toBeTruthy();

    await page.locator('button[title="Back to Workflows"]').click();
    await expect.poll(() => readStore(page, 'ui', (s) => s.editingWorkflowId as string | null)).toBeNull();
  });
});

// ===================================================================== 6. projects

test.describe('6. Projects', () => {
  const names = (page: import('@playwright/test').Page) => page.locator('.dt-proj .dt-proj-title').allTextContents();

  test.beforeEach(async ({ page }) => {
    await goTo(page, 'Projects');
    await expect(page.locator('h1:has-text("Video projects")')).toBeVisible();
    await expect(page.locator('.dt-proj').first()).toBeVisible({ timeout: 15_000 });
  });

  test('lists the projects with their total', async ({ page }) => {
    expect(await page.locator('.dt-proj').count()).toBe(2);
    await expect(page.locator('.dt-page-sub')).toHaveText(/2 total/);
  });

  test('search narrows the list and reports an empty result', async ({ page }) => {
    const search = page.locator('input[placeholder^="Search projects"]');
    await search.fill('alpha');
    expect(await names(page)).toEqual(['Alpha project']);
    await search.fill('zzz-none');
    await expect(page.locator('text=No projects found for "zzz-none"')).toBeVisible();
  });

  test('sort: last modified (default), then by name', async ({ page }) => {
    expect(await names(page)).toEqual(['Beta project', 'Alpha project']); // Beta was updated later
    await page.locator('.dt-seg-item', { hasText: 'Name' }).click();
    expect(await names(page)).toEqual(['Alpha project', 'Beta project']);
    await expect(page.locator('.dt-seg-item', { hasText: 'Name' })).toHaveAttribute('data-active', 'true');
  });

  test('grid / list toggle changes the layout', async ({ page }) => {
    const columns = () =>
      page.evaluate(() => {
        const grid = document.querySelector('.dt-proj')!.parentElement as HTMLElement;
        return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      });
    const gridCols = await columns();
    await page.locator('button[title="List"]').click();
    expect(await columns()).toBe(1);
    await page.locator('button[title="Grid"]').click();
    expect(await columns()).toBe(gridCols);
  });

  test('opening a project opens the video editor', async ({ page }) => {
    await page.locator('.dt-proj', { hasText: 'Alpha project' }).click();
    await expect.poll(() => readStore(page, 'editor', (s) => s.isEditorOpen as boolean), { timeout: 20_000 }).toBe(true);
  });
});

// ===================================================================== 8. batch

test.describe('8. Batch', () => {
  let before: string[] = [];
  test.beforeEach(async ({ page }) => {
    before = await listWorkflowIds(page).catch(() => []);
  });
  test.afterEach(async ({ page }) => {
    await deleteWorkflowsCreatedSince(page, before);
  });

  test('"New batch job" opens the wizard and Cancel returns to the list without creating anything', async ({ page }) => {
    await goTo(page, 'Batch');
    await page.locator('button:has-text("New batch job")').first().click();
    await expect(page.locator('h2:has-text("Select a Workflow")')).toBeVisible({ timeout: 10_000 });
    expect(await readStore(page, 'ui', (s) => s.isCreatingBatch as boolean)).toBe(true);
    // Next is disabled until a workflow is chosen
    await expect(page.locator('button:has-text("Next")')).toBeDisabled();

    await page.locator('button:text-is("Cancel")').click();
    await expect(page.locator('h1:has-text("Batch jobs")')).toBeVisible();
    expect(await readStore(page, 'ui', (s) => s.isCreatingBatch as boolean)).toBe(false);
  });

  test('wizard offers the local workflows and advances after one is selected (nothing is submitted)', async ({ page }) => {
    const wfId = await createWorkflowViaEngine(page, { name: 'E2E Batch Source', nodes: [], edges: [] });
    expect(wfId).toBeTruthy();

    await goTo(page, 'Batch');
    await page.locator('button:has-text("New batch job")').first().click();
    const option = page.locator('button', { hasText: 'E2E Batch Source' });
    await expect(option, 'a workflow created on the local engine is offered by the wizard').toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(page.locator('button:has-text("Next")')).toBeEnabled();
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('h2:has-text("Select a Workflow")')).toBeHidden({ timeout: 5_000 });

    // leave without submitting: Back until the first step, then Cancel
    for (let i = 0; i < 4; i++) {
      const back = page.locator('button:text-is("Back")');
      if (!(await back.count())) break;
      await back.click();
    }
    await page.locator('button:text-is("Cancel")').click();
    await expect(page.locator('h1:has-text("Batch jobs")')).toBeVisible();
  });
});

// ===================================================================== 10. library

test.describe('10. Library', () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, 'Library');
    await expect(page.locator('h1:has-text("Community shared creations")')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.dt-libcard').first()).toBeVisible({ timeout: 15_000 });
  });

  test('lists the items with their count; type filter toggles', async ({ page }) => {
    expect(await page.locator('.dt-libcard').count()).toBe(3);
    await expect(page.locator('main .t-eyebrow')).toHaveText(/3 items?/i);
    const images = page.locator('main').getByRole('button', { name: 'Images', exact: true });
    await images.click();
    await expect(images).toHaveAttribute('data-active', 'true');
    await page.locator('main').getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('main').getByRole('button', { name: 'All', exact: true })).toHaveAttribute('data-active', 'true');
  });

  test('preview modal opens on click and closes with Esc and with the close button', async ({ page }) => {
    await page.locator('.dt-libcard').first().click();
    const lightbox = page.locator('.dt-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox).toContainText('library item one');

    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();

    await page.locator('.dt-libcard').nth(1).click();
    await expect(lightbox).toContainText('library item two');
    await page.locator('.dt-lightbox-close').click();
    await expect(lightbox).toBeHidden();
  });

  test('ArrowRight / ArrowLeft move through the previewed items', async ({ page }) => {
    await page.locator('.dt-libcard').first().click();
    const lightbox = page.locator('.dt-lightbox');
    await expect(lightbox).toContainText('library item one');
    await page.keyboard.press('ArrowRight');
    await expect(lightbox, 'ArrowRight shows the next item').toContainText('library item two', { timeout: 2_000 });
    await page.keyboard.press('ArrowLeft');
    await expect(lightbox, 'ArrowLeft shows the previous item').toContainText('library item one', { timeout: 2_000 });
  });

  test('search filters the loaded items by prompt and model; empty state and clear', async ({ page }) => {
    const search = librarySearchInput(page);
    await expect(search).toBeVisible();

    // typing is not intercepted by the shortcut dispatcher (no navigation, text kept)
    await search.click();
    await page.keyboard.type('two');
    for (const combo of ['Control+3', 'Control+,']) await page.keyboard.press(combo);
    expect(await currentPageId(page)).toBe('library');
    await expect(search).toHaveValue('two');

    await expect(page.locator('.dt-libcard')).toHaveCount(1);
    await expect(page.locator('.dt-libcard').first()).toContainText('library item two');
    await expect(page.locator('main .t-eyebrow')).toHaveText(/1 of 3/);
    // the server has no search parameter: the page says it only searched what was loaded
    await expect(page.getByTestId('library-search-scope')).toContainText('3');

    // model ids are searched too (every stand-in item uses "e2e-model")
    await search.fill('E2E-MODEL item');
    await expect(page.locator('.dt-libcard')).toHaveCount(3);

    await search.fill('no such prompt');
    await expect(page.locator('.dt-libcard')).toHaveCount(0);
    const empty = page.getByTestId('library-search-empty');
    await expect(empty).toBeVisible();
    await empty.getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('.dt-libcard')).toHaveCount(3);

    // the clear (x) button inside the field
    await search.fill('one');
    await expect(page.locator('.dt-libcard')).toHaveCount(1);
    await page.locator('main').getByRole('button', { name: 'Clear search' }).first().click();
    await expect(search).toHaveValue('');
    await expect(page.locator('.dt-libcard')).toHaveCount(3);
  });

  test('preview "Remix" starts a generation from the item prompt; no dead buttons', async ({ page }) => {
    await page.locator('.dt-libcard').first().click();
    const lightbox = page.locator('.dt-lightbox');
    // every action in the preview must do something (Save had no handler and was removed)
    await expect(lightbox.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    const prompt = ((await lightbox.locator('.dt-lightbox-meta p').first().textContent()) ?? '').trim();
    await lightbox.getByRole('button', { name: 'Remix', exact: true }).click();
    await expect.poll(() => readStore(page, 'ui', (s) => s.currentPage as string)).toMatch(/^(images|videos)$/);
    await expect(lightbox).toHaveCount(0);
    if (prompt) {
      await expect(page.locator('.dt-sidepanel textarea').first()).toHaveValue(prompt);
    }
  });
});

// ===================================================================== 11. storage

test.describe('11. Storage', () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, 'Storage');
    await expect(page.locator('h1:has-text("Cloud storage")')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.dt-file-name[title="readme.txt"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('lists folders and files of the root', async ({ page }) => {
    await expect(page.locator('.dt-file-name[title="e2e-docs"]').first()).toBeVisible();
    await expect(page.locator('.dt-file-name[title="readme.txt"]').first()).toBeVisible();
  });

  test('opening a folder shows its content and the breadcrumb returns to the root', async ({ page }) => {
    const folder = page.locator('.dt-file', { has: page.locator('.dt-file-name[title="e2e-docs"]') }).first();
    await folder.click();
    const inner = page.locator('.dt-file-name[title="inner.txt"]').first();
    if (!(await inner.isVisible({ timeout: 2_000 }).catch(() => false))) await folder.dblclick();
    await expect(inner).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.dt-bread-chip', { hasText: 'e2e-docs' })).toBeVisible();

    await page.locator('.dt-bread-chip').first().click();
    await expect(page.locator('.dt-file-name[title="readme.txt"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('search filters the listing; grid / list toggle keeps the entries', async ({ page }) => {
    await page.locator('input[placeholder="Search files…"]').fill('readme');
    await expect(page.locator('.dt-file-name[title="e2e-docs"]')).toHaveCount(0);
    await expect(page.locator('.dt-file-name[title="readme.txt"]').first()).toBeVisible();
    await page.locator('input[placeholder="Search files…"]').fill('');

    await page.locator('button[title="List"]').click();
    await expect(page.locator('.dt-file-row-name-text[title="readme.txt"]')).toBeVisible();
    await page.locator('button[title="Grid"]').click();
    await expect(page.locator('.dt-file-name[title="readme.txt"]').first()).toBeVisible();
  });
});
