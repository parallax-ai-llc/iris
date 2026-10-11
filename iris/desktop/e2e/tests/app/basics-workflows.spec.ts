import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/authenticated.fixture';
import { readStore, blurActive } from '../../helpers/shortcut.helper';
import {
  assertClean,
  createWorkflowViaEngine,
  deleteWorkflowsCreatedSince,
  engineBase,
  getWorkflow,
  goTo,
  listWorkflowIds,
  preparePage,
  type ErrorLog,
} from '../../helpers/pages.helper';

/**
 * Basic-feature specs, part 3: Workflows (7), on the embedded local engine.
 *
 * The editor is driven through the user path: sidebar -> "New workflow" -> palette drag -> handle
 * drag -> Ctrl+Z / Ctrl+Shift+Z -> Delete key -> Save -> Run. Only nodes that run on the machine
 * without credits are used (Manual Trigger -> Transform); nothing here calls an AI provider.
 * Workflows created by a test are removed from the local engine afterwards.
 */

let errors: ErrorLog;
let workflowsBefore: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = await preparePage(page);
  workflowsBefore = await listWorkflowIds(page).catch(() => []);
});
test.afterEach(async ({ page }) => {
  await assertClean(page, errors);
  await deleteWorkflowsCreatedSince(page, workflowsBefore);
});

// ------------------------------------------------------------------ helpers

const nodes = (page: Page) => page.locator('.react-flow__node');
const edges = (page: Page) => page.locator('.react-flow__edge');

async function openNewWorkflow(page: Page): Promise<void> {
  await goTo(page, 'Workflows');
  await expect(page.locator('h1:has-text("Workflows")')).toBeVisible({ timeout: 15_000 });
  await page.locator('button:text-is("New workflow")').click();
  await expect(page.locator('.iris-editor-host')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.react-flow__pane')).toBeVisible();
}

/** Drag a node from the palette onto the canvas (real drag first, synthetic DnD events as fallback). */
async function addNode(page: Page, label: string, at: { x: number; y: number }): Promise<void> {
  const before = await nodes(page).count();
  await page.locator('input[placeholder*="nodes"]').fill(label);
  const item = page.locator('.we-lib-item', { hasText: label }).first();
  await expect(item, `palette entry "${label}"`).toBeVisible({ timeout: 10_000 });
  await item.dragTo(page.locator('.react-flow__pane'), { targetPosition: at });
  const grew = await expect
    .poll(() => nodes(page).count(), { timeout: 2_500 })
    .toBe(before + 1)
    .then(() => true, () => false);
  if (!grew) {
    // Playwright's mouse drag did not produce HTML5 dragstart/drop under this Electron build:
    // replay the same events the browser would (what the canvas listens to) and note it.
    test.info().annotations.push({ type: 'drag-fallback', description: `palette drag of "${label}" needed synthetic DnD events` });
    const box = (await page.locator('.react-flow__pane').boundingBox())!;
    await page.evaluate(
      ({ label, x, y }) => {
        const el = [...document.querySelectorAll('.we-lib-item')].find((e) => e.textContent?.includes(label)) as HTMLElement;
        const dt = new DataTransfer();
        el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const pane = document.querySelector('.react-flow__pane') as HTMLElement;
        const init = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y };
        pane.dispatchEvent(new DragEvent('dragover', init));
        pane.dispatchEvent(new DragEvent('drop', init));
      },
      { label, x: box.x + at.x, y: box.y + at.y },
    );
  }
  await expect.poll(() => nodes(page).count(), { timeout: 5_000 }).toBe(before + 1);
}

async function nodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id') ?? ''));
}

