/**
 * E2E Probe — the extension fixture the extensions spec installs.
 *
 * This is a TEMPLATE, not a loadable extension: `__PROBE_GEN__` /
 * `__PROBE_SEMVER__` are substituted by `materializeProbe()` in
 * e2e/helpers/extension.helper.ts, which writes a real extension directory
 * into a temp dir. Two generations ("v1", "v2") are produced from this one
 * source so the upgrade-reinstall test can tell the running generation apart.
 *
 * Plain ESM JavaScript on purpose — no build step, no @parallax-ai/iris-extension-api
 * dependency. The extension host injects the `iris` global and the manager
 * writes `{"type":"module"}` into the install directory, so this file is loaded
 * as-is. (Keep the entry OUT of a `dist/` directory: the repo .gitignore drops
 * every `dist/`, which would silently un-commit the fixture.)
 *
 * Contributes every surface the spec asserts on:
 *   - command  e2etest.e2e-probe.hello     → toast "hello from extension <gen>"
 *   - command  e2etest.e2e-probe.fileInfo  → iris.image.getActiveFileInfo round trip
 *   - tool     e2etest.e2e-probe.probeTool → toast "tool ran <gen>"
 *   - status bar item "E2E-PROBE-STATUS <gen>"
 *   - panel    "E2E Probe Panel <gen>" (created at activation, so a restart has
 *              to re-hydrate it from the contribution snapshot)
 */

const GEN = '__PROBE_GEN__';

// No <script> in here: the sandbox assertions drive the iframe through
// Playwright instead, so the panel body only needs a generation marker.
const PANEL_HTML = `<div id="e2e-panel-body">E2E PANEL BODY ${GEN}</div>`;

export function activate(context) {
  // (a) command → toast, and a return value the caller can identify.
  context.subscriptions.push(
    iris.commands.register('e2etest.e2e-probe.hello', async () => {
      await iris.window.showMessage('hello from extension ' + GEN, 'info');
      return 'hello-return-' + GEN;
    })
  );

  // (b) status bar item.
  context.subscriptions.push(
    iris.window.setStatusBarItem('E2E-PROBE-STATUS ' + GEN, { tooltip: 'e2e probe status bar' })
  );

  // (c) iris.image round trip — main asks the renderer and waits for its reply,
  //     so a fast 'fileinfo-none' proves the bridge answered (a dead bridge
  //     only resolves via the 10s timeout in apiHandlers/imageApi.ts).
  context.subscriptions.push(
    iris.commands.register('e2etest.e2e-probe.fileInfo', async () => {
      const info = await iris.image.getActiveFileInfo();
      if (info) {
        await iris.window.showMessage(
          `fileinfo: ${info.fileName} ${info.width}x${info.height} ${info.format}`,
          'info'
        );
        return 'fileinfo-ok';
      }
      await iris.window.showMessage('fileinfo: no active image', 'warn');
      return 'fileinfo-none';
    })
  );

  // (d) tool contribution — run from the chip on the Extensions page.
  context.subscriptions.push(
    iris.tools.register(
      {
        id: 'e2etest.e2e-probe.probeTool',
        name: 'E2E Probe Tool',
        category: 'image',
        description: 'E2E verification tool',
      },
      async () => {
        await iris.window.showMessage('tool ran ' + GEN, 'info');
        return 'tool-return-' + GEN;
      }
    )
  );

  // (e) panel — created at activation so restart must restore it (F-2).
  void iris.window
    .createPanel(PANEL_HTML, { title: 'E2E Probe Panel ' + GEN, location: 'sidebar' })
    .then((id) => iris.log.info('panel created: ' + id))
    .catch((e) => iris.log.info('panel failed: ' + String(e)));

  iris.log.info('E2E Probe activated ' + GEN);
}

export function deactivate() {}
