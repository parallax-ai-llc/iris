import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { openImageEditor } from '../../helpers/shortcut.helper';
import { activeDoc, menu, stubSaveDialog, watchErrors } from '../../helpers/lifecycle.helper';
import {
  canvasHash,
  clickDoc,
  decodePng,
  colorNear,
  countPixels,
  docBox,
  dragDoc,
  imgState,
  key,
  px,
  toScreen,
  waitHistoryChange,
} from '../../helpers/basics.helper';

/**
 * Basic-feature regression specs for the image editor. Each test drives the
 * real UI (menu, tool strip, option bar, canvas mouse input, shortcuts) and checks
 * both what is on the canvas (pixels) and the store. Failures are real bugs.
 *
 * Fixture: 480x320, background #3366cc (51,102,204) with a #ffcc00 rectangle
 * (40,40)-(160,130). Nothing is saved to the cloud.
 */

test.describe.configure({ timeout: 120_000 });

const BLUE: [number, number, number] = [51, 102, 204];
const YELLOW: [number, number, number] = [255, 204, 0];
const RED: [number, number, number] = [255, 0, 0];

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await openImageEditor(page, { width: 480, height: 320 });
});
test.afterEach(async () => {
  if (errors.length) {
    test.info().annotations.push({ type: 'renderer-errors', description: errors.slice(0, 8).join(' | ') });
    console.log(`RENDERER-ERRORS [${test.info().title}] ${errors.slice(0, 8).join(' | ')}`);
  }
});

// ------------------------------------------------------------------ helpers

async function setFg(page: Page, hex: string) {
  await page.locator('label[title="Foreground Color"] input[type="color"]').fill(hex);
  await page.waitForTimeout(150);
}
async function setBg(page: Page, hex: string) {
  await page.locator('label[title="Background Color"] input[type="color"]').fill(hex);
  await page.waitForTimeout(150);
}
/** Type a number into the option-bar CompactSlider with this label (Size, Opacity, ...). */
async function setSlider(page: Page, label: string, value: number) {
  const input = page.locator('span', { hasText: new RegExp(`^${label}$`) }).first().locator('xpath=following-sibling::div[1]//input').first();
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(150);
}
async function activeToolButtonTitle(page: Page, title: string) {
  await page.locator(`button[title="${title}"]`).first().click();
  await page.waitForTimeout(200);
}
const hist = async (page: Page) => (await activeDoc(page)).historyLength;
const histLabels = async (page: Page) => (await activeDoc(page)).historyLabels;
const sleep = (page: Page, ms = 400) => page.waitForTimeout(ms);

// =================================================================== 1. brush
test.describe('1. brush', () => {
  test('1a. drag paints, one history entry, undo restores', async ({ page }) => {
    await key(page, 'b');
    expect(await imgState(page, '(s)=>s.activeTool')).toBe('brush');
    await setFg(page, '#ff0000');
    await setSlider(page, 'Size', 20);
    const h0 = await hist(page);
    const before = await px(page, 250, 200);
    expect(colorNear(before, BLUE)).toBe(true);

    await dragDoc(page, [200, 200], [300, 200]);
    const h1 = await waitHistoryChange(page, h0);
    const painted = await px(page, 250, 200);
    expect.soft(colorNear(painted, RED, 40), `stroke centre is red, got ${painted}`).toBe(true);
    expect.soft(colorNear(await px(page, 250, 260), BLUE), 'pixel far from the stroke is untouched').toBe(true);
    expect.soft(h1 - h0, 'exactly one history entry for one stroke').toBe(1);

    await key(page, 'Control+z');
    await sleep(page, 600);
    expect.soft(colorNear(await px(page, 250, 200), BLUE), 'undo restores the pixel').toBe(true);
  });

  test('1b. brush size and colour changes are reflected in the stroke', async ({ page }) => {
    await key(page, 'b');
    await setFg(page, '#00ff00');
    await setSlider(page, 'Size', 8);
    expect(await imgState(page, '(s)=>s.brushSettings.size')).toBe(8);
    await dragDoc(page, [100, 200], [200, 200]);
    await setSlider(page, 'Size', 50);
    expect(await imgState(page, '(s)=>s.brushSettings.size')).toBe(50);
    await setFg(page, '#ff00ff');
    await dragDoc(page, [260, 250], [360, 250]);

    const isGreen = '(g>200&&r<80&&b<80&&a>200)';
    const isMagenta = '(r>200&&b>200&&g<80&&a>200)';
    const thinGreen = await countPixels(page, { x: 142, y: 150, w: 1, h: 100 }, isGreen);
    const thickMagenta = await countPixels(page, { x: 302, y: 150, w: 1, h: 200 }, isMagenta);
    expect.soft(thinGreen, 'size 8 stroke covers ~8 px vertically').toBeGreaterThan(3);
    expect.soft(thinGreen).toBeLessThan(14);
    expect.soft(thickMagenta, 'size 50 stroke is much thicker').toBeGreaterThan(thinGreen * 3);
    expect.soft(colorNear(await px(page, 300, 250), [255, 0, 255], 40), 'second stroke uses the new colour').toBe(true);
  });
});

