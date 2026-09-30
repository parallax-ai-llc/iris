// @vitest-environment node
/**
 * The extension host (and every extension worker, which inherits its env) must
 * not receive the user's BYOK provider keys. ipc/iris.ts `applyKeys()` merges
 * them — including safeStorage-decrypted overrides — into main's process.env.
 */
import { describe, it, expect } from 'vitest';
import { buildExtensionHostEnv } from '../extensionHost';

describe('buildExtensionHostEnv', () => {
  const parentEnv: NodeJS.ProcessEnv = {
    PATH: '/usr/bin',
    SystemRoot: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    HOME: '/home/user',
    LANG: 'en_US.UTF-8',
    // Secrets that live in main's process.env at runtime:
    OPENAI_API_KEY: 'sk-live-openai',
    ANTHROPIC_API_KEY: 'sk-ant-live',
    REPLICATE_API_KEY: 'r8_live',
    VITE_ENCRYPTION_KEY: 'renderer-envelope-key',
    NODE_OPTIONS: '--require /tmp/inject.js',
    ELECTRON_RUN_AS_NODE: undefined,
  };

  it('passes only what Node needs to run', () => {
    const env = buildExtensionHostEnv(parentEnv);
    expect(env).toEqual({
      PATH: '/usr/bin',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      HOME: '/home/user',
      LANG: 'en_US.UTF-8',
      ELECTRON_RUN_AS_NODE: '1',
      IRIS_EXT_HOST: '1',
    });
  });

  it('never forwards provider keys or NODE_OPTIONS', () => {
    const env = buildExtensionHostEnv(parentEnv);
    const values = Object.values(env).join('\n');
    expect(values).not.toContain('sk-');
    expect(values).not.toContain('r8_live');
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.VITE_ENCRYPTION_KEY).toBeUndefined();
  });

  it('always runs the forked host as Node', () => {
    expect(buildExtensionHostEnv({}).ELECTRON_RUN_AS_NODE).toBe('1');
  });
});
