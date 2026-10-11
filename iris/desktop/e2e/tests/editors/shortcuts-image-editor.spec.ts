import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import {
  openImageEditor,
  imageState,
  currentPage,
  readStore,
  blurActive,
  cdpKey,
  imeKey,
} from '../../helpers/shortcut.helper';

/**
 * Image editor keyboard-shortcut regression suite.
 *
 * Covers the central shortcut dispatcher (src/shared/lib/shortcuts) and
 * IMAGE_EDITOR_KEYMAP. The editor is opened on a locally drawn document, no
 * server data is needed and nothing is written to any API.
 *
 * Keys are sent with page.keyboard.press unless the test is about IME /
 * CapsLock, which need an exact key/code/keyCode triple (see cdpKey).
 */

/** Ctrl+A then Delete: the one pixel edit that is reachable by keyboard only. */
async function makeEditByKeyboard(page: Page): Promise<void> {
  const before = (await imageState(page)).historyLength;
  await blurActive(page);
  await page.keyboard.press('Control+a');
  await expect.poll(async () => (await imageState(page)).hasSelection).toBe(true);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await imageState(page)).historyLength, { timeout: 10_000 }).toBeGreaterThan(before);
}

async function setState(page: Page, fn: (s: any) => void): Promise<void> {
  await page.evaluate((src) => {
    const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => unknown }> })
      .__ZUSTAND_STORES__;
    // eslint-disable-next-line no-new-func
    new Function('s', `(${src})(s)`)(stores.imageEditor.getState());
  }, fn.toString());
}