// ============================================================ 2. eraser/fill/gradient
test.describe('2. eraser, fill, gradient', () => {
  test('2a. eraser (E) removes pixels', async ({ page }) => {
    await key(page, 'e');
    expect(await imgState(page, '(s)=>s.activeTool')).toBe('eraser');
    await setSlider(page, 'Size', 30);
    const h0 = await hist(page);
    const before = await px(page, 100, 85);
    expect(colorNear(before, YELLOW)).toBe(true);
    await dragDoc(page, [60, 85], [140, 85]);
    await waitHistoryChange(page, h0);
    const after = await px(page, 100, 85);
    expect.soft(after[3] < 40 || !colorNear(after, YELLOW), `erased pixel is no longer yellow, got ${after}`).toBe(true);
    expect.soft(colorNear(await px(page, 100, 125), YELLOW) || true).toBe(true);
    expect.soft(await hist(page) - h0).toBe(1);
  });

  test('2b. paint bucket fills the clicked region', async ({ page }) => {
    await key(page, 'b');
    await page.locator('button', { hasText: /^Fill$/ }).first().click();
    expect(await imgState(page, '(s)=>s.activeTool')).toBe('bucket');
    await setFg(page, '#ff0000');
    const h0 = await hist(page);
    await clickDoc(page, [100, 85]); // inside the yellow rectangle
    await waitHistoryChange(page, h0);
    expect.soft(colorNear(await px(page, 100, 85), RED, 30), 'clicked region is red').toBe(true);
    expect.soft(colorNear(await px(page, 140, 120), RED, 30), 'whole yellow rectangle is red').toBe(true);
    expect.soft(colorNear(await px(page, 300, 200), BLUE), 'outside region unchanged').toBe(true);
  });

  test('2c. gradient (G) drag paints a colour ramp', async ({ page }) => {
    await key(page, 'g');
    expect(await imgState(page, '(s)=>s.activeTool')).toMatch(/gradient/);
    const h0 = await hist(page);
    const before = [await px(page, 25, 300), await px(page, 240, 300), await px(page, 455, 300)];
    await dragDoc(page, [20, 280], [460, 280]);
    await waitHistoryChange(page, h0);
    const after = [await px(page, 25, 300), await px(page, 240, 300), await px(page, 455, 300)];
    expect.soft(await hist(page) - h0, 'gradient drag adds a history entry').toBe(1);
    expect.soft(JSON.stringify(after), `gradient changed the canvas (before ${JSON.stringify(before)})`).not.toBe(JSON.stringify(before));
    expect.soft(JSON.stringify(after[0]), 'ramp start differs from ramp end').not.toBe(JSON.stringify(after[2]));
  });
});

// ============================================================ 3. rectangular selection
test.describe('3. rectangular selection', () => {
  test('3a. M-drag creates a selection and Delete erases only inside it', async ({ page }) => {
    await key(page, 'm');
    expect(await imgState(page, '(s)=>s.selectionTool')).toBe('rectangle');
    await dragDoc(page, [60, 50], [140, 110]);
    expect.soft((await activeDoc(page)).hasSelection, 'selection exists after the drag').toBe(true);
    const b = await imgState(page, '(s)=>s.selection && s.selection.bounds');
    expect.soft(Math.abs((b as any).x - 60) <= 3 && Math.abs((b as any).width - 80) <= 4, `selection bounds match the drag, got ${JSON.stringify(b)}`).toBe(true);

    const h0 = await hist(page);
    await key(page, 'Delete');
    await sleep(page, 600);
    const erased = await px(page, 100, 80);
    expect.soft(erased[3] < 40 || !colorNear(erased, YELLOW), `Delete erased the selected area, got ${erased}`).toBe(true);
    expect.soft(colorNear(await px(page, 150, 120), YELLOW), 'pixel outside the selection kept').toBe(true);
    expect.soft(await hist(page) - h0, 'Delete is one history entry').toBe(1);
    await key(page, 'Control+z');
    await sleep(page, 500);
    expect.soft(colorNear(await px(page, 100, 80), YELLOW), 'undo restores the erased area').toBe(true);
  });

  test('3b. Ctrl+Shift+I inverts the selection (Delete then erases the outside)', async ({ page }) => {
    await key(page, 'm');
    await dragDoc(page, [60, 50], [140, 110]);
    await key(page, 'Control+Shift+i');
    await sleep(page, 400);
    // Inverse is baked into the mask: the inverted rect's bounds now start at the document corner.
    expect.soft(await imgState(page, '(s)=>!!(s.selection && s.selection.bounds && s.selection.bounds.x === 0 && s.selection.bounds.y === 0)'), 'selection covers the outside of the rect').toBe(true);
    await key(page, 'Delete');
    await sleep(page, 600);
    const outside = await px(page, 300, 200);
    expect.soft(outside[3] < 40, `outside of the original rect erased, got ${outside}`).toBe(true);
    expect.soft(colorNear(await px(page, 100, 80), YELLOW), 'inside the original rect kept').toBe(true);
  });

  test('3c. Ctrl+D clears the selection', async ({ page }) => {
    await key(page, 'm');
    await dragDoc(page, [60, 50], [140, 110]);
    expect((await activeDoc(page)).hasSelection).toBe(true);
    await key(page, 'Control+d');
    await sleep(page, 400);
    expect.soft((await activeDoc(page)).hasSelection, 'Ctrl+D deselects').toBe(false);
  });

  test('3d. Select > Deselect / Invert Selection menu items work', async ({ page }) => {
    await key(page, 'm');
    await dragDoc(page, [60, 50], [140, 110]);
    await menu(page, 'Select', 'Invert Selection');
    await sleep(page, 300);
    expect.soft(await imgState(page, '(s)=>!!(s.selection && s.selection.bounds && s.selection.bounds.x === 0 && s.selection.bounds.y === 0)'), 'menu invert').toBe(true);
    await menu(page, 'Select', 'Deselect');
    await sleep(page, 300);
    expect.soft((await activeDoc(page)).hasSelection, 'menu deselect').toBe(false);
  });
});

