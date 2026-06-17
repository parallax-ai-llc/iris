/**
 * Permission Dialog — shown when an extension requires permissions.
 */
import { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, X } from 'lucide-react';

const PERMISSION_RISK: Record<string, 'low' | 'medium' | 'high'> = {
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

const PERMISSION_LABELS: Record<string, { title: string; description: string }> = {
  'commands:register': { title: 'Register Commands', description: 'Register custom commands' },
  'tools:register': { title: 'Register Tools', description: 'Add new tools to the tool panel' },
  'workflow:register': { title: 'Register Workflow Nodes', description: 'Add custom workflow nodes' },
  'ui:panel': { title: 'Create UI Panels', description: 'Create webview panels in the UI' },
  'image:read': { title: 'Read Images', description: 'Access the current canvas image' },
  'image:write': { title: 'Write Images', description: 'Modify images on the canvas' },
  'clipboard': { title: 'Clipboard Access', description: 'Read and write clipboard content' },
  'ai:execute': { title: 'Execute AI Models', description: 'Run AI models (uses credits)' },
  'network': { title: 'Network Access', description: 'Make HTTP requests to external services' },
  'filesystem:read': { title: 'Read Files', description: 'Read files from the filesystem' },
  'filesystem:write': { title: 'Write Files', description: 'Write files to the filesystem' },
};

interface ExtensionPermissionDialogProps {
  extensionId: string;
  extensionName: string;
  publisher: string;
  requiredPermissions: string[];
  onApprove: (permissions: string[]) => void;
  onDeny: () => void;
}

export function ExtensionPermissionDialog({
  extensionName,
  publisher,
  requiredPermissions,
  onApprove,
  onDeny,
}: ExtensionPermissionDialogProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(requiredPermissions)
  );

  const highRisk = requiredPermissions.filter((p) => PERMISSION_RISK[p] === 'high');
  const mediumRisk = requiredPermissions.filter((p) => PERMISSION_RISK[p] === 'medium');
  const lowRisk = requiredPermissions.filter((p) => PERMISSION_RISK[p] === 'low');

  const togglePermission = (perm: string) => {
    const next = new Set(selectedPermissions);
    if (next.has(perm)) {
      next.delete(perm);
    } else {
      next.add(perm);
    }
    setSelectedPermissions(next);
  };

  const handleApprove = () => {
    onApprove(Array.from(selectedPermissions));
  };

  const renderPermissionGroup = (
    permissions: string[],
    risk: 'low' | 'medium' | 'high',
    icon: React.ReactNode,
    bgColor: string
  ) => {
    if (permissions.length === 0) return null;

    return (
      <div className="mb-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${bgColor}`}>
          {icon}
          {risk === 'high' ? 'High Risk' : risk === 'medium' ? 'Medium Risk' : 'Low Risk'}
        </div>
        <div className="mt-2 space-y-1.5">
          {permissions.map((perm) => {
            const label = PERMISSION_LABELS[perm] || { title: perm, description: '' };
            return (
              <label
                key={perm}
                className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-zinc-800/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedPermissions.has(perm)}
                  onChange={() => togglePermission(perm)}
                  className="mt-0.5 rounded border-zinc-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200">{label.title}</div>
                  <div className="text-xs text-zinc-500">{label.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-zinc-100">Permission Request</h2>
          </div>
          <button
            onClick={onDeny}
            className="p-1 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Extension info */}
        <div className="px-4 pt-4 pb-3">
          <p className="text-sm text-zinc-300">
            <span className="font-medium text-zinc-100">{extensionName}</span>
            <span className="text-zinc-500"> by {publisher}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            This extension requires the following permissions to function:
          </p>
        </div>

        {/* Permissions list */}
        <div className="px-4 pb-4 max-h-80 overflow-y-auto">
          {renderPermissionGroup(
            highRisk,
            'high',
            <ShieldAlert className="w-3.5 h-3.5" />,
            'bg-red-500/10 text-red-400'
          )}
          {renderPermissionGroup(
            mediumRisk,
            'medium',
            <Shield className="w-3.5 h-3.5" />,
            'bg-yellow-500/10 text-yellow-400'
          )}
          {renderPermissionGroup(
            lowRisk,
            'low',
            <ShieldCheck className="w-3.5 h-3.5" />,
            'bg-green-500/10 text-green-400'
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-4 border-t border-zinc-800">
          <button
            onClick={onDeny}
            className="flex-1 px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={selectedPermissions.size === 0}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Allow Selected ({selectedPermissions.size})
          </button>
        </div>
      </div>
    </div>
  );
}
