/**
 * Global type bindings for the example extensions.
 *
 * Extension code never imports the API — the host injects a global `iris`
 * object before `activate()` runs. Importing the SDK type module here pulls
 * in its `declare global { const iris: IrisApi }` declaration so every
 * example typechecks against the real API surface.
 *
 * Real-world extensions get the same globals by installing the SDK:
 *   npm install --save-dev @parallax-ai/iris-extension-api
 */
import type { ExtensionContext } from '../../../../sdk/ts/iris-extension-api/src/index';

declare global {
  /** Convenience alias used throughout the examples (SDK name: ExtensionContext). */
  type IrisExtensionContext = ExtensionContext;
}

export {};