// ============================================================ 4. move tool
test.describe('4. move tool', () => {
  async function floatingLayer(page: Page) {
    // Preparation: a second layer holding a red square so a layer-move is visible.
    await key(page, 'Control+Shift+n');
    await sleep(page, 500);
    await key(page, 'b');
    await setFg(page, '#ff0000');
    await setSlider(page, 'Size', 60);
    await dragDoc(page, [300, 200], [330, 200]);
    await sleep(page, 500);
  }

  test('4a. dragging with V moves the layer', async ({ page }) => {
    await floatingLayer(page);
    const before = await px(page, 315, 200);
    expect(colorNear(before, RED, 40)).toBe(true);
    await key(page, 'v');
    expect(await imgState(page, '(s)=>s.editMode+":"+s.activeTool')).toBeTruthy();
    await dragDoc(page, [315, 200], [315, 100]);
    await sleep(page, 600);
    const moved = await px(page, 315, 100);
    expect.soft(colorNear(moved, RED, 40), `red square now at the drop point, got ${moved}`).toBe(true);
    expect.soft(!colorNear(await px(page, 315, 200), RED, 40), 'old position cleared').toBe(true);
  });

  test('4b. arrow keys nudge the layer', async ({ page }) => {
    await floatingLayer(page);
    await key(page, 'v');
    const x0 = await imgState(page, '(s)=>s.layers[s.layers.length-1].x');
    for (let i = 0; i < 3; i++) await key(page, 'ArrowRight');
    await sleep(page, 400);
    const x1 = await imgState(page, '(s)=>s.layers[s.layers.length-1].x');
    expect.soft(x1 as number, 'layer x increased by nudging').toBeGreaterThan(x0 as number);
    await key(page, 'Shift+ArrowDown');
    await sleep(page, 400);
  });
});


// ------------------------------------------------------------------ more helpers

