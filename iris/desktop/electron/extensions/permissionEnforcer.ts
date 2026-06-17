/**
 * Permission Enforcer — checks API calls against granted permissions.
 */
import {
  type Permission,
  type TrustTier,
  PERMISSION_RISK,
  type PermissionRiskLevel,
} from './ipcProtocol';

/** Maps iris.* API namespace + method to required permission */
const API_PERMISSION_MAP: Record<string, Permission | null> = {
  // commands
  'iris.commands.register': 'commands:register',
  'iris.commands.execute': null,  // no permission needed

  // tools
  'iris.tools.register': 'tools:register',

  // workflow
  'iris.workflow.registerNode': 'workflow:register',

  // window
  'iris.window.showMessage': null,
  'iris.window.showInputBox': null,
  'iris.window.createPanel': 'ui:panel',
  'iris.window.setStatusBarItem': null,

  // storage (per-extension, no permission needed)
  'iris.storage.get': null,
  'iris.storage.set': null,
  'iris.storage.delete': null,

  // context
  'iris.context.subscriptions': null,

  // env (read-only)
  'iris.env.appVersion': null,
  'iris.env.platform': null,
  'iris.env.language': null,

  // image
  'iris.image.getActive': 'image:read',
  'iris.image.getSelection': 'image:read',
  'iris.image.putImage': 'image:write',
  'iris.image.onDidChangeActive': 'image:read',

  // ai
  'iris.ai.executeModel': 'ai:execute',
  'iris.ai.getAvailableModels': null,

  // network
  'iris.network.fetch': 'network',

  // clipboard
  'iris.clipboard.read': 'clipboard',
  'iris.clipboard.write': 'clipboard',

  // filesystem
  'iris.fs.readFile': 'filesystem:read',
  'iris.fs.writeFile': 'filesystem:write',
  'iris.fs.listDirectory': 'filesystem:read',
  'iris.fs.rename': 'filesystem:write',
  'iris.fs.stat': 'filesystem:read',

  // image (additional)
  'iris.image.getActiveFileInfo': 'image:read',

  // export
  'iris.export.getPresets': null,  // read-only constants
  'iris.export.applyPreset': 'export:configure',
  'iris.export.getSettings': 'export:configure',
  'iris.export.updateSettings': 'export:configure',
};

export interface PermissionCheckResult {
  allowed: boolean;
  requiredPermission?: Permission;
  reason?: string;
}

/**
 * Check if an extension has the required permission for an API call.
 */
export function checkPermission(
  namespace: string,
  method: string,
  grantedPermissions: Permission[]
): PermissionCheckResult {
  const apiKey = `${namespace}.${method}`;
  const required = API_PERMISSION_MAP[apiKey];

  // Unknown API — deny by default
  if (required === undefined) {
    return {
      allowed: false,
      reason: `Unknown API: ${apiKey}`,
    };
  }

  // No permission required
  if (required === null) {
    return { allowed: true };
  }

  // Check if permission was granted
  if (grantedPermissions.includes(required)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    requiredPermission: required,
    reason: `Permission "${required}" is required for ${apiKey} but was not granted`,
  };
}

/**
 * Get auto-approved permissions based on trust tier.
 */
export function getAutoApprovedPermissions(tier: TrustTier): Permission[] {
  const approved: Permission[] = [];

  for (const [perm, risk] of Object.entries(PERMISSION_RISK)) {
    switch (tier) {
      case 'official':
        // Official extensions get all permissions auto-approved
        approved.push(perm as Permission);
        break;
      case 'verified':
        // Verified get low + medium
        if (risk === 'low' || risk === 'medium') {
          approved.push(perm as Permission);
        }
        break;
      case 'community':
        // Community only get low
        if (risk === 'low') {
          approved.push(perm as Permission);
        }
        break;
    }
  }

  return approved;
}

/**
 * Get permissions that require user approval (not auto-approved by trust tier).
 */
export function getPermissionsRequiringApproval(
  requestedPermissions: Permission[],
  trustTier: TrustTier
): Permission[] {
  const autoApproved = getAutoApprovedPermissions(trustTier);
  return requestedPermissions.filter((p) => !autoApproved.includes(p));
}

/**
 * Group permissions by risk level for display in the approval dialog.
 */
export function groupPermissionsByRisk(
  permissions: Permission[]
): Record<PermissionRiskLevel, Permission[]> {
  const grouped: Record<PermissionRiskLevel, Permission[]> = {
    low: [],
    medium: [],
    high: [],
  };

  for (const perm of permissions) {
    const risk = PERMISSION_RISK[perm];
    if (risk) {
      grouped[risk].push(perm);
    }
  }

  return grouped;
}
