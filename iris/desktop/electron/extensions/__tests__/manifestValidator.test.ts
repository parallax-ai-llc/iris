// @vitest-environment node
/**
 * Unit tests for electron/extensions/manifestValidator.ts
 *
 * Pure Node module — no Electron mocks required.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateManifest, loadManifest } from '../manifestValidator';
import { PERMISSIONS } from '../ipcProtocol';

function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // id must equal `<publisher>.<name>` (same rule as the server validator);
    // the human-readable label lives in displayName.
    id: 'pub.my-ext',
    name: 'my-ext',
    displayName: 'My Extension',
    version: '1.0.0',
    main: './dist/index.js',
    publisher: 'pub',
    activationEvents: ['onStartup'],
    permissions: [],
    ...overrides,
  };
}

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-manifest-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateManifest — required fields', () => {
  it('accepts a valid minimal manifest', () => {
    const result = validateManifest(baseManifest());
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.manifest?.id).toBe('pub.my-ext');
  });

  it('rejects non-object input', () => {
    for (const input of [null, undefined, 'string', 42]) {
      const result = validateManifest(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest must be a JSON object');
    }
  });

  it('rejects invalid id patterns', () => {
    for (const id of ['UPPER.case', 'no-dot', 'pub.ext.extra', 'pub.', '.ext', 'pub.ext!', undefined]) {
      const result = validateManifest(baseManifest({ id }));
      expect(result.valid, `id should be rejected: ${String(id)}`).toBe(false);
      expect(result.errors.some((e) => e.includes('"id"'))).toBe(true);
    }
  });

  it('accepts lowercase alphanumeric ids with hyphens', () => {
    for (const id of ['pub.ext', 'my-publisher.my-extension-2', 'a.b']) {
      const [publisher, name] = id.split('.');
      const result = validateManifest(baseManifest({ id, publisher, name }));
      expect(result.valid, `id should be accepted: ${id}`).toBe(true);
    }
  });

  it('rejects an id that does not equal "<publisher>.<name>"', () => {
    const result = validateManifest(baseManifest({ id: 'pub.my-ext', publisher: 'other', name: 'my-ext' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"id" must equal "<publisher>.<name>"'))).toBe(true);

    const nameMismatch = validateManifest(baseManifest({ id: 'pub.my-ext', name: 'My Extension' }));
    expect(nameMismatch.valid).toBe(false);
    expect(nameMismatch.errors.some((e) => e.includes('"id" must equal "<publisher>.<name>"'))).toBe(true);
  });

  it('rejects missing or empty name / main / publisher', () => {
    for (const field of ['name', 'main', 'publisher']) {
      for (const value of [undefined, '', '   ']) {
        const result = validateManifest(baseManifest({ [field]: value }));
        expect(result.valid, `${field}=${JSON.stringify(value)} should fail`).toBe(false);
        expect(result.errors.some((e) => e.includes(`"${field}"`))).toBe(true);
      }
    }
  });

  it('validates semver versions', () => {
    for (const version of ['1.0.0', '0.1.2', '2.0.0-beta.1', '1.0.0-rc.2']) {
      expect(validateManifest(baseManifest({ version })).valid, version).toBe(true);
    }
    for (const version of ['1.0', 'v1.0.0', 'not-semver', '', undefined]) {
      const result = validateManifest(baseManifest({ version }));
      expect(result.valid, String(version)).toBe(false);
      expect(result.errors.some((e) => e.includes('"version"'))).toBe(true);
    }
  });

  it('warns (does not fail) on a suspicious engineVersion', () => {
    const result = validateManifest(baseManifest({ engineVersion: 'latest!!' }));
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('engineVersion'))).toBe(true);
  });
});

describe('validateManifest — activationEvents', () => {
  it('accepts all valid activation event forms', () => {
    const result = validateManifest(
      baseManifest({
        activationEvents: [
          'onStartup',
          'onImageOpen',
          'onCommand:pub.my-ext.hello',
          'onCommand:*',
          'onTool:pub.my-ext.tool',
          'onWorkflowNode:pub.node',
          'onView:pub.panel',
        ],
      }),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('rejects missing, empty, or non-array activationEvents', () => {
    for (const activationEvents of [undefined, [], 'onStartup']) {
      const result = validateManifest(baseManifest({ activationEvents }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('activationEvents'))).toBe(true);
    }
  });

  it('rejects unknown activation events', () => {
    const result = validateManifest(baseManifest({ activationEvents: ['onSomethingElse'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('onSomethingElse'))).toBe(true);
  });
});

describe('validateManifest — permissions', () => {
  it('accepts every permission in the catalog (including export:configure)', () => {
    const result = validateManifest(baseManifest({ permissions: [...PERMISSIONS] }));
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(PERMISSIONS).toContain('export:configure');
  });

  it('rejects unknown permissions and non-array permissions', () => {
    const unknown = validateManifest(baseManifest({ permissions: ['root:everything'] }));
    expect(unknown.valid).toBe(false);
    expect(unknown.errors.some((e) => e.includes('root:everything'))).toBe(true);

    const notArray = validateManifest(baseManifest({ permissions: 'network' }));
    expect(notArray.valid).toBe(false);
    expect(notArray.errors.some((e) => e.includes('"permissions"'))).toBe(true);
  });
});

describe('validateManifest — contributes', () => {
  it('rejects non-object contributes', () => {
    const result = validateManifest(baseManifest({ contributes: 'nope' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"contributes"'))).toBe(true);
  });

  it('validates commands: bad id and missing title', () => {
    const result = validateManifest(
      baseManifest({
        contributes: { commands: [{ command: 'has spaces!', title: '' }, 'not-an-object'] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Command id must match'))).toBe(true);
    expect(result.errors.some((e) => e.includes('missing a title'))).toBe(true);
    expect(result.errors).toContain('Each command must be an object');
  });

  it('validates tools: missing id/name/category', () => {
    const result = validateManifest(
      baseManifest({ contributes: { tools: [{}] } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['Tool missing "id"', 'Tool missing "name"', 'Tool missing "category"']),
    );
  });

  it('validates workflowNodes: missing inputs/outputs arrays', () => {
    const result = validateManifest(
      baseManifest({
        contributes: { workflowNodes: [{ id: 'n1', name: 'Node' }] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing "inputs" array'))).toBe(true);
    expect(result.errors.some((e) => e.includes('missing "outputs" array'))).toBe(true);
  });

  it('validates panels: invalid location', () => {
    const result = validateManifest(
      baseManifest({
        contributes: { panels: [{ id: 'p1', title: 'Panel', location: 'ceiling' }] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid location'))).toBe(true);
  });

  it('accepts valid panel locations', () => {
    for (const location of ['sidebar', 'bottom', 'floating']) {
      const result = validateManifest(
        baseManifest({ contributes: { panels: [{ id: 'p1', title: 'Panel', location }] } }),
      );
      expect(result.valid, location).toBe(true);
    }
  });

  it('validates keybindings: missing command/key', () => {
    const result = validateManifest(
      baseManifest({ contributes: { keybindings: [{}] } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['Keybinding missing "command"', 'Keybinding missing "key"']),
    );
  });

  it('validates settings: invalid type', () => {
    const result = validateManifest(
      baseManifest({
        contributes: { settings: [{ id: 's1', type: 'color' }] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid type'))).toBe(true);
  });

  it('warns about unknown contribution types without failing', () => {
    const result = validateManifest(
      baseManifest({ contributes: { themes: [] } }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('Unknown contribution type: "themes"'))).toBe(true);
  });

  it('non-array contribution sections are rejected', () => {
    for (const key of ['commands', 'tools', 'workflowNodes', 'panels', 'keybindings', 'settings']) {
      const result = validateManifest(baseManifest({ contributes: { [key]: {} } }));
      expect(result.valid, key).toBe(false);
      expect(result.errors.some((e) => e.includes(`"contributes.${key}" must be an array`))).toBe(true);
    }
  });
});

describe('loadManifest — filesystem integration', () => {
  it('returns "Manifest not found" for a directory without a manifest', () => {
    const dir = makeTempDir();
    const result = loadManifest(dir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Manifest not found');
  });

  it('returns a parse error for malformed JSON', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'iris-extension.json'), '{ not json', 'utf-8');
    const result = loadManifest(dir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Failed to parse manifest');
  });

  it('fails when the entry file referenced by "main" does not exist', () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'iris-extension.json'),
      JSON.stringify(baseManifest()),
      'utf-8',
    );
    const result = loadManifest(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Entry file not found'))).toBe(true);
  });

  it('validates a complete extension directory (manifest + entry file)', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.js'), 'export function activate() {}', 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'iris-extension.json'),
      JSON.stringify(baseManifest()),
      'utf-8',
    );
    const result = loadManifest(dir);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.manifest?.main).toBe('./dist/index.js');
  });
});