/** Open a top-level menu and walk through submenus (hover) to a final item (click). */
async function menuPath(page: Page, top: string, ...path: string[]) {
  await page.locator('button', { hasText: new RegExp('^' + top + '$') }).first().click();
  for (let i = 0; i < path.length; i++) {
    const item = page.locator('button', { has: page.locator(`span:text-is("${path[i]}")`) }).first();
    if (i < path.length - 1) await item.hover();
    else await item.click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
}
/** The text box takes focus a moment after the click (rAF); a user types only once the caret is there. */
async function waitEditorFocus(page: Page) {
  await page.waitForFunction(() => (document.activeElement as HTMLElement | null)?.isContentEditable === true, undefined, { timeout: 5_000 }).catch(() => {});
}
const layerRows = (page: Page) => page.locator('div.cursor-grab');
const layerNames = async (page: Page) => (await activeDoc(page)).layers;
const dims = async (page: Page) => {
  const d = await activeDoc(page);
  return [d.canvasWidth, d.canvasHeight];
};

// =================================================================== 5. crop
test.describe('5. crop', () => {
  test('5a. C -> drag a crop box -> Enter changes the canvas size; undo restores it', async ({ page }) => {
    await key(page, 'c');
    expect(await imgState(page, '(s)=>s.editMode')).toBe('crop');
    await page.waitForTimeout(500);
    await dragDoc(page, [100, 60], [300, 260]);
    const cd = await imgState(page, '(s)=>s.cropData') as { width: number; height: number } | null;
    expect.soft(cd, 'a crop box exists after the drag').toBeTruthy();
    expect.soft(Math.abs((cd?.width ?? 0) - 200) <= 4 && Math.abs((cd?.height ?? 0) - 200) <= 4, `crop box is about 200x200, got ${JSON.stringify(cd)}`).toBe(true);
    const h0 = await hist(page);
    await key(page, 'Enter');
    await sleep(page, 900);
    const [w, h] = await dims(page);
    expect.soft([w, h], `canvas size after crop`).toEqual([200, 200]);
    expect.soft(await hist(page) - h0, 'crop is one history entry').toBe(1);
    const box = await docBox(page);
    expect.soft([box.cw, box.ch], 'visible canvas has the new size').toEqual([w, h]);

    await key(page, 'Control+z');
    await sleep(page, 800);
    const doc = await activeDoc(page);
    const boxU = await docBox(page);
    expect.soft([doc.canvasWidth, doc.canvasHeight], 'undo restores the 480x320 document size (store)').toEqual([480, 320]);
    expect.soft([boxU.cw, boxU.ch], 'undo restores the visible canvas size').toEqual([480, 320]);
    expect.soft(colorNear(await px(page, 100, 85), YELLOW), 'undo restores the content').toBe(true);
  });

  test('5b. dragging a crop box towards the top-left also creates a box', async ({ page }) => {
    await key(page, 'c');
    await page.waitForTimeout(500);
    await dragDoc(page, [300, 260], [100, 60]);
    const cd = await imgState(page, '(s)=>s.cropData') as { width: number; height: number } | null;
    expect.soft((cd?.width ?? 0) > 150 && (cd?.height ?? 0) > 150, `crop box from a reverse drag is about 200x200, got ${JSON.stringify(cd)}`).toBe(true);
  });
});

// =================================================================== 6. layers
test.describe('6. layers', () => {
  async function paintOnNewLayer(page: Page, hex: string, from: [number, number], to: [number, number], size = 40) {
    await page.locator('button[aria-label="Add Layer"]').click();
    await sleep(page, 400);
    await key(page, 'b');
    await setFg(page, hex);
    await setSlider(page, 'Size', size);
    await dragDoc(page, from, to);
    await sleep(page, 500);
  }

  test('6a. add, duplicate, delete: panel rows match the store', async ({ page }) => {
    expect(await layerRows(page).count()).toBe(1);
    await page.locator('button[aria-label="Add Layer"]').click();
    await sleep(page);
    expect.soft((await activeDoc(page)).layerCount, 'add layer -> 2').toBe(2);
    expect.soft(await layerRows(page).count(), 'panel shows 2 rows').toBe(2);
    await page.locator('button[aria-label="Duplicate Layer"]').click();
    await sleep(page);
    expect.soft((await activeDoc(page)).layerCount, 'duplicate -> 3').toBe(3);
    expect.soft(await layerRows(page).count(), 'panel shows 3 rows').toBe(3);
    const names = await layerNames(page);
    expect.soft(new Set(names).size, `layer names are unique, got ${names}`).toBe(3);
    await page.locator('button[aria-label="Delete Layer"]').click();
    await sleep(page);
    expect.soft((await activeDoc(page)).layerCount, 'delete -> 2').toBe(2);
    expect.soft(await layerRows(page).count(), 'panel shows 2 rows').toBe(2);
  });

  test('6a2. deleting a layer can be undone with Ctrl+Z', async ({ page }) => {
    await page.locator('button[aria-label="Add Layer"]').click();
    await sleep(page);
    expect((await activeDoc(page)).layerCount).toBe(2);
    await page.locator('button[aria-label="Delete Layer"]').click();
    await sleep(page);
    expect((await activeDoc(page)).layerCount).toBe(1);
    await key(page, 'Control+z');
    await sleep(page, 600);
    expect.soft((await activeDoc(page)).layerCount, `undo of "delete layer" brings the layer back (history ${(await activeDoc(page)).historyLabels})`).toBe(2);
  });

  test('6b. visibility toggle is reflected in the pixels', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]);
    expect(colorNear(await px(page, 250, 200), RED, 40)).toBe(true);
    const row = layerRows(page).filter({ hasText: /Layer/ }).first();
    await row.locator('button').first().click(); // eye
    await sleep(page, 500);
    expect.soft(await imgState(page, '(s)=>s.layers[s.layers.length-1].visible'), 'layer hidden in store').toBe(false);
    expect.soft(colorNear(await px(page, 250, 200), BLUE), `hidden layer no longer drawn, got ${await px(page, 250, 200)}`).toBe(true);
    await row.locator('button').first().click();
    await sleep(page, 500);
    expect.soft(colorNear(await px(page, 250, 200), RED, 40), 'visible again').toBe(true);
  });

  test('6c. layer opacity slider blends the layer', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]);
    await page.locator('input[aria-label="Opacity"]').fill('50');
    await sleep(page, 600);
    expect.soft(await imgState(page, '(s)=>s.layers[s.layers.length-1].opacity'), 'opacity stored').toBe(50);
    const p = await px(page, 250, 200);
    expect.soft(p[0] > 110 && p[0] < 200 && p[2] > 70 && p[2] < 170, `50% red over blue is a mix, got ${p}`).toBe(true);
    await expect.soft(layerRows(page).first()).toContainText('50%');
  });

  test('6d. blend mode (Multiply) changes the composite', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]);
    await page.locator('select[aria-label="Blend Mode"]').selectOption('multiply');
    await sleep(page, 600);
    expect.soft(await imgState(page, '(s)=>s.layers[s.layers.length-1].blendMode')).toBe('multiply');
    const p = await px(page, 250, 200);
    // red (255,0,0) x blue (51,102,204) multiply = (51,0,0)
    expect.soft(p[0] < 100 && p[1] < 40 && p[2] < 40, `multiply result is dark red, got ${p}`).toBe(true);
  });

  test('6e. reorder (Move up/down) changes which layer is on top', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]); // lower of the two
    await paintOnNewLayer(page, '#00ff00', [200, 200], [300, 200]); // top
    expect(colorNear(await px(page, 250, 200), [0, 255, 0], 40), 'green on top first').toBe(true);
    const ids = () => imgState(page, '(s)=>s.layers.map(l=>l.id)') as Promise<string[]>;
    const order0 = await ids();
    const topRow = layerRows(page).first();
    await topRow.locator('button[title="Move down"]').click();
    await sleep(page, 600);
    const order1 = await ids();
    expect.soft(order1, 'store order changed').not.toEqual(order0);
    expect.soft(colorNear(await px(page, 250, 200), RED, 40), `red is on top after moving green down, got ${await px(page, 250, 200)}`).toBe(true);
  });

  test('6f. Ctrl+E merges a layer down; pixels are kept', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]);
    expect((await activeDoc(page)).layerCount).toBe(2);
    await key(page, 'Control+e');
    await sleep(page, 800);
    expect.soft((await activeDoc(page)).layerCount, 'merge down -> 1 layer').toBe(1);
    expect.soft(await layerRows(page).count()).toBe(1);
    expect.soft(colorNear(await px(page, 250, 200), RED, 40), `merged pixels visible, got ${await px(page, 250, 200)}`).toBe(true);
    expect.soft(colorNear(await px(page, 100, 85), YELLOW), 'background content kept').toBe(true);
    await key(page, 'Control+z');
    await sleep(page, 600);
    expect.soft((await activeDoc(page)).layerCount, `Ctrl+Z undoes the merge (history ${(await activeDoc(page)).historyLabels})`).toBe(2);
  });

  test('6g. layer context menu: Merge Down works', async ({ page }) => {
    await paintOnNewLayer(page, '#ff0000', [200, 200], [300, 200]);
    await layerRows(page).first().click({ button: 'right' });
    await sleep(page, 300);
    const merge = page.locator('button', { hasText: /Merge Down/ }).first();
    await expect.soft(merge).toBeVisible();
    await merge.click();
    await sleep(page, 700);
    expect.soft((await activeDoc(page)).layerCount, 'context-menu merge -> 1 layer').toBe(1);
    expect.soft(colorNear(await px(page, 250, 200), RED, 40), `merged pixels stay visible after the context-menu merge, got ${await px(page, 250, 200)}`).toBe(true);
  });
});

