// @vitest-environment node
/**
 * Unit tests for electron/extensions/permissionEnforcer.ts
 *
 * Pure Node module — no Electron mocks required.
 */
import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  getAutoApprovedPermissions,
  getPermissionsRequiringApproval,
  groupPermissionsByRisk,
} from '../permissionEnforcer';
import { PERMISSIONS, PERMISSION_RISK, type Permission } from '../ipcProtocol';

const byRisk = (level: 'low' | 'medium' | 'high'): Permission[] =>
  (Object.entries(PERMISSION_RISK) as [Permission, string][])
    .filter(([, risk]) => risk === level)
    .map(([perm]) => perm);

describe('checkPermission — API ↔ permission mapping', () => {
  it('denies unknown APIs by default (deny-by-default)', () => {
    for (const [namespace, method] of [
      ['iris.evil', 'doAnything'],
      ['iris.fs', 'deleteEverything'],
      ['iris.image', 'nonexistentMethod'],
    ]) {
      const result = checkPermission(namespace, method, [...PERMISSIONS]);
      expect(result.allowed, `${namespace}.${method}`).toBe(false);
      expect(result.reason).toContain('Unknown API');
    }
  });

  it('allows permission-free APIs with zero grants', () => {
    for (const [namespace, method] of [
      ['iris.window', 'showMessage'],
      ['iris.window', 'showInputBox'],
      ['iris.window', 'setStatusBarItem'],
      ['iris.storage', 'get'],
      ['iris.storage', 'set'],
      ['iris.storage', 'delete'],
      ['iris.env', 'appVersion'],
      ['iris.env', 'platform'],
      ['iris.commands', 'execute'],
      ['iris.ai', 'getAvailableModels'],
      ['iris.export', 'getPresets'],
    ]) {
      const result = checkPermission(namespace, method, []);
      expect(result.allowed, `${namespace}.${method}`).toBe(true);
      expect(result.requiredPermission).toBeUndefined();
    }
  });

  it('maps gated APIs to their required permission and denies without a grant', () => {
    const cases: [string, string, Permission][] = [
      ['iris.commands', 'register', 'commands:register'],
      ['iris.tools', 'register', 'tools:register'],
      ['iris.workflow', 'registerNode', 'workflow:register'],
      ['iris.window', 'createPanel', 'ui:panel'],
      ['iris.image', 'getActive', 'image:read'],
      ['iris.image', 'getSelection', 'image:read'],
      ['iris.image', 'putImage', 'image:write'],
      ['iris.image', 'getActiveFileInfo', 'image:read'],
      ['iris.ai', 'executeModel', 'ai:execute'],
      ['iris.network', 'fetch', 'network'],
      ['iris.clipboard', 'read', 'clipboard'],
      ['iris.clipboard', 'write', 'clipboard'],
      ['iris.fs', 'readFile', 'filesystem:read'],
      ['iris.fs', 'writeFile', 'filesystem:write'],
      ['iris.fs', 'listDirectory', 'filesystem:read'],
      ['iris.fs', 'rename', 'filesystem:write'],
      ['iris.fs', 'stat', 'filesystem:read'],
      ['iris.export', 'applyPreset', 'export:configure'],
      ['iris.export', 'getSettings', 'export:configure'],
      ['iris.export', 'updateSettings', 'export:configure'],
    ];

    for (const [namespace, method, required] of cases) {
      const denied = checkPermission(namespace, method, []);
      expect(denied.allowed, `${namespace}.${method} without grant`).toBe(false);
      expect(denied.requiredPermission).toBe(required);
      expect(denied.reason).toContain(required);

      const allowed = checkPermission(namespace, method, [required]);
      expect(allowed.allowed, `${namespace}.${method} with grant`).toBe(true);
    }
  });

  it('an unrelated grant does not unlock a gated API', () => {
    const result = checkPermission('iris.network', 'fetch', ['clipboard', 'image:read']);
    expect(result.allowed).toBe(false);
    expect(result.requiredPermission).toBe('network');
  });
});

describe('getAutoApprovedPermissions — trust tiers', () => {
  it('official tier auto-approves the entire permission catalog', () => {
    const approved = getAutoApprovedPermissions('official');
    expect([...approved].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('verified tier auto-approves low + medium risk permissions', () => {
    const approved = getAutoApprovedPermissions('verified');
    expect([...approved].sort()).toEqual([...byRisk('low'), ...byRisk('medium')].sort());
    // export:configure is medium risk and must be included
    expect(approved).toContain('export:configure');
    expect(approved).toContain('clipboard');
    expect(approved).not.toContain('ai:execute');
    expect(approved).not.toContain('network');
  });

  it('community tier auto-approves only low risk permissions', () => {
    const approved = getAutoApprovedPermissions('community');
    expect([...approved].sort()).toEqual([...byRisk('low')].sort());
    expect(approved).toEqual(
      expect.arrayContaining(['commands:register', 'tools:register', 'workflow:register', 'ui:panel']),
    );
    expect(approved).not.toContain('image:read');
  });
});

describe('getPermissionsRequiringApproval', () => {
  it('returns only the permissions not auto-approved for the tier', () => {
    const requested: Permission[] = ['commands:register', 'clipboard', 'network'];
    expect(getPermissionsRequiringApproval(requested, 'official')).toEqual([]);
    expect(getPermissionsRequiringApproval(requested, 'verified')).toEqual(['network']);
    expect(getPermissionsRequiringApproval(requested, 'community')).toEqual(['clipboard', 'network']);
  });

  it('returns an empty list for empty requests', () => {
    expect(getPermissionsRequiringApproval([], 'community')).toEqual([]);
  });
});

describe('groupPermissionsByRisk', () => {
  it('groups permissions into low/medium/high buckets', () => {
    const grouped = groupPermissionsByRisk([
      'commands:register',
      'export:configure',
      'image:read',
      'network',
      'filesystem:write',
    ]);
    expect(grouped.low).toEqual(['commands:register']);
    expect(grouped.medium.sort()).toEqual(['export:configure', 'image:read'].sort());
    expect(grouped.high.sort()).toEqual(['filesystem:write', 'network'].sort());
  });

  it('every catalog permission lands in exactly one bucket', () => {
    const grouped = groupPermissionsByRisk([...PERMISSIONS]);
    const total = grouped.low.length + grouped.medium.length + grouped.high.length;
    expect(total).toBe(PERMISSIONS.length);
  });
});