/** Drag from an output handle to an input handle with the mouse. */
async function connect(page: Page, fromNode: string, fromPort: string, toNode: string, toPort: string): Promise<void> {
  const src = page.locator(`.react-flow__node[data-id="${fromNode}"] .react-flow__handle[data-handleid="${fromPort}"]`).first();
  const dst = page.locator(`.react-flow__node[data-id="${toNode}"] .react-flow__handle[data-handleid="${toPort}"]`).first();
  const a = (await src.boundingBox())!;
  const b = (await dst.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 20, b.y + b.height / 2, { steps: 6 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Two nodes (Manual Trigger, Transform) added through the palette. */
async function buildTwoNodes(page: Page): Promise<{ trigger: string; transform: string }> {
  await openNewWorkflow(page);
  await addNode(page, 'Manual Trigger', { x: 120, y: 160 });
  await addNode(page, 'Transform', { x: 520, y: 160 });
  const ids = await nodeIds(page);
  expect(ids).toHaveLength(2);
  return { trigger: ids[0], transform: ids[1] };
}

const press = async (page: Page, combo: string) => {
  await blurActive(page);
  await page.keyboard.press(combo);
  await page.waitForTimeout(350);
};

// ------------------------------------------------------------------ tests

test.describe('7. Workflows', () => {
  test('list: New workflow opens the editor shell (canvas, palette, header)', async ({ page }) => {
    await openNewWorkflow(page);
    await expect(page.locator('input[placeholder*="nodes"]')).toBeVisible();
    await expect(page.locator('button:has(span:text-is("Save"))').first()).toBeVisible();
    expect(await nodes(page).count()).toBe(0);
  });

  test('palette search filters the node list', async ({ page }) => {
    await openNewWorkflow(page);
    const search = page.locator('input[placeholder*="nodes"]');
    await search.fill('Manual');
    const hits = await page.locator('.we-lib-item').allTextContents();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(' | ')).toContain('Manual Trigger');
    await search.fill('zzzz-no-such-node');
    expect(await page.locator('.we-lib-item').count()).toBe(0);
  });

  test('adding nodes from the palette places them on the canvas', async ({ page }) => {
    await buildTwoNodes(page);
    await expect(nodes(page)).toHaveCount(2);
  });

  test('connecting two nodes creates an edge; undo removes it and redo restores it', async ({ page }) => {
    const { trigger, transform } = await buildTwoNodes(page);
    await connect(page, trigger, 'text', transform, 'input');
    await expect(edges(page)).toHaveCount(1);

    await press(page, 'Control+z');
    await expect(edges(page), 'undo removes the connection').toHaveCount(0);
    await press(page, 'Control+Shift+z');
    await expect(edges(page), 'redo restores the connection').toHaveCount(1);
  });

  test('deleting a node (Delete key + confirmation) and undoing it', async ({ page }) => {
    const { transform } = await buildTwoNodes(page);
    await page.locator(`.react-flow__node[data-id="${transform}"]`).click({ position: { x: 20, y: 12 } });
    await press(page, 'Delete');
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await expect(nodes(page)).toHaveCount(1);

    await press(page, 'Control+z');
    await expect(nodes(page), 'undo brings the node back').toHaveCount(2);
    await press(page, 'Control+Shift+z');
    await expect(nodes(page)).toHaveCount(1);
  });

  test('Save writes the graph to the local engine', async ({ page }) => {
    const { trigger, transform } = await buildTwoNodes(page);
    await connect(page, trigger, 'text', transform, 'input');
    await expect(edges(page)).toHaveCount(1);

    const id = await readStore(page, 'ui', (s) => s.editingWorkflowId as string);
    expect(id).toBeTruthy();
    const save = page.locator('button:has(span:text-is("Save"))').first();
    await expect(save).toBeEnabled(); // dirty
    await save.click();
    await expect(save, 'Save is disabled again once persisted').toBeDisabled({ timeout: 15_000 });

    const saved = await getWorkflow(page, id);
    expect(saved?.nodes.map((n) => n.type).sort()).toEqual(['TRIGGER_MANUAL', 'UTIL_TRANSFORM']);
    expect(saved?.edges).toHaveLength(1);

    // back to the list: the card shows the persisted node count
    await page.locator('button[title="Back to Workflows"]').click();
    await expect(page.locator('h1:has-text("Workflows")')).toBeVisible();
    await expect(page.locator('text=2 nodes').first()).toBeVisible({ timeout: 10_000 });
  });

  test('runs a local non-AI graph (Manual Trigger -> Transform: uppercase) and shows the result', async ({ page }) => {
    const id = await createWorkflowViaEngine(page, {
      name: 'E2E Run Local',
      nodes: [
        {
          id: 't1', nodeId: 't1', type: 'TRIGGER_MANUAL', label: 'Manual Trigger',
          config: { position: { x: 120, y: 160 }, settings: { inputType: 'text' } }, inputPorts: [], outputPorts: [],
        },
        {
          id: 'x1', nodeId: 'x1', type: 'UTIL_TRANSFORM', label: 'Transform',
          config: { position: { x: 520, y: 160 }, settings: { transformation: 'toUpperCase' } }, inputPorts: [], outputPorts: [],
        },
      ],
      edges: [{ edgeId: 'e1', sourceNodeId: 't1', targetNodeId: 'x1', sourceHandle: 'text', targetHandle: 'input' }],
    });

    await goTo(page, 'Workflows');
    await page.locator('button', { hasText: 'E2E Run Local' }).click(); // card -> editor (user path)
    await expect(page.locator('.iris-editor-host')).toBeVisible({ timeout: 30_000 });
    await expect(nodes(page)).toHaveCount(2, { timeout: 15_000 });

    await page.locator('button:has(span:text-is("Run"))').first().click();
    // the Manual Trigger asks for its text input
    const input = page.locator('textarea').last();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('hello e2e');
    await page.locator('button:has-text("Run Workflow")').click();

    // the local engine finishes the execution...
    const base = await engineBase(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            async ({ b, id }) => {
              const r = await fetch(`${b}/api/iris/executions?workflowId=${id}`);
              const j = (await r.json()) as { executions?: Array<{ status: string }> };
              return j.executions?.[0]?.status ?? 'NONE';
            },
            { b: base, id },
          ),
        { timeout: 60_000, intervals: [500, 1_000] },
      )
      .toBe('COMPLETED');

    // ...and the result is visible on the canvas
    await expect(page.getByText('HELLO E2E').first(), 'Transform output shown on its node').toBeVisible({ timeout: 15_000 });
  });

  test('deleting a workflow from the list removes it (native confirm accepted)', async ({ page }) => {
    const id = await createWorkflowViaEngine(page, { name: 'E2E Delete Me', nodes: [], edges: [] });
    await goTo(page, 'Workflows');
    const card = page.locator('button', { hasText: 'E2E Delete Me' });
    await expect(card).toBeVisible({ timeout: 10_000 });
    page.once('dialog', (d) => void d.accept());
    await card.hover();
    await card.locator('span[class*="opacity-0"]').click();
    await expect(card).toHaveCount(0, { timeout: 10_000 });
    expect(await getWorkflow(page, id)).toBeNull();
  });

  test('opening a saved workflow from the list shows its nodes', async ({ page }) => {
    await createWorkflowViaEngine(page, {
      name: 'E2E Open Me',
      nodes: [
        { id: 'a', nodeId: 'a', type: 'TRIGGER_MANUAL', label: 'Manual Trigger', config: { position: { x: 100, y: 100 } }, inputPorts: [], outputPorts: [] },
      ],
      edges: [],
    });
    await goTo(page, 'Workflows');
    await page.locator('button', { hasText: 'E2E Open Me' }).click();
    await expect(page.locator('.iris-editor-host')).toBeVisible({ timeout: 30_000 });
    await expect(nodes(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('text=E2E Open Me').first()).toBeVisible();
  });
});
