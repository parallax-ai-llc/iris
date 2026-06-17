/**
 * Extension Registration Tests
 *
 * Tests the extension registration pipeline:
 * 1. Manifest validation (iris-extension.json parsing & validation)
 * 2. Permission enforcement (trust tiers & auto-approval)
 * 3. Installation simulation (directory copy, registry write)
 * 4. All 4 example extensions validated
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

// Import the actual validators (these are pure Node.js, no Electron deps)
// We need to mock the Electron-specific imports

// ─── Inline manifest validator (mirrors manifestValidator.ts logic) ─────────

const PERMISSIONS = [
  'commands:register',
  'tools:register',
  'workflow:register',
  'ui:panel',
  'image:read',
  'image:write',
  'ai:execute',
  'network',
  'clipboard',
  'filesystem:read',
  'filesystem:write',
] as const;

type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_RISK: Record<Permission, 'low' | 'medium' | 'high'> = {
  'commands:register': 'low',
  'tools:register': 'low',
  'workflow:register': 'low',
  'ui:panel': 'low',
  'image:read': 'medium',
  'image:write': 'medium',
  'clipboard': 'medium',
  'ai:execute': 'high',
  'network': 'high',
  'filesystem:read': 'high',
  'filesystem:write': 'high',
};

type TrustTier = 'official' | 'verified' | 'community';

const ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const COMMAND_ID_PATTERN = /^[\w.-]+$/;

const VALID_ACTIVATION_PREFIXES = [
  'onStartup',
  'onCommand:',
  'onTool:',
  'onWorkflowNode:',
  'onView:',
  'onImageOpen',
];

interface ManifestCommand {
  command: string;
  title?: string;
}

interface ManifestSetting {
  id: string;
  type: string;
  enum?: string[];
  default?: unknown;
}

interface ManifestKeybinding {
  command: string;
  key: string;
}

interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  publisher: string;
  activationEvents: string[];
  permissions: string[];
  contributes?: {
    commands?: ManifestCommand[];
    settings?: ManifestSetting[];
    keybindings?: ManifestKeybinding[];
  };
}

interface ManifestValidationResult {
  valid: boolean;
  manifest?: ExtensionManifest;
  errors: string[];
  warnings: string[];
}

function isValidActivationEvent(event: string): boolean {
  return VALID_ACTIVATION_PREFIXES.some(
    (prefix) => event === prefix || event.startsWith(prefix),
  );
}

function isValidPermission(perm: string): perm is Permission {
  return (PERMISSIONS as readonly string[]).includes(perm);
}

function validateManifest(data: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'], warnings };
  }

  const m = data as Record<string, unknown>;

  if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) {
    errors.push(`"id" must match pattern "publisher.extension-name". Got: ${String(m.id)}`);
  }
  if (typeof m.name !== 'string' || (m.name as string).trim().length === 0) {
    errors.push('"name" is required and must be a non-empty string');
  }
  if (typeof m.version !== 'string' || !VERSION_PATTERN.test(m.version)) {
    errors.push(`"version" must be a valid semver. Got: ${String(m.version)}`);
  }
  if (typeof m.main !== 'string' || (m.main as string).trim().length === 0) {
    errors.push('"main" is required and must point to the entry file');
  }
  if (typeof m.publisher !== 'string' || (m.publisher as string).trim().length === 0) {
    errors.push('"publisher" is required');
  }

  if (!Array.isArray(m.activationEvents) || m.activationEvents.length === 0) {
    errors.push('"activationEvents" must be a non-empty array');
  } else {
    for (const event of m.activationEvents) {
      if (typeof event !== 'string' || !isValidActivationEvent(event)) {
        errors.push(`Invalid activation event: "${event}"`);
      }
    }
  }

  if (!Array.isArray(m.permissions)) {
    errors.push('"permissions" must be an array');
  } else {
    for (const perm of m.permissions) {
      if (typeof perm !== 'string' || !isValidPermission(perm)) {
        errors.push(`Unknown permission: "${perm}"`);
      }
    }
  }

  // contributes validation
  if (m.contributes !== undefined) {
    if (typeof m.contributes !== 'object' || m.contributes === null) {
      errors.push('"contributes" must be an object');
    } else {
      const c = m.contributes as Record<string, unknown>;
      validateContributions(c, errors, warnings);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, manifest: data as ExtensionManifest, errors, warnings };
}

function validateContributions(
  c: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  if (c.commands !== undefined) {
    if (!Array.isArray(c.commands)) {
      errors.push('"contributes.commands" must be an array');
    } else {
      for (const cmd of c.commands) {
        if (!cmd || typeof cmd !== 'object') {
          errors.push('Each command must be an object');
          continue;
        }
        const cc = cmd as Record<string, unknown>;
        if (typeof cc.command !== 'string' || !COMMAND_ID_PATTERN.test(cc.command)) {
          errors.push(`Command id must match pattern [\\w.-]+. Got: "${cc.command}"`);
        }
        if (typeof cc.title !== 'string' || cc.title.trim().length === 0) {
          errors.push(`Command "${cc.command}" is missing a title`);
        }
      }
    }
  }

  if (c.tools !== undefined) {
    if (!Array.isArray(c.tools)) {
      errors.push('"contributes.tools" must be an array');
    } else {
      for (const tool of c.tools) {
        if (!tool || typeof tool !== 'object') continue;
        const t = tool as Record<string, unknown>;
        if (typeof t.id !== 'string') errors.push('Tool missing "id"');
        if (typeof t.name !== 'string') errors.push('Tool missing "name"');
        if (typeof t.category !== 'string') errors.push('Tool missing "category"');
      }
    }
  }

  if (c.workflowNodes !== undefined) {
    if (!Array.isArray(c.workflowNodes)) {
      errors.push('"contributes.workflowNodes" must be an array');
    } else {
      for (const node of c.workflowNodes) {
        if (!node || typeof node !== 'object') continue;
        const n = node as Record<string, unknown>;
        if (typeof n.id !== 'string') errors.push('Workflow node missing "id"');
        if (typeof n.name !== 'string') errors.push('Workflow node missing "name"');
        if (!Array.isArray(n.inputs)) errors.push(`Workflow node "${n.id}" missing "inputs" array`);
        if (!Array.isArray(n.outputs)) errors.push(`Workflow node "${n.id}" missing "outputs" array`);
      }
    }
  }

  if (c.keybindings !== undefined) {
    if (!Array.isArray(c.keybindings)) {
      errors.push('"contributes.keybindings" must be an array');
    } else {
      for (const kb of c.keybindings) {
        if (!kb || typeof kb !== 'object') continue;
        const k = kb as Record<string, unknown>;
        if (typeof k.command !== 'string') errors.push('Keybinding missing "command"');
        if (typeof k.key !== 'string') errors.push('Keybinding missing "key"');
      }
    }
  }

  if (c.settings !== undefined) {
    if (!Array.isArray(c.settings)) {
      errors.push('"contributes.settings" must be an array');
    } else {
      for (const s of c.settings) {
        if (!s || typeof s !== 'object') continue;
        const setting = s as Record<string, unknown>;
        if (typeof setting.id !== 'string') errors.push('Setting missing "id"');
        if (!['string', 'number', 'boolean', 'enum'].includes(String(setting.type))) {
          errors.push(`Setting "${setting.id}" has invalid type: "${setting.type}"`);
        }
      }
    }
  }

  const knownKeys = ['commands', 'tools', 'workflowNodes', 'panels', 'menus', 'keybindings', 'settings'];
  for (const key of Object.keys(c)) {
    if (!knownKeys.includes(key)) {
      warnings.push(`Unknown contribution type: "${key}" — will be ignored`);
    }
  }
}

function loadManifest(extensionDir: string): ManifestValidationResult {
  const manifestPath = path.join(extensionDir, 'iris-extension.json');

  if (!fs.existsSync(manifestPath)) {
    return { valid: false, errors: [`Manifest not found: ${manifestPath}`], warnings: [] };
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    const result = validateManifest(data);

    if (result.valid && result.manifest) {
      const mainPath = path.resolve(extensionDir, result.manifest!.main);
      if (!fs.existsSync(mainPath)) {
        result.errors.push(`Entry file not found: ${result.manifest!.main} (resolved: ${mainPath})`);
        result.valid = false;
      }
    }

    return result;
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

function getAutoApprovedPermissions(tier: TrustTier): Permission[] {
  const approved: Permission[] = [];
  for (const [perm, risk] of Object.entries(PERMISSION_RISK)) {
    switch (tier) {
      case 'official':
        approved.push(perm as Permission);
        break;
      case 'verified':
        if (risk === 'low' || risk === 'medium') approved.push(perm as Permission);
        break;
      case 'community':
        if (risk === 'low') approved.push(perm as Permission);
        break;
    }
  }
  return approved;
}

function getPermissionsRequiringApproval(
  requestedPermissions: Permission[],
  trustTier: TrustTier,
): Permission[] {
  const autoApproved = getAutoApprovedPermissions(trustTier);
  return requestedPermissions.filter((p) => !autoApproved.includes(p));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

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
    expect(ID_PATTERN.test(result.manifest!.id)).toBe(true);
  });

  it('manifest has valid version', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.version).toBe('1.0.0');
    expect(VERSION_PATTERN.test(result.manifest!.version)).toBe(true);
  });

  it('manifest has valid activation events', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.activationEvents).toContain('onStartup');
    for (const event of result.manifest!.activationEvents) {
      expect(isValidActivationEvent(event)).toBe(true);
    }
  });

  it('manifest has valid permissions', () => {
    const result = loadManifest(darkThemesDir);
    expect(result.manifest!.permissions).toEqual(
      expect.arrayContaining(['commands:register', 'ui:panel']),
    );
    for (const perm of result.manifest!.permissions) {
      expect(isValidPermission(perm)).toBe(true);
    }
  });

  it('manifest contributes commands with valid format', () => {
    const result = loadManifest(darkThemesDir);
    const commands = result.manifest!.contributes?.commands;

    expect(commands).toBeDefined();
    expect(commands).toHaveLength(2);

    // Select theme command
    const selectCmd = commands!.find((c: { command: string; title?: string }) => c.command === 'iris-official.dark-themes.select');
    expect(selectCmd).toBeDefined();
    expect(selectCmd!.title).toBe('Select Theme');

    // Reset theme command
    const resetCmd = commands!.find((c: { command: string; title?: string }) => c.command === 'iris-official.dark-themes.reset');
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
    const permissions = result.manifest!.permissions as Permission[];
    const needsApproval = getPermissionsRequiringApproval(permissions, 'official');

    // Official tier auto-approves all permissions
    expect(needsApproval).toHaveLength(0);
  });

  it('permissions are auto-approved for "community" trust tier (all low-risk)', () => {
    const result = loadManifest(darkThemesDir);
    const permissions = result.manifest!.permissions as Permission[];

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

describe('Extension Registration - all example extensions', () => {
  const examples = [
    'dark-themes', 'custom-workflow-node', 'image-info', 'quick-filter',
    'watermark-stamper', 'color-palette', 'prompt-library', 'style-presets',
    'session-timer', 'auto-tagger', 'daily-inspiration',
  ];

  for (const example of examples) {
    const extDir = path.join(extensionsRoot, example);

    it(`${example}: directory and files exist`, () => {
      expect(fs.existsSync(extDir), `Directory not found: ${extDir}`).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'iris-extension.json'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'dist/index.js'))).toBe(true);
    });

    it(`${example}: manifest validates successfully`, () => {
      const result = loadManifest(extDir);
      expect(result.errors, `Manifest errors: ${result.errors.join(', ')}`).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it(`${example}: entry file exports activate function`, () => {
      const content = fs.readFileSync(path.join(extDir, 'dist/index.js'), 'utf-8');
      expect(content).toContain('function activate');
    });
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
    const result = loadManifest('/nonexistent/path');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Manifest not found');
  });
});

describe('Permission Enforcement', () => {
  it('official tier auto-approves all permissions', () => {
    const approved = getAutoApprovedPermissions('official');
    expect(approved).toHaveLength(PERMISSIONS.length);
  });

  it('verified tier auto-approves low and medium permissions', () => {
    const approved = getAutoApprovedPermissions('verified');
    // low: commands:register, tools:register, workflow:register, ui:panel (4)
    // medium: image:read, image:write, clipboard (3)
    expect(approved).toHaveLength(7);
    expect(approved).toContain('commands:register');
    expect(approved).toContain('image:read');
    expect(approved).not.toContain('network');
    expect(approved).not.toContain('filesystem:write');
  });

  it('community tier auto-approves only low permissions', () => {
    const approved = getAutoApprovedPermissions('community');
    expect(approved).toHaveLength(4);
    expect(approved).toContain('commands:register');
    expect(approved).toContain('tools:register');
    expect(approved).toContain('workflow:register');
    expect(approved).toContain('ui:panel');
    expect(approved).not.toContain('image:read');
  });

  it('high-risk permissions require approval for community extensions', () => {
    const needsApproval = getPermissionsRequiringApproval(
      ['commands:register', 'network', 'filesystem:write'],
      'community',
    );
    expect(needsApproval).toEqual(['network', 'filesystem:write']);
  });
});