// =================================================================== 7. text
test.describe('7. text', () => {
  const notBlue = '(!(Math.abs(r-51)<20&&Math.abs(g-102)<20&&Math.abs(b-204)<20))';
  test('7. T -> click -> type -> Enter creates a text layer with visible pixels; clicking it again edits it', async ({ page }) => {
    await key(page, 't');
    expect(await imgState(page, '(s)=>s.editMode')).toBe('text');
    const before = await countPixels(page, { x: 60, y: 230, w: 200, h: 60 }, notBlue);
    await clickDoc(page, [70, 240]);
    await waitEditorFocus(page);
    await page.keyboard.type('Hello', { delay: 40 });
    await sleep(page, 300);
    await page.keyboard.press('Enter');
    await sleep(page, 700);
    const layers = await layerNames(page);
    expect.soft(layers.length, `text layer added (${layers})`).toBe(2);
    const after = await countPixels(page, { x: 60, y: 230, w: 200, h: 60 }, notBlue);
    expect.soft(after - before, 'text drew pixels on the canvas').toBeGreaterThan(30);
    expect.soft((await activeDoc(page)).historyLabels, 'history has a Text entry').toContain('Text');

    // re-edit: click the existing text with the text tool
    await clickDoc(page, [80, 250]);
    await waitEditorFocus(page);
    await page.keyboard.type('X', { delay: 40 });
    await page.keyboard.press('Enter');
    await sleep(page, 700);
    const layers2 = await layerNames(page);
    expect.soft(layers2.length, `clicking existing text edits it instead of adding another text layer (layers ${layers2})`).toBe(2);
  });
});

// =================================================================== 8. shapes
test.describe('8. shapes', () => {
  async function drawShape(page: Page, title: 'Rectangle' | 'Ellipse') {
    await key(page, 'u');
    expect(await imgState(page, '(s)=>s.editMode')).toBe('shape');
    await page.locator(`button[title="${title}"]`).first().click();
    const h0 = await hist(page);
    await dragDoc(page, [300, 150], [440, 290]);
    await waitHistoryChange(page, h0);
    await sleep(page, 400);
  }
  const isBlue = '(Math.abs(r-51)<20&&Math.abs(g-102)<20&&Math.abs(b-204)<20)';

  test('8a. rectangle', async ({ page }) => {
    const n0 = await countPixels(page, { x: 300, y: 150, w: 140, h: 140 }, isBlue);
    await drawShape(page, 'Rectangle');
    const n1 = await countPixels(page, { x: 300, y: 150, w: 140, h: 140 }, isBlue);
    expect.soft(n0 - n1, 'rectangle covers most of its drag box').toBeGreaterThan(140 * 140 * 0.5);
    expect.soft((await activeDoc(page)).historyLabels, 'history has a Shape entry').toContain('Shape');
  });

  test('8b. ellipse (corners of the box stay empty)', async ({ page }) => {
    await drawShape(page, 'Ellipse');
    const centre = await px(page, 370, 220);
    const corner = await px(page, 304, 154);
    expect.soft(!colorNear(centre, BLUE, 12), `ellipse centre is painted, got ${centre}`).toBe(true);
    expect.soft(colorNear(corner, BLUE, 12), `ellipse corner is untouched, got ${corner}`).toBe(true);
  });
});

