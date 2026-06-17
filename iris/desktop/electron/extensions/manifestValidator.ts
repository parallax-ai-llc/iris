/**
 * Manifest Validator — validates iris-extension.json files.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import {
  PERMISSIONS,
  type ExtensionManifest,
  type Permission,
  type ActivationEvent,
} from './ipcProtocol';

export interface ManifestValidationResult {
  valid: boolean;
  manifest?: ExtensionManifest;
  errors: string[];
  warnings: string[];
}

const ID_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const SEMVER_RANGE_PATTERN = /^[\^~>=<\d.\s|*-]+$/;
const COMMAND_ID_PATTERN = /^[\w.-]+$/;

const VALID_ACTIVATION_PREFIXES = [
  'onStartup',
  'onCommand:',
  'onTool:',
  'onWorkflowNode:',
  'onView:',
  'onImageOpen',
];

function isValidActivationEvent(event: string): event is ActivationEvent {
  return VALID_ACTIVATION_PREFIXES.some(
    (prefix) => event === prefix || event.startsWith(prefix)
  );
}

function isValidPermission(perm: string): perm is Permission {
  return (PERMISSIONS as readonly string[]).includes(perm);
}

/**
 * Validate a parsed manifest object.
 */
export function validateManifest(data: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'], warnings };
  }

  const m = data as Record<string, unknown>;

  // Required string fields
  if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) {
    errors.push(`"id" must match pattern "publisher.extension-name" (lowercase, alphanumeric, hyphens). Got: ${String(m.id)}`);
  }
  if (typeof m.name !== 'string' || m.name.trim().length === 0) {
    errors.push('"name" is required and must be a non-empty string');
  }
  if (typeof m.version !== 'string' || !VERSION_PATTERN.test(m.version)) {
    errors.push(`"version" must be a valid semver (e.g., "1.0.0"). Got: ${String(m.version)}`);
  }
  if (typeof m.main !== 'string' || m.main.trim().length === 0) {
    errors.push('"main" is required and must point to the entry file');
  }
  if (typeof m.publisher !== 'string' || m.publisher.trim().length === 0) {
    errors.push('"publisher" is required');
  }

  // Optional string fields
  if (m.engineVersion !== undefined && typeof m.engineVersion === 'string') {
    if (!SEMVER_RANGE_PATTERN.test(m.engineVersion)) {
      warnings.push(`"engineVersion" doesn't look like a valid semver range: ${m.engineVersion}`);
    }
  }

  // activationEvents
  if (!Array.isArray(m.activationEvents) || m.activationEvents.length === 0) {
    errors.push('"activationEvents" must be a non-empty array');
  } else {
    for (const event of m.activationEvents) {
      if (typeof event !== 'string' || !isValidActivationEvent(event)) {
        errors.push(`Invalid activation event: "${event}"`);
      }
    }
  }

  // permissions
  if (!Array.isArray(m.permissions)) {
    errors.push('"permissions" must be an array');
  } else {
    for (const perm of m.permissions) {
      if (typeof perm !== 'string' || !isValidPermission(perm)) {
        errors.push(`Unknown permission: "${perm}". Valid: ${PERMISSIONS.join(', ')}`);
      }
    }
  }

  // contributes (optional)
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

  return {
    valid: true,
    manifest: data as unknown as ExtensionManifest,
    errors,
    warnings,
  };
}

function validateContributions(
  c: Record<string, unknown>,
  errors: string[],
  warnings: string[]
): void {
  // commands
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

  // tools
  if (c.tools !== undefined) {
    if (!Array.isArray(c.tools)) {
      errors.push('"contributes.tools" must be an array');
    } else {
      for (const tool of c.tools) {
        if (!tool || typeof tool !== 'object') {
          errors.push('Each tool must be an object');
          continue;
        }
        const t = tool as Record<string, unknown>;
        if (typeof t.id !== 'string') errors.push('Tool missing "id"');
        if (typeof t.name !== 'string') errors.push('Tool missing "name"');
        if (typeof t.category !== 'string') errors.push('Tool missing "category"');
      }
    }
  }

  // workflowNodes
  if (c.workflowNodes !== undefined) {
    if (!Array.isArray(c.workflowNodes)) {
      errors.push('"contributes.workflowNodes" must be an array');
    } else {
      for (const node of c.workflowNodes) {
        if (!node || typeof node !== 'object') {
          errors.push('Each workflowNode must be an object');
          continue;
        }
        const n = node as Record<string, unknown>;
        if (typeof n.id !== 'string') errors.push('Workflow node missing "id"');
        if (typeof n.name !== 'string') errors.push('Workflow node missing "name"');
        if (!Array.isArray(n.inputs)) errors.push(`Workflow node "${n.id}" missing "inputs" array`);
        if (!Array.isArray(n.outputs)) errors.push(`Workflow node "${n.id}" missing "outputs" array`);
      }
    }
  }

  // panels
  if (c.panels !== undefined) {
    if (!Array.isArray(c.panels)) {
      errors.push('"contributes.panels" must be an array');
    } else {
      for (const panel of c.panels) {
        if (!panel || typeof panel !== 'object') continue;
        const p = panel as Record<string, unknown>;
        if (typeof p.id !== 'string') errors.push('Panel missing "id"');
        if (!['sidebar', 'bottom', 'floating'].includes(String(p.location))) {
          errors.push(`Panel "${p.id}" has invalid location: "${p.location}". Must be sidebar|bottom|floating`);
        }
      }
    }
  }

  // keybindings
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

  // settings
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

  // Warn about unknown contribution types
  const knownKeys = ['commands', 'tools', 'workflowNodes', 'panels', 'menus', 'keybindings', 'settings'];
  for (const key of Object.keys(c)) {
    if (!knownKeys.includes(key)) {
      warnings.push(`Unknown contribution type: "${key}" — will be ignored`);
    }
  }
}

/**
 * Load and validate manifest from an extension directory.
 */
export function loadManifest(extensionDir: string): ManifestValidationResult {
  const manifestPath = path.join(extensionDir, 'iris-extension.json');

  if (!existsSync(manifestPath)) {
    return {
      valid: false,
      errors: [`Manifest not found: ${manifestPath}`],
      warnings: [],
    };
  }

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    const result = validateManifest(data);

    // Verify main entry file exists
    if (result.valid && result.manifest) {
      const mainPath = path.resolve(extensionDir, result.manifest.main);
      if (!existsSync(mainPath)) {
        result.errors.push(`Entry file not found: ${result.manifest.main} (resolved: ${mainPath})`);
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
