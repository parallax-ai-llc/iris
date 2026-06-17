import { test, expect } from '../../fixtures/authenticated.fixture';
import { safeClick, safeExpectVisible, assertStep } from '../../helpers/step.helper';

/**
 * Workflow editor — shared iris-editor mounted against the embedded local
 * engine (src/app/workflows/WorkflowEditorPage.tsx + desktop-seams.ts).
 *
 * Verifies the two things most likely to regress after the cloud→local rewrite:
 *  1. The editor MOUNTS without freezing (the seam-stable-refs render-loop trap).
 *  2. Validate round-trips to the local engine and the server-mirror message
 *     `Node "<label>" requires …` lights the offending node up.
 *
 * Selectors:
 *   - Editor host:   .iris-editor-host          (WorkflowEditorPage)
 *   - Canvas:        .react-flow                 (@xyflow/react)
 *   - Node palette:  input[placeholder*="nodes"] (NodePalette search)
 *   - Validate btn:  button:has-text("Validate") (EditorHeader)
 */

test.describe('Workflow editor (local engine)', () => {
  test.beforeEach(async ({ page }) => {
    assertStep(
      await safeClick(
        page,
        'button:has-text("Workflows")',
        'Navigate to Workflows',
        { timeout: 15_000 }
      )
    );
    await expect(page.locator('h1:has-text("Workflows")')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('New workflow mounts the editor (host + canvas + palette, no freeze)', async ({
    page,
  }) => {
    assertStep(
      await safeClick(
        page,
        'button:has-text("New workflow")',
        'Create new workflow'
      )
    );

    // The editor shell replaces the page (App routes on editingWorkflowId).
    assertStep(
      await safeExpectVisible(
        page,
        '.iris-editor-host',
        'iris-editor host mounted',
        { timeout: 20_000 }
      )
    );
    assertStep(
      await safeExpectVisible(page, '.react-flow', 'ReactFlow canvas visible')
    );

    const paletteSearch = page.locator('input[placeholder*="nodes"]');
    assertStep(
      await safeExpectVisible(
        page,
        'input[placeholder*="nodes"]',
        'Node palette search visible'
      )
    );

    // Responsiveness check: typing into the palette must filter without the UI
    // locking up (a render loop would hang the input / time out here).
    await paletteSearch.fill('text');
    await expect(paletteSearch).toHaveValue('text', { timeout: 5_000 });
  });

  test('Validate lights up a misconfigured node ("requires a model/provider")', async ({
    page,
  }) => {
    // Seed a single GEN_TEXT_TO_TEXT node (no model/provider, unconnected) via
    // the local engine REST, then open it. This is the exact graph that the
    // server-mirror validator (iris-host-local/validate.ts) flags.
    const baseUrl = await page.evaluate(
      () =>
        (
          window as unknown as {
            electronAPI: { iris: { getApiBaseUrl: () => Promise<string> } };
          }
        ).electronAPI.iris.getApiBaseUrl()
    );
    expect(baseUrl, 'local engine base URL').toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+/);

    const workflowId = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/iris/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Validate',
          nodes: [
            {
              id: 'gen1',
              nodeId: 'gen1',
              type: 'GEN_TEXT_TO_TEXT',
              label: 'Gen Text',
              config: { position: { x: 160, y: 160 } },
              inputPorts: [],
              outputPorts: [],
            },
          ],
          edges: [],
        }),
      });
      const json = (await res.json()) as { workflow?: { id: string } };
      return json.workflow?.id ?? null;
    }, baseUrl);

    expect(workflowId, 'seeded workflow id').toBeTruthy();

    // Open it in the editor via the dev-exposed UI store.
    await page.evaluate((id) => {
      (
        window as unknown as {
          __ZUSTAND_STORES__: {
            ui: { getState: () => { setEditingWorkflowId: (id: string) => void } };
          };
        }
      ).__ZUSTAND_STORES__.ui.getState().setEditingWorkflowId(id);
    }, workflowId);

    assertStep(
      await safeExpectVisible(
        page,
        '.iris-editor-host',
        'editor mounted for seeded workflow',
        { timeout: 20_000 }
      )
    );

    // The seeded node should render on the canvas.
    await expect(page.locator('text=Gen Text').first()).toBeVisible({
      timeout: 15_000,
    });

    assertStep(
      await safeClick(
        page,
        'button:has-text("Validate")',
        'Run Validate',
        { timeout: 15_000 }
      )
    );

    // The header surfaces the validation failure as an error count badge.
    await expect(
      page.locator('button:has-text("error")').first()
    ).toBeVisible({ timeout: 15_000 });

    // The offending node lights up with the validation banner. handleValidate
    // maps `Node "<label>" requires a model/provider …` (server-mirror message)
    // back to the node and shows the localized suggestion ("Please select a
    // provider"/"… model") inline — proving the regex→node mapping works.
    await expect(
      page.locator('text=/select a (model|provider)/i').first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