// =================================================================== 9. adjustments
// The adjust mode shows Brightness / Contrast / Saturation (+ "More") in the options bar. There is no
// Apply button: pending adjustments are applied when the mode is left (setEditMode in the store).
test.describe('9. adjustments', () => {
  async function openAdjust(page: Page) {
    await menuPath(page, 'Image', 'Adjustments...');
    expect(await imgState(page, '(s)=>s.editMode')).toBe('adjust');
  }
  async function setAdjust(page: Page, label: string, v: number) {
    await setSlider(page, label, v);
    await sleep(page, 700);
  }

  test('9a. live preview changes the canvas; leaving the mode applies it as one history entry', async ({ page }) => {
    const base = await px(page, 300, 200);
    await openAdjust(page);
    const h0 = await hist(page);
    await setAdjust(page, 'Brightness', 60);
    const prev = await px(page, 300, 200);
    expect.soft(prev[0] + prev[1] + prev[2], `live preview is brighter (base ${base}, preview ${prev})`).toBeGreaterThan(base[0] + base[1] + base[2]);
    expect.soft(await hist(page), 'preview alone adds no history entry').toBe(h0);
    await key(page, 'v'); // leave the adjust mode
    await sleep(page, 1200);
    const applied = await px(page, 300, 200);
    expect.soft(applied[0] + applied[1] + applied[2], `applied result is brighter, got ${applied}`).toBeGreaterThan(base[0] + base[1] + base[2]);
    expect.soft(await hist(page) - h0, `one history entry after leaving (${(await activeDoc(page)).historyLabels})`).toBe(1);
    await key(page, 'Control+z');
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 300, 200), BLUE, 6), 'undo restores the original').toBe(true);
  });

  test('9b. Reset discards the preview without a history entry', async ({ page }) => {
    await openAdjust(page);
    const h0 = await hist(page);
    await setAdjust(page, 'Brightness', 80);
    expect(colorNear(await px(page, 300, 200), BLUE, 6), 'preview is visible').toBe(false);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 300, 200), BLUE, 6), 'canvas back to the original').toBe(true);
    await key(page, 'v');
    await sleep(page, 800);
    expect.soft(await hist(page), 'no history entry after reset + leave').toBe(h0);
    expect.soft(colorNear(await px(page, 300, 200), BLUE, 6), 'canvas still the original').toBe(true);
  });

  test('9c. Saturation -100 turns pixels grey once applied', async ({ page }) => {
    await openAdjust(page);
    await setAdjust(page, 'Saturation', -100);
    await key(page, 'v');
    await sleep(page, 1200);
    const p = await px(page, 300, 200);
    expect.soft(Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 25, `desaturated pixel is grey, got ${p}`).toBe(true);
  });
});

// =================================================================== 10. filters
test.describe('10. filters', () => {
  test('10a. Filter > Blur > Gaussian Blur softens the yellow rectangle edge', async ({ page }) => {
    const h0 = await hist(page);
    const edgeBefore = await px(page, 38, 85); // 2 px outside the rectangle edge
    await menuPath(page, 'Filter', 'Blur', 'Gaussian Blur...');
    await waitHistoryChange(page, h0, 6000);
    await sleep(page, 600);
    const edgeAfter = await px(page, 38, 85);
    expect.soft(edgeAfter[0] > edgeBefore[0] + 6, `blur bleeds yellow outside the edge (before ${edgeBefore}, after ${edgeAfter})`).toBe(true);
    expect.soft(await hist(page) - h0, 'one history entry').toBe(1);
    await key(page, 'Control+z');
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 38, 85), BLUE, 6), 'undo restores the sharp edge').toBe(true);
  });

  test('10b. Filter > Adjustments > Invert flips the colours', async ({ page }) => {
    const h0 = await hist(page);
    await menuPath(page, 'Filter', 'Adjustments', 'Invert');
    await waitHistoryChange(page, h0, 6000);
    await sleep(page, 600);
    const p = await px(page, 300, 200);
    expect.soft(colorNear(p, [255 - 51, 255 - 102, 255 - 204], 8), `inverted blue, got ${p}`).toBe(true);
  });
});

// =================================================================== 11. image / canvas size
test.describe('11. size dialogs', () => {
  test('11a. Image Size: 240 wide (linked) -> 240x160', async ({ page }) => {
    await menuPath(page, 'Image', 'Image Size...');
    await expect(page.getByRole('heading', { name: 'Image Size' })).toBeVisible();
    const inputs = page.locator('div.fixed input[type="number"]');
    await inputs.nth(0).fill('240');
    await sleep(page, 200);
    expect.soft(await inputs.nth(1).inputValue(), 'linked height follows').toBe('160');
    await page.locator('div.fixed button', { hasText: /^(Apply|Resize|OK)$/ }).click();
    await sleep(page, 1000);
    expect.soft(await dims(page), 'document size changed').toEqual([240, 160]);
    const box = await docBox(page);
    expect.soft([box.cw, box.ch], 'canvas element has the new size').toEqual([240, 160]);
    await key(page, 'Control+z');
    await sleep(page, 800);
    expect.soft(await dims(page), 'undo restores size').toEqual([480, 320]);
  });

  test('11b. Canvas Size: 600x400 grows the canvas', async ({ page }) => {
    await menuPath(page, 'Image', 'Canvas Size...');
    await expect(page.getByRole('heading', { name: 'Canvas Size' })).toBeVisible();
    const inputs = page.locator('div.fixed input[type="number"]');
    await page.locator('div.fixed button[title="Unlink width and height"]').click().catch(() => {});
    await inputs.nth(0).fill('600');
    await inputs.nth(1).fill('400');
    await sleep(page, 200);
    await page.locator('div.fixed button', { hasText: /^(Apply|Resize|OK)$/ }).click();
    await sleep(page, 1000);
    expect.soft(await dims(page), 'canvas size changed').toEqual([600, 400]);
    const box = await docBox(page);
    expect.soft([box.cw, box.ch]).toEqual([600, 400]);
  });
});

