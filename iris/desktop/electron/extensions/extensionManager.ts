/**
 * Extension Manager — orchestrates install/uninstall/activate/deactivate lifecycle.
 * Runs in the Electron Main Process.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { loadManifest } from './manifestValidator';
import { checkPermission, getAutoApprovedPermissions, getPermissionsRequiringApproval } from './permissionEnforcer';
import { ExtensionHost } from './extensionHost';
import { registerAllApiHandlers } from './apiHandlers/index';
import type {
  ExtensionManifest,
  ExtensionRuntimeInfo,
  ExtensionStatus,
  Permission,
  TrustTier,
  ExtHostApiCall,
  ExtHostApiResponse,
  ActivationEvent,
} from './ipcProtocol';

interface InstalledExtensionRecord {
  id: string;
  installPath: string;
  enabled: boolean;
  grantedPermissions: Permission[];
  trustTier: TrustTier;
  installedAt: string;
}

interface ExtensionsRegistry {
  extensions: InstalledExtensionRecord[];
}

export class ExtensionManager extends EventEmitter {
  private extensionsDir: string;
  private registryPath: string;
  private registry: ExtensionsRegistry = { extensions: [] };
  private manifests = new Map<string, ExtensionManifest>();
  private statuses = new Map<string, ExtensionStatus>();
  private extensionHost: ExtensionHost | null = null;
  private apiHandlers = new Map<string, (extId: string, args: unknown[]) => Promise<unknown>>();
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    super();
    this.extensionsDir = path.join(app.getPath('userData'), 'extensions');
    this.registryPath = path.join(this.extensionsDir, 'registry.json');
  }

  /** Initialize the manager — load registry, scan extensions, start host */
  async initialize(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow;

    // Ensure extensions directory exists
    mkdirSync(this.extensionsDir, { recursive: true });

    // Load registry
    this.loadRegistry();

    // Scan and validate all installed extensions
    for (const record of this.registry.extensions) {
      const result = loadManifest(record.installPath);
      if (result.valid && result.manifest) {
        this.manifests.set(record.id, result.manifest);
        this.statuses.set(record.id, record.enabled ? 'installed' : 'disabled');
      } else {
        console.warn(`[ExtManager] Invalid manifest for ${record.id}:`, result.errors);
        this.statuses.set(record.id, 'error');
      }
    }

    // Register all iris.* API handlers
    registerAllApiHandlers(this, () => this.mainWindow);

    // Start Extension Host process
    this.extensionHost = new ExtensionHost();
    this.extensionHost.on('api-call', (msg: ExtHostApiCall) => this.handleApiCall(msg));
    this.extensionHost.on('contribution', (msg) => {
      // Forward to renderer
      this.mainWindow?.webContents.send('extensions:contributionChanged', msg);
    });
    this.extensionHost.on('log', (msg) => {
      console.log(`[Ext:${msg.extensionId}]`, msg.payload.level, msg.payload.message);
    });
    await this.extensionHost.start();

    // Activate extensions with onStartup
    await this.activateByEvent('onStartup');

    console.log(`[ExtManager] Initialized with ${this.registry.extensions.length} extensions`);
  }

  /** Shutdown — deactivate all extensions and kill host */
  async shutdown(): Promise<void> {
    if (this.extensionHost) {
      // Deactivate all active extensions
      for (const [id, status] of this.statuses) {
        if (status === 'active') {
          await this.deactivateExtension(id);
        }
      }
      await this.extensionHost.stop();
      this.extensionHost = null;
    }
  }

  // ─── Install / Uninstall ───

  /**
   * Install an extension from a directory (already extracted).
   * In production, the .iex file would be downloaded and extracted first.
   */
  async installFromDirectory(sourceDir: string, trustTier: TrustTier = 'community'): Promise<{ success: boolean; error?: string; extensionId?: string }> {
    const result = loadManifest(sourceDir);
    if (!result.valid || !result.manifest) {
      return { success: false, error: `Invalid manifest: ${result.errors.join(', ')}` };
    }

    const manifest = result.manifest;
    const installDir = path.join(this.extensionsDir, manifest.id);

    // Check if already installed
    if (this.registry.extensions.some((e) => e.id === manifest.id)) {
      return { success: false, error: `Extension "${manifest.id}" is already installed` };
    }

    // Copy extension files to install directory
    try {
      this.copyDirectory(sourceDir, installDir);
    } catch (err) {
      return { success: false, error: `Failed to copy files: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Determine auto-approved and user-required permissions
    const autoApproved = getAutoApprovedPermissions(trustTier);
    const allPermissions = manifest.permissions || [];
    const grantedPermissions = allPermissions.filter((p) => autoApproved.includes(p));

    // Create registry record
    const record: InstalledExtensionRecord = {
      id: manifest.id,
      installPath: installDir,
      enabled: true,
      grantedPermissions,
      trustTier,
      installedAt: new Date().toISOString(),
    };

    this.registry.extensions.push(record);
    this.saveRegistry();
    this.manifests.set(manifest.id, manifest);
    this.statuses.set(manifest.id, 'installed');

    // Notify renderer
    this.emitStatusChanged(manifest.id);

    // Check if permissions need user approval
    const needsApproval = getPermissionsRequiringApproval(allPermissions, trustTier);
    if (needsApproval.length > 0) {
      // Renderer will show permission dialog → call grantPermissions later
      this.mainWindow?.webContents.send('extensions:permissionRequired', {
        extensionId: manifest.id,
        manifest,
        requiredPermissions: needsApproval,
      });
    } else {
      // All permissions auto-approved, activate if has onStartup
      if (manifest.activationEvents.includes('onStartup')) {
        await this.activateExtension(manifest.id);
      }
    }

    return { success: true, extensionId: manifest.id };
  }

  /** Uninstall an extension */
  async uninstallExtension(extensionId: string): Promise<{ success: boolean }> {
    // Deactivate first
    if (this.statuses.get(extensionId) === 'active') {
      await this.deactivateExtension(extensionId);
    }

    // Remove from registry
    this.registry.extensions = this.registry.extensions.filter((e) => e.id !== extensionId);
    this.saveRegistry();

    // Remove files
    const installDir = path.join(this.extensionsDir, extensionId);
    if (existsSync(installDir)) {
      rmSync(installDir, { recursive: true, force: true });
    }

    this.manifests.delete(extensionId);
    this.statuses.delete(extensionId);
    this.emitStatusChanged(extensionId);

    return { success: true };
  }

  // ─── Enable / Disable ───

  async enableExtension(extensionId: string): Promise<{ success: boolean }> {
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) return { success: false };

    record.enabled = true;
    this.saveRegistry();
    this.statuses.set(extensionId, 'installed');
    this.emitStatusChanged(extensionId);

    // Activate if onStartup
    const manifest = this.manifests.get(extensionId);
    if (manifest?.activationEvents.includes('onStartup')) {
      await this.activateExtension(extensionId);
    }

    return { success: true };
  }

  async disableExtension(extensionId: string): Promise<{ success: boolean }> {
    if (this.statuses.get(extensionId) === 'active') {
      await this.deactivateExtension(extensionId);
    }

    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) return { success: false };

    record.enabled = false;
    this.saveRegistry();
    this.statuses.set(extensionId, 'disabled');
    this.emitStatusChanged(extensionId);

    return { success: true };
  }

  // ─── Permissions ───

  grantPermissions(extensionId: string, permissions: Permission[]): { success: boolean } {
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) return { success: false };

    for (const p of permissions) {
      if (!record.grantedPermissions.includes(p)) {
        record.grantedPermissions.push(p);
      }
    }
    this.saveRegistry();
    return { success: true };
  }

  // ─── Activation ───

  /** Activate a specific extension by id */
  async activateExtension(extensionId: string): Promise<void> {
    const manifest = this.manifests.get(extensionId);
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!manifest || !record || !record.enabled) return;
    if (this.statuses.get(extensionId) === 'active') return;

    this.statuses.set(extensionId, 'activating');
    this.emitStatusChanged(extensionId);

    try {
      await this.extensionHost?.activateExtension(
        extensionId,
        record.installPath,
        manifest.main
      );
      this.statuses.set(extensionId, 'active');
    } catch (err) {
      console.error(`[ExtManager] Failed to activate ${extensionId}:`, err);
      this.statuses.set(extensionId, 'error');
    }

    this.emitStatusChanged(extensionId);
  }

  /** Deactivate a specific extension */
  async deactivateExtension(extensionId: string): Promise<void> {
    if (this.statuses.get(extensionId) !== 'active') return;

    this.statuses.set(extensionId, 'deactivating');
    this.emitStatusChanged(extensionId);

    try {
      await this.extensionHost?.deactivateExtension(extensionId);
      this.statuses.set(extensionId, 'installed');
    } catch (err) {
      console.error(`[ExtManager] Failed to deactivate ${extensionId}:`, err);
      this.statuses.set(extensionId, 'error');
    }

    this.emitStatusChanged(extensionId);
  }

  /** Activate all extensions matching a given activation event */
  async activateByEvent(event: ActivationEvent | string): Promise<void> {
    for (const [id, manifest] of this.manifests) {
      const record = this.registry.extensions.find((e) => e.id === id);
      if (!record?.enabled) continue;
      if (this.statuses.get(id) === 'active') continue;

      const matches = manifest.activationEvents.some((ae) => {
        if (ae === event) return true;
        // Match prefix events like onCommand:ext.cmd against onCommand:*
        if (ae.includes(':') && event.includes(':')) {
          const [aePrefix] = ae.split(':');
          const [evPrefix] = event.split(':');
          return aePrefix === evPrefix && ae === event;
        }
        return false;
      });

      if (matches) {
        await this.activateExtension(id);
      }
    }
  }

  // ─── Command / Tool Execution ───

  /** Execute a command registered by an extension */
  async executeCommand(commandId: string, args?: unknown[]): Promise<unknown> {
    // Find which extension registered this command
    await this.activateByEvent(`onCommand:${commandId}`);

    if (!this.extensionHost) {
      throw new Error('Extension host not running');
    }

    return this.extensionHost.executeCommand(commandId, args);
  }

  /** Execute a tool registered by an extension */
  async executeTool(toolId: string, params: unknown): Promise<unknown> {
    await this.activateByEvent(`onTool:${toolId}`);

    if (!this.extensionHost) {
      throw new Error('Extension host not running');
    }

    return this.extensionHost.executeTool(toolId, params);
  }

  // ─── Query ───

  getInstalledExtensions(): ExtensionRuntimeInfo[] {
    return this.registry.extensions.map((record) => ({
      id: record.id,
      manifest: this.manifests.get(record.id)!,
      status: this.statuses.get(record.id) || 'installed',
      installPath: record.installPath,
      trustTier: record.trustTier,
      grantedPermissions: record.grantedPermissions,
    })).filter((e) => e.manifest);
  }

  getExtensionStatus(extensionId: string): ExtensionRuntimeInfo | null {
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) return null;
    const manifest = this.manifests.get(extensionId);
    if (!manifest) return null;

    return {
      id: record.id,
      manifest,
      status: this.statuses.get(extensionId) || 'installed',
      installPath: record.installPath,
      trustTier: record.trustTier,
      grantedPermissions: record.grantedPermissions,
    };
  }

  // ─── API Handler Registration ───

  /** Register a handler for iris.* API calls from extensions */
  registerApiHandler(
    namespace: string,
    method: string,
    handler: (extensionId: string, args: unknown[]) => Promise<unknown>
  ): void {
    this.apiHandlers.set(`${namespace}.${method}`, handler);
  }

  // ─── Private ───

  private async handleApiCall(msg: ExtHostApiCall): Promise<void> {
    const { requestId, extensionId, payload } = msg;
    const apiKey = `${payload.namespace}.${payload.method}`;

    // Permission check
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) {
      this.sendApiResponse(requestId, extensionId, undefined, {
        code: 'EXTENSION_NOT_FOUND',
        message: `Extension "${extensionId}" not found in registry`,
      });
      return;
    }

    const permCheck = checkPermission(payload.namespace, payload.method, record.grantedPermissions);
    if (!permCheck.allowed) {
      this.sendApiResponse(requestId, extensionId, undefined, {
        code: 'PERMISSION_DENIED',
        message: permCheck.reason || `Permission denied for ${apiKey}`,
      });
      return;
    }

    // Find and execute handler
    const handler = this.apiHandlers.get(apiKey);
    if (!handler) {
      this.sendApiResponse(requestId, extensionId, undefined, {
        code: 'API_NOT_FOUND',
        message: `No handler registered for ${apiKey}`,
      });
      return;
    }

    try {
      const result = await handler(extensionId, payload.args);
      this.sendApiResponse(requestId, extensionId, result);
    } catch (err) {
      this.sendApiResponse(requestId, extensionId, undefined, {
        code: 'API_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sendApiResponse(
    requestId: string,
    extensionId: string,
    result?: unknown,
    error?: { code: string; message: string }
  ): void {
    const response: ExtHostApiResponse = {
      type: 'api-response',
      requestId,
      extensionId,
      payload: error ? { error } : { result },
    };
    this.extensionHost?.sendMessage(response);
  }

  private emitStatusChanged(extensionId: string): void {
    const info = this.getExtensionStatus(extensionId);
    this.emit('statusChanged', extensionId, info);
    this.mainWindow?.webContents.send('extensions:statusChanged', { extensionId, info });
  }

  private loadRegistry(): void {
    try {
      if (existsSync(this.registryPath)) {
        const data = readFileSync(this.registryPath, 'utf-8');
        this.registry = JSON.parse(data);
      }
    } catch {
      this.registry = { extensions: [] };
    }
  }

  private saveRegistry(): void {
    writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8');
  }

  private copyDirectory(src: string, dest: string): void {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      }
    }
  }
}
