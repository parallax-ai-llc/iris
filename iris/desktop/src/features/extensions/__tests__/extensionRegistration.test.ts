/**
 * Extension Registration Tests
 *
 * Tests the extension registration pipeline against the REAL implementation
 * (electron/extensions/manifestValidator + permissionEnforcer — imported, not
 * copied):
 * 1. Manifest validation (iris-extension.json parsing & validation)
 * 2. Permission enforcement (trust tiers & auto-approval)
 * 3. Every example extension under extensions/examples/ (full directory scan)
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  validateManifest,
  loadManifest,
} from '@electron/extensions/manifestValidator';
import {
  getAutoApprovedPermissions,
  getPermissionsRequiringApproval,
} from '@electron/extensions/permissionEnforcer';
import {
  PERMISSIONS,
  PERMISSION_RISK,
  type Permission,
} from '@electron/extensions/ipcProtocol';

const extensionsRoot = path.resolve(__dirname, '../../../../extensions/examples');

describe('Extension Registration - dark-themes', () => {
  const darkThemesDir = path.join(extensionsRoot, 'dark-themes');

  it('extension directory exists with required files', () => {
    expect(fs.existsSync(darkThemesDir)).toBe(true);
    expect(fs.existsSync(path.join(darkThemesDir, 'iris-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(darkThemesDir, 'dist/index.js'))).toBe(true);
  });

  it('manifest validates successfully', () => {
    const result = loadManifest(darkThemesDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).toBeDefined();
  });

  it('manifest has correct id format (publisher.extension-name)', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.id).toBe('iris-official.dark-themes');
  });

  it('manifest has valid version', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.version).toBe('1.0.0');
  });

  it('manifest has valid activation events', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.activationEvents).toContain('onStartup');
  });

  it('manifest has expected permissions', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.permissions).toEqual(
      expect.arrayContaining(['commands:register', 'ui:panel']),
    );
    for (const perm of result.manifest!.permissions) {
      expect(PERMISSIONS).toContain(perm);
    }
  });

  it('manifest contributes commands with valid format', () => {
    const result = loadManifest(darkThemesDir);
    const commands = result.manifest!.contributes?.commands;

    expect(commands).toBeDefined();
    expect(commands).toHaveLength(2);

    // Select theme command
    const selectCmd = commands!.find((c) => c.command === 'iris-official.dark-themes.select');
    expect(selectCmd).toBeDefined();
    expect(selectCmd!.title).toBe('Select Theme');

    // Reset theme command
    const resetCmd = commands!.find((c) => c.command === 'iris-official.dark-themes.reset');
    expect(resetCmd).toBeDefined();
    expect(resetCmd!.title).toBe('Reset to Default Theme');
  });

  it('manifest contributes settings with valid enum type', () => {
    const result = loadManifest(darkThemesDir);
    const settings = result.manifest!.contributes?.settings;

    expect(settings).toBeDefined();
    expect(settings).toHaveLength(1);

    const themeSetting = settings![0];
    expect(themeSetting.id).toBe('iris-official.dark-themes.current');
    expect(themeSetting.type).toBe('enum');
    expect(themeSetting.enum).toEqual(['midnight', 'ocean', 'forest', 'sunset']);
    expect(themeSetting.default).toBe('midnight');
  });

  it('manifest contributes keybindings', () => {
    const result = loadManifest(darkThemesDir);
    const keybindings = result.manifest!.contributes?.keybindings;

    expect(keybindings).toBeDefined();
    expect(keybindings).toHaveLength(1);
    expect(keybindings![0].command).toBe('iris-official.dark-themes.select');
    expect(keybindings![0].key).toBe('ctrl+shift+t');
  });

  it('entry file (dist/index.js) exports activate and deactivate', () => {
    const entryPath = path.join(darkThemesDir, 'dist/index.js');
    const content = fs.readFileSync(entryPath, 'utf-8');

    expect(content).toContain('function activate');
    expect(content).toContain('function deactivate');
    expect(content).toMatch(/\bexport\b/);
  });

  it('permissions are auto-approved for "official" trust tier', () => {
    const result = loadManifest(darkThemesDir);
    const permissions = result.manifest!.permissions;
    const needsApproval = getPermissionsRequiringApproval(permissions, 'official');

    // Official tier auto-approves all permissions
    expect(needsApproval).toHaveLength(0);
  });

  it('permissions are auto-approved for "community" trust tier (all low-risk)', () => {
    const result = loadManifest(darkThemesDir);
    const permissions = result.manifest!.permissions;

    // dark-themes only uses low-risk permissions: commands:register, ui:panel
    const needsApproval = getPermissionsRequiringApproval(permissions, 'community');
    expect(needsApproval).toHaveLength(0);
  });

  it('entry file references all 4 themes', () => {
    const entryPath = path.join(darkThemesDir, 'dist/index.js');
    const content = fs.readFileSync(entryPath, 'utf-8');

    expect(content).toContain('midnight');
    expect(content).toContain('ocean');
    expect(content).toContain('forest');
    expect(content).toContain('sunset');
  });

  it('entry file uses iris.* APIs correctly', () => {
    const entryPath = path.join(darkThemesDir, 'dist/index.js');
    const content = fs.readFileSync(entryPath, 'utf-8');

    // Should use iris.commands.register (requires commands:register permission)
    expect(content).toContain('iris.commands.register');
    // Should use iris.storage for persistence
    expect(content).toContain('iris.storage.get');
    expect(content).toContain('iris.storage.set');
    // Should use iris.window for UI
    expect(content).toContain('iris.window.createPanel');
    expect(content).toContain('iris.window.setStatusBarItem');
    // Should use iris.log
    expect(content).toContain('iris.log.info');
  });
});

describe('Extension Registration - all example extensions (full scan)', () => {
  // Full scan of the examples directory instead of a hardcoded list, so newly
  // added examples are covered automatically.
  const exampleDirs = fs
    .readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('discovers the example extensions (at least 29)', () => {
    expect(exampleDirs.length).toBeGreaterThanOrEqual(29);
  });

  for (const example of exampleDirs) {
    const extDir = path.join(extensionsRoot, example);
    const manifestPath = path.join(extDir, 'iris-extension.json');
    const entryBuilt = fs.existsSync(path.join(extDir, 'dist/index.js'));

    it(`${example}: has an iris-extension.json manifest`, () => {
      expect(fs.existsSync(manifestPath), `Manifest not found: ${manifestPath}`).toBe(true);
    });

    it(`${example}: manifest passes validateManifest()`, () => {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const result = validateManifest(data);
      expect(result.errors, `Manifest errors: ${result.errors.join(', ')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
      expect(result.manifest!.id).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
    });

    // Entry-file checks only apply once the example is built. Build coverage of
    // all examples is verified by the examples build pipeline, not this test.
    if (entryBuilt) {
      it(`${example}: loadManifest() validates manifest + entry file`, () => {
        const result = loadManifest(extDir);
        expect(result.errors, `Manifest errors: ${result.errors.join(', ')}`).toHaveLength(0);
        expect(result.valid).toBe(true);
      });

      it(`${example}: entry file exports activate function`, () => {
        const content = fs.readFileSync(path.join(extDir, 'dist/index.js'), 'utf-8');
        expect(content).toContain('function activate');
      });
    }
  }
});

describe('Extension Manifest Validation - negative cases', () => {
  it('rejects manifest with invalid id', () => {
    const result = validateManifest({
      id: 'INVALID_ID',
      name: 'test',
      version: '1.0.0',
      main: './dist/index.js',
      publisher: 'test',
      activationEvents: ['onStartup'],
      permissions: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"id"'))).toBe(true);
  });

  it('rejects manifest with invalid version', () => {
    const result = validateManifest({
      id: 'test.ext',
      name: 'test',
      version: 'not-semver',
      main: './dist/index.js',
      publisher: 'test',
      activationEvents: ['onStartup'],
      permissions: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"version"'))).toBe(true);
  });

  it('rejects manifest with empty activationEvents', () => {
    const result = validateManifest({
      id: 'test.ext',
      name: 'test',
      version: '1.0.0',
      main: './dist/index.js',
      publisher: 'test',
      activationEvents: [],
      permissions: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('activationEvents'))).toBe(true);
  });

  it('rejects manifest with unknown permission', () => {
    const result = validateManifest({
      id: 'test.ext',
      name: 'test',
      version: '1.0.0',
      main: './dist/index.js',
      publisher: 'test',
      activationEvents: ['onStartup'],
      permissions: ['nonexistent:permission'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent:permission'))).toBe(true);
  });

  it('rejects manifest with invalid command format', () => {
    const result = validateManifest({
      id: 'test.ext',
      name: 'test',
      version: '1.0.0',
      main: './dist/index.js',
      publisher: 'test',
      activationEvents: ['onStartup'],
      permissions: [],
      contributes: {
        commands: [{ command: 'invalid command!', title: '' }],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects nonexistent extension directory', () => {
    const result = loadManifest(path.join(extensionsRoot, '__does-not-exist__'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Manifest not found');
  });
});

describe('Permission Enforcement (trust tiers)', () => {
  // Derived from the real PERMISSION_RISK table so a drift between test and
  // implementation (like the previous copy that missed export:configure) is
  // impossible.
  const byRisk = (level: 'low' | 'medium' | 'high'): Permission[] =>
    (Object.entries(PERMISSION_RISK) as [Permission, string][])
      .filter(([, risk]) => risk === level)
      .map(([perm]) => perm);

  it('the permission catalog includes export:configure (12 permissions total)', () => {
    expect(PERMISSIONS).toContain('export:configure');
    expect(PERMISSIONS).toHaveLength(12);
    expect(PERMISSION_RISK['export:configure']).toBe('medium');
  });

  it('official tier auto-approves all permissions', () => {
    const approved = getAutoApprovedPermissions('official');
    expect(approved).toHaveLength(PERMISSIONS.length);
    expect([...approved].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('verified tier auto-approves low and medium permissions', () => {
    const approved = getAutoApprovedPermissions('verified');
    // low: commands:register, tools:register, workflow:register, ui:panel (4)
    // medium: image:read, image:write, clipboard, export:configure (4)
    expect(approved).toHaveLength(8);
    expect([...approved].sort()).toEqual([...byRisk('low'), ...byRisk('medium')].sort());
    expect(approved).toContain('export:configure');
    expect(approved).not.toContain('network');
    expect(approved).not.toContain('filesystem:write');
  });

  it('community tier auto-approves only low permissions', () => {
    const approved = getAutoApprovedPermissions('community');
    expect(approved).toHaveLength(4);
    expect([...approved].sort()).toEqual([...byRisk('low')].sort());
    expect(approved).not.toContain('image:read');
    expect(approved).not.toContain('export:configure');
  });

  it('high-risk permissions require approval for community extensions', () => {
    const needsApproval = getPermissionsRequiringApproval(
      ['commands:register', 'network', 'filesystem:write'],
      'community',
    );
    expect(needsApproval).toEqual(['network', 'filesystem:write']);
  });

  it('medium-risk permissions require approval for community but not verified', () => {
    expect(getPermissionsRequiringApproval(['export:configure'], 'community')).toEqual([
      'export:configure',
    ]);
    expect(getPermissionsRequiringApproval(['export:configure'], 'verified')).toEqual([]);
  });
});