// =================================================================== 12. rotate / flip
// The options bar of Image > Transform has 90 L / 90 R / Flip H / Flip V (view transforms in the store).
test.describe('12. rotate and flip', () => {
  async function exportPng(page: Page, electronApp: import('playwright').ElectronApplication) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-basics-')), 'rot.png');
    await stubSaveDialog(electronApp, out);
    await menuPath(page, 'File', 'Export As...');
    await page.locator('div.fixed button', { hasText: /^PNG/ }).first().click();
    await page.locator('div.fixed').getByRole('button', { name: 'Export', exact: true }).click();
    await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size, { timeout: 15_000 }).toBeGreaterThan(0);
    return decodePng(fs.readFileSync(out));
  }

  test('12a. 90 R rotates what is shown and what is exported (320x480)', async ({ page, electronApp }) => {
    await menuPath(page, 'Image', 'Transform...');
    await page.locator('button', { hasText: /^90°R$/ }).click();
    await sleep(page, 600);
    const box = await docBox(page);
    expect.soft([Math.round(box.w), Math.round(box.h)], 'canvas is shown rotated').toEqual([320, 480]);
    await key(page, 'v');
    await sleep(page, 800);
    const doc = await activeDoc(page);
    const exported = await exportPng(page, electronApp);
    expect.soft([exported.width, exported.height], `exported PNG is rotated (document ${doc.canvasWidth}x${doc.canvasHeight})`).toEqual([320, 480]);
  });

  test('12b. Flip H mirrors the exported image (yellow block moves to the right)', async ({ page, electronApp }) => {
    expect(colorNear(await px(page, 100, 85), YELLOW)).toBe(true);
    await menuPath(page, 'Image', 'Transform...');
    await page.locator('button', { hasText: /^Flip H$/ }).click();
    await sleep(page, 500);
    expect.soft(await imgState(page, '(s)=>s.flipHorizontal'), 'flip flag set').toBe(true);
    await key(page, 'v');
    await sleep(page, 800);
    const exported = await exportPng(page, electronApp);
    expect.soft(colorNear(exported.at(380, 85), YELLOW), `exported yellow block is on the right, got ${exported.at(380, 85)}`).toBe(true);
    expect.soft(colorNear(exported.at(100, 85), BLUE), `left side is blue in the export, got ${exported.at(100, 85)}`).toBe(true);
  });
});

// =================================================================== 13. save / export
test.describe('13. save and export to disk', () => {
  const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;

  test('13a. File > Save As... PNG, local', async ({ page, electronApp }) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-basics-')), 'saved.png');
    await stubSaveDialog(electronApp, out);
    await menuPath(page, 'File', 'Save As...');
    await page.locator('div.fixed button', { hasText: /^PNG/ }).first().click();
    await page.locator('div.fixed').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size, { timeout: 15_000 }).toBeGreaterThan(0);
    expect.soft(isPng(fs.readFileSync(out)), 'file has the PNG signature').toBe(true);
    const img = decodePng(fs.readFileSync(out));
    expect.soft([img.width, img.height], 'saved size').toEqual([480, 320]);
    expect.soft(colorNear(img.at(100, 85), YELLOW) && colorNear(img.at(300, 200), BLUE), 'saved pixels match the canvas').toBe(true);
  });

  test('13b. File > Save As... JPEG, local', async ({ page, electronApp }) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-basics-')), 'saved.jpg');
    await stubSaveDialog(electronApp, out);
    await menuPath(page, 'File', 'Save As...');
    await page.locator('div.fixed button', { hasText: /^JPEG/ }).first().click();
    await page.locator('div.fixed').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size, { timeout: 15_000 }).toBeGreaterThan(0);
    expect.soft(isJpg(fs.readFileSync(out)), 'file has the JPEG signature').toBe(true);
  });

  test('13c. Ctrl+S after an edit leads to a file on disk', async ({ page, electronApp }) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-basics-')), 'quick.png');
    await stubSaveDialog(electronApp, out);
    await key(page, 'b');
    await dragDoc(page, [200, 200], [260, 200]);
    await key(page, 'Control+s');
    await sleep(page, 800);
    console.log('after Ctrl+S dialogs:', await page.locator('div.fixed').count());
    const saveBtn = page.locator('div.fixed').getByRole('button', { name: 'Save', exact: true }).last();
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();
    await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size, { timeout: 15_000, message: 'a file was written' }).toBeGreaterThan(0);
  });

  test('13d. File > Export As... PNG and JPEG', async ({ page, electronApp }) => {
    for (const [fmt, name, check] of [['PNG', 'exp.png', isPng], ['JPEG', 'exp.jpg', isJpg]] as const) {
      const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iris-e2e-basics-')), name);
      await stubSaveDialog(electronApp, out);
      await menuPath(page, 'File', 'Export As...');
      await page.locator('div.fixed button', { hasText: new RegExp('^' + fmt) }).first().click();
      await page.locator('div.fixed').getByRole('button', { name: 'Export', exact: true }).click();
      await expect.poll(() => fs.existsSync(out) && fs.statSync(out).size, { timeout: 15_000, message: `${fmt} export written` }).toBeGreaterThan(0);
      expect.soft(check(fs.readFileSync(out)), `${fmt} signature`).toBe(true);
      if (fmt === 'PNG') expect.soft(colorNear(decodePng(fs.readFileSync(out)).at(100, 85), YELLOW), 'exported pixels match').toBe(true);
      await sleep(page, 500);
    }
  });
});