test.describe('Image editor shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await openImageEditor(page);
  });

  // 1 ---------------------------------------------------------------------
  test('Ctrl+Z undoes and Ctrl+Shift+Z redoes an edit', async ({ page }) => {
    await makeEditByKeyboard(page);
    const afterEdit = await imageState(page);
    expect(afterEdit.historyIndex).toBe(afterEdit.historyLength - 1);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await imageState(page)).historyIndex).toBe(afterEdit.historyIndex - 1);

    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await imageState(page)).historyIndex).toBe(afterEdit.historyIndex);

    // Redo must not also be taken for undo (Ctrl+Shift+Z must not match Ctrl+Z).
    const s = await imageState(page);
    expect(s.historyLength).toBe(afterEdit.historyLength);
  });

  // 2 ---------------------------------------------------------------------
  test.describe('Korean IME active (key = Process / hangul, keyCode 229)', () => {
    for (const asProcess of [true, false]) {
      const variant = asProcess ? 'key "Process"' : 'key "ㅍ" etc.';

      test(`tool letters V / C / B / M switch tools (${variant})`, async ({ page }) => {
        await setState(page, (s) => s.setEditMode('none'));
        await cdpKey(page, imeKey('KeyV', 'ㅍ', {}, asProcess));
        await expect.poll(async () => (await imageState(page)).editMode).toBe('move');

        await cdpKey(page, imeKey('KeyC', 'ㅊ', {}, asProcess));
        await expect.poll(async () => (await imageState(page)).editMode).toBe('crop');

        await cdpKey(page, imeKey('KeyB', 'ㅠ', {}, asProcess));
        await expect
          .poll(async () => {
            const s = await imageState(page);
            return `${s.editMode}/${s.activeTool}`;
          })
          .toBe('drawing/brush');

        await cdpKey(page, imeKey('KeyM', 'ㅡ', {}, asProcess));
        await expect
          .poll(async () => {
            const s = await imageState(page);
            return `${s.editMode}/${s.selectionTool}`;
          })
          .toBe('selection/rectangle');
      });

      test(`[ ] brush size, D / X colors (${variant})`, async ({ page }) => {
        const start = await imageState(page);

        await cdpKey(page, imeKey('BracketRight', ']', {}, asProcess));
        await expect.poll(async () => (await imageState(page)).brushSize).toBe(start.brushSize + 5);
        await cdpKey(page, imeKey('BracketLeft', '[', {}, asProcess));
        await expect.poll(async () => (await imageState(page)).brushSize).toBe(start.brushSize);

        await setState(page, (s) => {
          s.setBrushSettings({ color: '#123456' });
          s.setBackgroundColor('#abcdef');
        });
        await cdpKey(page, imeKey('KeyX', 'ㅌ', {}, asProcess)); // swap
        await expect
          .poll(async () => {
            const s = await imageState(page);
            return `${s.brushColor}/${s.backgroundColor}`;
          })
          .toBe('#abcdef/#123456');

        await cdpKey(page, imeKey('KeyD', 'ㅇ', {}, asProcess)); // defaults
        await expect
          .poll(async () => {
            const s = await imageState(page);
            return `${s.brushColor}/${s.backgroundColor}`;
          })
          .toBe('#000000/#ffffff');
      });

      test(`Ctrl+Z undo works (${variant})`, async ({ page }) => {
        await makeEditByKeyboard(page);
        const afterEdit = await imageState(page);
        await cdpKey(page, imeKey('KeyZ', 'ㅋ', { ctrl: true }, asProcess));
        await expect.poll(async () => (await imageState(page)).historyIndex).toBe(afterEdit.historyIndex - 1);
      });
    }
  });

  test('CapsLock on (key "Z"/"V"/"B" without shift) still triggers shortcuts', async ({ page }) => {
    await makeEditByKeyboard(page);
    const afterEdit = await imageState(page);

    await cdpKey(page, { key: 'Z', code: 'KeyZ', keyCode: 90, ctrl: true });
    await expect.poll(async () => (await imageState(page)).historyIndex).toBe(afterEdit.historyIndex - 1);

    await setState(page, (s) => s.setEditMode('none'));
    await cdpKey(page, { key: 'V', code: 'KeyV', keyCode: 86, text: 'V' });
    await expect.poll(async () => (await imageState(page)).editMode).toBe('move');

    await cdpKey(page, { key: 'B', code: 'KeyB', keyCode: 66, text: 'B' });
    await expect
      .poll(async () => {
        const s = await imageState(page);
        return `${s.editMode}/${s.activeTool}`;
      })
      .toBe('drawing/brush');
  });

  // 3 ---------------------------------------------------------------------
  test('Ctrl+0 / Ctrl+1 change zoom only and stay in the editor', async ({ page }) => {
    const pageBefore = await currentPage(page);
    await setState(page, (s) => s.setZoom(250));
    expect((await imageState(page)).zoom).toBe(250);

    await page.keyboard.press('Control+1');
    await expect.poll(async () => (await imageState(page)).zoom).toBe(100);
    expect(await currentPage(page)).toBe(pageBefore);

    await setState(page, (s) => s.setZoom(250));
    await page.keyboard.press('Control+0');
    await expect.poll(async () => (await imageState(page)).zoom).not.toBe(250);
    expect(await currentPage(page)).toBe(pageBefore);

    // Still inside the editor: tabs open and the shell nav is not rendered.
    expect(await readStore(page, 'editorTabs', (s) => s.isEditorVisible as boolean)).toBe(true);
    await expect(page.locator('nav')).toHaveCount(0);
  });

  test('Ctrl+Y toggles Proof Colors, Ctrl+Shift+Y toggles Gamut Warning', async ({ page }) => {
    const start = await imageState(page);
    expect(start.colorProofing).toBe(false);
    expect(start.gamutWarning).toBe(false);

    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await imageState(page)).colorProofing).toBe(true);
    expect((await imageState(page)).gamutWarning).toBe(false);

    await page.keyboard.press('Control+Shift+y');
    await expect.poll(async () => (await imageState(page)).gamutWarning).toBe(true);
    expect((await imageState(page)).colorProofing).toBe(true); // untouched by the second shortcut

    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await imageState(page)).colorProofing).toBe(false);
  });

  // 4 ---------------------------------------------------------------------
  const dialogs: Array<{ keys: string; mode: string; heading: string }> = [
    { keys: 'Control+Alt+c', mode: 'canvasSize', heading: 'Canvas Size' },
    { keys: 'Control+Alt+i', mode: 'imageSize', heading: 'Image Size' },
    { keys: 'Control+Alt+Shift+w', mode: 'export', heading: 'Export As' },
  ];
  for (const d of dialogs) {
    test(`${d.keys} opens the ${d.heading} dialog`, async ({ page }) => {
      await page.keyboard.press(d.keys);
      await expect.poll(async () => (await imageState(page)).editMode).toBe(d.mode);
      await expect(page.locator(`h2:text-is("${d.heading}")`)).toBeVisible({ timeout: 5_000 });
    });
  }

  test('Ctrl+Alt+Shift+E (Stamp Visible) adds one layer', async ({ page }) => {
    const before = await imageState(page);
    await page.keyboard.press('Control+Alt+Shift+e');
    await expect.poll(async () => (await imageState(page)).layerCount).toBe(before.layerCount + 1);
    // One press, one layer (a doubled handler would add two).
    await page.waitForTimeout(500);
    expect((await imageState(page)).layerCount).toBe(before.layerCount + 1);
  });

  test('Q toggles Quick Mask', async ({ page }) => {
    expect((await imageState(page)).quickMask).toBe(false);
    await page.keyboard.press('q');
    await expect.poll(async () => (await imageState(page)).quickMask).toBe(true);
    await page.keyboard.press('q');
    await expect.poll(async () => (await imageState(page)).quickMask).toBe(false);
  });

  // 5 ---------------------------------------------------------------------
  test('Save As dialog: typing, Ctrl+A overwrite, Esc closes, editor shortcuts blocked while open', async ({ page }) => {
    await setState(page, (s) => s.setEditMode('crop'));
    const before = await imageState(page);

    await page.keyboard.press('Control+Shift+s');
    const input = page.locator('input[placeholder="image"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await expect(input).toBeFocused();

    // Typing letters that are tool shortcuts (v, c, b, m, q, d, x) must land in the field.
    await page.keyboard.type('vcbmqdx');
    await expect(input).toHaveValue(/vcbmqdx$/);
    expect((await imageState(page)).editMode).toBe('crop');
    expect((await imageState(page)).quickMask).toBe(false);

    // Ctrl+A selects the field text (not the canvas), the next typing overwrites it.
    await page.keyboard.press('Control+a');
    await page.keyboard.type('overwritten');
    await expect(input).toHaveValue('overwritten');
    expect((await imageState(page)).hasSelection).toBe(false);

    // Editor shortcuts must not run underneath the dialog, even with focus off the input.
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await page.keyboard.press('v');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    await page.keyboard.press('Control+0');
    const during = await imageState(page);
    expect(during.editMode).toBe('crop');
    expect(during.historyIndex).toBe(before.historyIndex);
    expect(during.colorProofing).toBe(false);
    expect(during.zoom).toBe(before.zoom);
    await expect(input).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0, { timeout: 5_000 });
    // The same Esc must not have also left crop mode behind the dialog.
    expect((await imageState(page)).editMode).toBe('crop');
  });

  // 6 ---------------------------------------------------------------------
  test('text tool: shortcut letters are typed as text and do not switch tools', async ({ page }) => {
    const brushBefore = (await imageState(page)).brushSize;
    await page.keyboard.press('t');
    await expect.poll(async () => (await imageState(page)).editMode).toBe('text');

    // Start a text box by clicking the document.
    const overlay = page.locator('div.absolute.inset-0[style*="cursor: text"]');
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 3, box!.y + box!.height / 3);

    const editable = page.locator('[contenteditable="true"]');
    await expect(editable).toBeVisible({ timeout: 5_000 });
    await expect(editable).toBeFocused(); // focus is applied on the next animation frame

    await page.keyboard.type('vcbmqxd[]');
    await expect(editable).toHaveText('vcbmqxd[]');
    const s = await imageState(page);
    expect(s.editMode).toBe('text');
    expect(s.quickMask).toBe(false);
    expect(s.brushSize).toBe(brushBefore);
  });

  // 7 ---------------------------------------------------------------------
  test('Ctrl+A then Delete erases the selection and adds exactly one history entry', async ({ page }) => {
    const before = await imageState(page);
    await blurActive(page);

    await page.keyboard.press('Control+a');
    await expect.poll(async () => (await imageState(page)).hasSelection).toBe(true);
    const selected = await imageState(page);

    await page.keyboard.press('Delete');
    await expect.poll(async () => (await imageState(page)).historyLength).toBe(selected.historyLength + 1);
    await page.waitForTimeout(500);
    const after = await imageState(page);
    expect(after.historyLength).toBe(selected.historyLength + 1); // once, not twice
    expect(after.hasSelection).toBe(false);
    expect(after.layerCount).toBe(before.layerCount);

    // The background layer really lost its pixels (centre of the yellow block was opaque).
    const alpha = await page.evaluate(async () => {
      const stores = (window as unknown as { __ZUSTAND_STORES__: Record<string, { getState: () => any }> })
        .__ZUSTAND_STORES__;
      const layer = stores.imageEditor.getState().layers[0];
      const img = new Image();
      img.src = layer.imageData;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(100, 80, 1, 1).data[3];
    });
    expect(alpha).toBe(0);
  });
});