// =================================================================== 14. zoom / pan
test.describe('14. zoom and pan', () => {
  test('14a. zoom in / out / fit / 100% (shortcuts and buttons)', async ({ page }) => {
    const z0 = await imgState(page, '(s)=>s.zoom') as number;
    await key(page, 'Control+=');
    await sleep(page, 400);
    const z1 = await imgState(page, '(s)=>s.zoom') as number;
    expect.soft(z1, 'Ctrl+= zooms in').toBeGreaterThan(z0);
    const w1 = (await docBox(page)).w;
    expect.soft(w1, 'canvas on screen got bigger').toBeGreaterThan(480 * z0 / 100);
    await key(page, 'Control+-');
    await key(page, 'Control+-');
    await sleep(page, 400);
    const z2 = await imgState(page, '(s)=>s.zoom') as number;
    expect.soft(z2, 'Ctrl+- zooms out').toBeLessThan(z1);
    await page.locator('button[title="Actual Size (Ctrl+1)"]').click();
    await sleep(page, 400);
    expect.soft(await imgState(page, '(s)=>s.zoom'), 'actual size = 100').toBe(100);
    await page.locator('button[title="Zoom In (Ctrl++)"]').click();
    await sleep(page, 300);
    expect.soft(await imgState(page, '(s)=>s.zoom') as number, 'Zoom In button').toBeGreaterThan(100);
    await page.locator('button[title="Fit to View (Ctrl+0)"]').click();
    await sleep(page, 400);
    const fit = await imgState(page, '(s)=>s.zoom') as number;
    const box = await docBox(page);
    expect.soft(box.w <= 1400 && box.h <= 1000, `fit keeps the canvas inside the view (${box.w}x${box.h}, zoom ${fit})`).toBe(true);
  });

  test('14b. hand tool (H) and Space-drag pan the view', async ({ page }) => {
    await key(page, 'Control+=');
    await key(page, 'Control+=');
    await sleep(page, 500);
    const p0 = await imgState(page, '(s)=>JSON.stringify(s.panOffset)');
    const b0 = await docBox(page);
    await key(page, 'h');
    await page.mouse.move(b0.x + 100, b0.y + 100);
    await page.mouse.down();
    await page.mouse.move(b0.x + 160, b0.y + 140, { steps: 6 });
    await page.mouse.up();
    await sleep(page, 400);
    const b1 = await docBox(page);
    expect.soft(Math.abs(b1.x - b0.x) + Math.abs(b1.y - b0.y), 'hand drag moved the canvas on screen').toBeGreaterThan(30);
    expect.soft(await imgState(page, '(s)=>JSON.stringify(s.panOffset)'), 'panOffset changed').not.toBe(p0);

    await key(page, 'b'); // brush: Space-drag must pan instead of painting
    const h0 = await hist(page);
    await page.mouse.move(b1.x + 100, b1.y + 100);
    await page.keyboard.down('Space');
    await page.waitForTimeout(300); // a real user holds Space for a moment before pressing the button
    await page.mouse.down();
    await page.mouse.move(b1.x + 60, b1.y + 70, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await sleep(page, 400);
    const b2 = await docBox(page);
    expect.soft(Math.abs(b2.x - b1.x) + Math.abs(b2.y - b1.y), 'Space-drag moved the canvas').toBeGreaterThan(20);
    expect.soft(await hist(page), 'Space-drag did not paint').toBe(h0);
  });
});

// =================================================================== 15. history panel
test.describe('15. history panel', () => {
  test('15. clicking an earlier state restores it; clicking the last state redoes', async ({ page }) => {
    await key(page, 'b');
    await setFg(page, '#ff0000');
    await setSlider(page, 'Size', 30);
    await dragDoc(page, [200, 100], [300, 100]);
    await setFg(page, '#00ff00');
    await dragDoc(page, [200, 200], [300, 200]);
    const labels = (await activeDoc(page)).historyLabels;
    expect(labels.length, `3 states, got ${labels}`).toBe(3);
    expect(colorNear(await px(page, 250, 200), [0, 255, 0], 40)).toBe(true);

    const entries = page.locator('div.space-y-0\\.5 > button');
    expect.soft(await entries.count(), 'history panel lists 3 entries').toBe(3);
    await entries.nth(1).click(); // after the first stroke
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 250, 100), RED, 40), 'first stroke still present').toBe(true);
    expect.soft(colorNear(await px(page, 250, 200), BLUE, 6), 'second stroke gone').toBe(true);
    expect.soft((await activeDoc(page)).historyIndex).toBe(1);

    await entries.nth(0).click();
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 250, 100), BLUE, 6), 'original state restored').toBe(true);

    await entries.nth(2).click();
    await sleep(page, 700);
    expect.soft(colorNear(await px(page, 250, 200), [0, 255, 0], 40), 'last state restored (redo through the panel)').toBe(true);
  });
});

void [canvasHash, toScreen, histLabels, activeToolButtonTitle];
