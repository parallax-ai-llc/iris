/**
 * Extension Manager — orchestrates install/uninstall/activate/deactivate lifecycle.
 * Runs in the Electron Main Process.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
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
  ExtHostContribution,
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

/**
 * Directory/file names never copied into the install directory.
 * `iris-ext create` scaffolds a full project (the local-install UI points at
 * that project root), so a naive copy would drag hundreds of MB of
 * devDependencies and VCS history into userData. Build output (`dist/`) and
 * the manifest's `main` entry are deliberately NOT excluded.
 */
const COPY_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.svn',
  '.hg',
  '.vscode',
  '.idea',
  '.turbo',
  '.cache',
  'coverage',
]);

const COPY_EXCLUDED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitignore',
  '.npmrc',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);

/**
 * Errors Windows reports while a just-deleted directory is still "delete
 * pending" — the name is gone from listings but the OS has not released it, so
 * recreating it fails until the last handle on its files is closed.
 */
const TRANSIENT_FS_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

/**
 * Backoff before each attempt at creating a directory (first attempt: no wait).
 * Spans ~3.5s in total — the observed delete-pending window is ~1.5s.
 */
const DIR_CREATE_RETRY_DELAYS_MS = [0, 25, 50, 100, 200, 400, 800, 1000, 1000];

function isTransientFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' && TRANSIENT_FS_ERROR_CODES.has(code);
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ExtensionManager extends EventEmitter {
  private extensionsDir: string;
  private registryPath: string;
  private registry: ExtensionsRegistry = { extensions: [] };
  private manifests = new Map<string, ExtensionManifest>();
  private statuses = new Map<string, ExtensionStatus>();
  private extensionHost: ExtensionHost | null = null;
  private apiHandlers = new Map<string, (extId: string, args: unknown[]) => Promise<unknown>>();
  private mainWindow: BrowserWindow | null = null;
  /**
   * Snapshot of runtime contributions currently registered by active
   * extensions. onStartup activation happens before the renderer mounts its
   * listeners, so push-only delivery loses those contributions on every app
   * start; the renderer re-hydrates from here via `extensions:getContributions`.
   */
  private contributions: ExtHostContribution[] = [];

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

    // Scan and validate all installed extensions.
    // A record whose install directory no longer exists (deleted outside the
    // app) is dropped from the registry: nothing can be recovered from it, and
    // keeping it leaves a ghost entry that blocks re-installation. A directory
    // that exists but fails validation is KEPT as 'error' — the files and the
    // user's granted permissions are still there, so it is repairable and
    // re-installing over it is allowed (see installFromDirectory).
    const survivors: InstalledExtensionRecord[] = [];
    const pruned: string[] = [];
    for (const record of this.registry.extensions) {
      if (!existsSync(record.installPath)) {
        console.warn(`[ExtManager] Dropping registry entry for ${record.id} — install directory is gone: ${record.installPath}`);
        pruned.push(record.id);
        continue;
      }
      survivors.push(record);

      const result = loadManifest(record.installPath);
      if (result.valid && result.manifest) {
        this.manifests.set(record.id, result.manifest);
        this.statuses.set(record.id, record.enabled ? 'installed' : 'disabled');
      } else {
        console.warn(`[ExtManager] Invalid manifest for ${record.id}:`, result.errors);
        this.statuses.set(record.id, 'error');
      }
    }

    if (pruned.length > 0) {
      this.registry.extensions = survivors;
      this.saveRegistry();
      this.sendToRenderer('extensions:registryPruned', { extensionIds: pruned });
    }

    // Register all iris.* API handlers
    registerAllApiHandlers(this, () => this.mainWindow);

    // Start Extension Host process
    this.extensionHost = new ExtensionHost();
    this.extensionHost.on('api-call', (msg: ExtHostApiCall) => this.handleApiCall(msg));
    this.extensionHost.on('contribution', (msg) => {
      // workflowNodes are a v1 non-goal — ignore the contribution with a
      // warning instead of forwarding it (consistent with install-time policy).
      if (msg?.payload?.contributionType === 'workflowNode') {
        console.warn(`[ExtManager] Ignoring workflowNode contribution from ${msg.extensionId} (custom workflow nodes are not supported yet)`);
        this.sendToRenderer('extensions:contributionIgnored', {
          extensionId: msg.extensionId,
          contributionType: 'workflowNode',
          reason: 'Custom workflow nodes are not supported yet',
        });
        return;
      }
      // Fill in manifest metadata (title/icon/category) the worker cannot
      // know, keep the snapshot in sync, then forward to the renderer.
      const enriched = this.enrichContribution(msg);
      this.recordContribution(enriched);
      this.sendToRenderer('extensions:contributionChanged', enriched);
    });
    this.extensionHost.on('log', (msg) => {
      if (msg.payload.level === 'error') {
        console.error(`[Ext:${msg.extensionId}]`, msg.payload.message);
      } else {
        console.warn(`[Ext:${msg.extensionId}]`, msg.payload.level, msg.payload.message);
      }
    });
    try {
      await this.extensionHost.start();
    } catch (err) {
      // Do not hide the failure: log, notify the renderer, and propagate.
      this.extensionHost = null;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ExtManager] Extension host failed to start:', message);
      this.sendToRenderer('extensions:hostError', { error: message });
      throw err;
    }

    // Activate extensions with onStartup
    await this.activateByEvent('onStartup');

    console.log(`[ExtManager] Initialized with ${this.registry.extensions.length} extensions`);
  }

  /**
   * Shutdown — deactivate all extensions and kill the host.
   *
   * Runs on app quit, so it must never throw: a rejection here stalls the
   * quit sequence (and, in E2E, hangs Playwright's teardown). One extension
   * failing to deactivate must not prevent the others — or the host stop —
   * from being cleaned up.
   */
  async shutdown(): Promise<void> {
    if (!this.extensionHost) return;

    const host = this.extensionHost;
    // Snapshot: deactivateExtension mutates this.statuses while we iterate.
    const active = [...this.statuses.entries()]
      .filter(([, status]) => status === 'active')
      .map(([id]) => id);

    for (const id of active) {
      try {
        await this.deactivateExtension(id);
      } catch (err) {
        console.error(`[ExtManager] Failed to deactivate ${id} during shutdown:`, err);
      }
    }

    try {
      await host.stop();
    } catch (err) {
      console.error('[ExtManager] Failed to stop the extension host:', err);
    } finally {
      this.extensionHost = null;
    }
  }

  // ─── Install / Uninstall ───

  /**
   * Install an extension from a directory (already extracted).
   * With `opts.upgrade`, an already-installed extension with the same id is
   * deactivated, replaced in place, and re-activated. Without it, installing
   * over an existing id is rejected (existing behavior).
   */
  async installFromDirectory(
    sourceDir: string,
    trustTier: TrustTier = 'community',
    opts?: { upgrade?: boolean }
  ): Promise<{ success: boolean; error?: string; extensionId?: string }> {
    const result = loadManifest(sourceDir);
    if (!result.valid || !result.manifest) {
      return { success: false, error: `Invalid manifest: ${result.errors.join(', ')}` };
    }

    const manifest = result.manifest;
    const installDir = path.join(this.extensionsDir, manifest.id);

    // Check if already installed.
    // A record stuck in 'error' (files present but unloadable) is treated as
    // replaceable so a plain re-install repairs it instead of failing with
    // "already installed" and leaving the user to hand-edit registry.json.
    const existing = this.registry.extensions.find((e) => e.id === manifest.id);
    const isBroken = existing !== undefined && this.statuses.get(manifest.id) === 'error';
    const replacing = opts?.upgrade === true || isBroken;
    if (existing && !replacing) {
      return { success: false, error: `Extension "${manifest.id}" is already installed` };
    }

    // Upgrade path: deactivate the running instance and clear the old files.
    let wasActive = false;
    let previouslyGranted: Permission[] = [];
    if (existing) {
      wasActive = this.statuses.get(manifest.id) === 'active';
      previouslyGranted = existing.grantedPermissions;
      if (wasActive) {
        await this.deactivateExtension(manifest.id);
      }
      if (existsSync(installDir)) {
        rmSync(installDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }

    // Copy extension files to install directory (dev artifacts excluded)
    try {
      await this.createInstallDir(installDir);
      this.copyDirectory(sourceDir, installDir, this.mainEntryKeepPaths(manifest.main));
    } catch (err) {
      return { success: false, error: `Failed to copy files: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Safety net: the copy exclusion list must never drop the entry point.
    const installedMain = path.resolve(installDir, manifest.main);
    if (!existsSync(installedMain)) {
      rmSync(installDir, { recursive: true, force: true });
      return { success: false, error: `Entry file "${manifest.main}" is missing after install` };
    }

    // Example/CLI bundles are ESM with a plain .js extension — without a
    // package.json "type": "module" Node resolves them as CJS and the
    // dynamic import in the worker fails on `import`/`export` syntax.
    this.ensureModulePackageJson(installDir);

    // workflowNodes contributions are a v1 non-goal: install is allowed, but
    // the contribution point is ignored with a warning (policy: ignore + warn).
    if (manifest.contributes?.workflowNodes && manifest.contributes.workflowNodes.length > 0) {
      console.warn(`[ExtManager] Extension "${manifest.id}" contributes workflowNodes — ignored (custom workflow nodes are not supported yet)`);
      this.sendToRenderer('extensions:contributionIgnored', {
        extensionId: manifest.id,
        contributionType: 'workflowNode',
        reason: 'Custom workflow nodes are not supported yet',
      });
    }

    // Determine auto-approved and user-required permissions.
    // On upgrade, permissions the user already granted stay granted (when the
    // new manifest still requests them).
    const autoApproved = getAutoApprovedPermissions(trustTier);
    const allPermissions = manifest.permissions || [];
    const grantedPermissions = allPermissions.filter(
      (p) => autoApproved.includes(p) || previouslyGranted.includes(p)
    );

    if (existing) {
      existing.installPath = installDir;
      existing.enabled = true;
      existing.grantedPermissions = grantedPermissions;
      existing.trustTier = trustTier;
      existing.installedAt = new Date().toISOString();
    } else {
      const record: InstalledExtensionRecord = {
        id: manifest.id,
        installPath: installDir,
        enabled: true,
        grantedPermissions,
        trustTier,
        installedAt: new Date().toISOString(),
      };
      this.registry.extensions.push(record);
    }

    this.saveRegistry();
    this.manifests.set(manifest.id, manifest);
    this.statuses.set(manifest.id, 'installed');

    // Notify renderer
    this.emitStatusChanged(manifest.id);

    // Check if permissions need user approval (already-granted ones excluded)
    const needsApproval = getPermissionsRequiringApproval(allPermissions, trustTier)
      .filter((p) => !grantedPermissions.includes(p));
    if (needsApproval.length > 0) {
      // Renderer will show permission dialog → call grantPermissions later
      this.sendToRenderer('extensions:permissionRequired', {
        extensionId: manifest.id,
        manifest,
        requiredPermissions: needsApproval,
      });
    } else {
      // All permissions granted — activate if it was running before the
      // upgrade, or declares onStartup.
      if (wasActive || manifest.activationEvents.includes('onStartup')) {
        await this.activateExtension(manifest.id);
      }
    }

    return { success: true, extensionId: manifest.id };
  }

  /**
   * Install an extension from a `.iex` bundle (ZIP).
   * `source` may be an http(s) URL (downloaded) or a local file path.
   * The bundle is extracted to a temp directory, then installed via
   * installFromDirectory().
   */
  async installFromIex(
    source: string,
    trustTier: TrustTier = 'community',
    opts?: { upgrade?: boolean }
  ): Promise<{ success: boolean; error?: string; extensionId?: string }> {
    const tempDir = path.join(
      app.getPath('temp'),
      `iris-ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    );

    try {
      let zip: AdmZip;
      if (/^https?:\/\//i.test(source)) {
        let res: Response;
        try {
          res = await fetch(source);
        } catch (err) {
          return { success: false, error: `Failed to download bundle: ${err instanceof Error ? err.message : String(err)}` };
        }
        if (!res.ok) {
          return { success: false, error: `Failed to download bundle: HTTP ${res.status}` };
        }
        zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
      } else {
        if (!existsSync(source)) {
          return { success: false, error: `Bundle not found: ${source}` };
        }
        zip = new AdmZip(source);
      }

      zip.extractAllTo(tempDir, true);

      // Manifest at the bundle root, or inside a single top-level directory.
      let sourceDir = tempDir;
      if (!existsSync(path.join(sourceDir, 'iris-extension.json'))) {
        const dirs = readdirSync(tempDir, { withFileTypes: true }).filter((e) => e.isDirectory());
        if (dirs.length === 1 && existsSync(path.join(tempDir, dirs[0].name, 'iris-extension.json'))) {
          sourceDir = path.join(tempDir, dirs[0].name);
        } else {
          return { success: false, error: 'Bundle does not contain iris-extension.json' };
        }
      }

      return await this.installFromDirectory(sourceDir, trustTier, opts);
    } catch (err) {
      return { success: false, error: `Failed to install bundle: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[ExtManager] Failed to clean up temp dir ${tempDir}:`, err);
      }
    }
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

    // Remove files. Same delete-after-deactivate hazard as the upgrade path:
    // on Windows a handle the OS has not released yet makes the delete fail
    // outright, so give it a few tries.
    const installDir = path.join(this.extensionsDir, extensionId);
    if (existsSync(installDir)) {
      rmSync(installDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }

    this.manifests.delete(extensionId);
    this.statuses.delete(extensionId);
    this.clearContributions(extensionId);
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

  async grantPermissions(extensionId: string, permissions: Permission[]): Promise<{ success: boolean }> {
    const record = this.registry.extensions.find((e) => e.id === extensionId);
    if (!record) return { success: false };

    for (const p of permissions) {
      if (!record.grantedPermissions.includes(p)) {
        record.grantedPermissions.push(p);
      }
    }
    this.saveRegistry();

    // Activate now that permissions are granted — no restart required.
    // Lazy activation events (onCommand:/onTool: …) still activate on demand.
    const manifest = this.manifests.get(extensionId);
    if (
      record.enabled &&
      manifest?.activationEvents.includes('onStartup') &&
      this.statuses.get(extensionId) !== 'active'
    ) {
      await this.activateExtension(extensionId);
    }

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

    // Contributions die with the worker — drop them from the snapshot.
    this.clearContributions(extensionId);

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
        // Wildcard: an activation event like "onCommand:*" matches any event
        // with the same prefix (e.g. "onCommand:my-ext.hello").
        if (ae.endsWith(':*') && event.includes(':')) {
          return event.startsWith(ae.slice(0, -1));
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

  // ─── Runtime contribution snapshot ───

  /**
   * Record a runtime contribution so the renderer can re-hydrate after a
   * reload/restart. Registers are appended (replacing an entry with the same
   * type+id), unregisters remove the matching entry.
   *
   * Also called by the window API for panels, which reach the renderer through
   * `extensions:createPanel` rather than a contribution message.
   */
  recordContribution(msg: ExtHostContribution): void {
    const { extensionId, payload } = msg;
    if (payload.contributionType === 'workflowNode') return; // v1 non-goal

    const idOf = (data: unknown): string | undefined => {
      if (!data || typeof data !== 'object') return undefined;
      const d = data as { id?: unknown; command?: unknown };
      if (typeof d.id === 'string') return d.id;
      if (typeof d.command === 'string') return d.command;
      return undefined;
    };

    const id = idOf(payload.data);
    const sameEntry = (c: ExtHostContribution) =>
      c.extensionId === extensionId &&
      c.payload.contributionType === payload.contributionType &&
      idOf(c.payload.data) === id;

    if (id !== undefined) {
      this.contributions = this.contributions.filter((c) => !sameEntry(c));
    }

    if (payload.action === 'register') {
      this.contributions.push({
        type: 'contribution',
        extensionId,
        payload: { action: 'register', contributionType: payload.contributionType, data: payload.data },
      });
    }
  }

  /**
   * Merge manifest-declared metadata into a runtime contribution.
   *
   * `iris.commands.register(id, handler)` carries no title — the documented
   * pattern is to declare the title in `contributes.commands` and register the
   * handler at runtime. Without this merge the renderer receives
   * `{ id }` only and falls back to showing the raw command id.
   * Values the extension supplied at runtime always win.
   */
  private enrichContribution(msg: ExtHostContribution): ExtHostContribution {
    const { payload } = msg;
    if (payload.action !== 'register') return msg;
    if (payload.contributionType !== 'command' && payload.contributionType !== 'tool') return msg;

    const data = payload.data;
    if (!data || typeof data !== 'object') return msg;
    const runtime = data as Record<string, unknown>;
    const id = typeof runtime.id === 'string' ? runtime.id : undefined;
    if (!id) return msg;

    const contributes = this.manifests.get(msg.extensionId)?.contributes;
    let declared: Record<string, unknown> | undefined;

    if (payload.contributionType === 'command') {
      const found = contributes?.commands?.find((c) => c.command === id);
      if (found) {
        declared = { title: found.title, icon: found.icon, category: found.category };
      }
    } else {
      const found = contributes?.tools?.find((t) => t.id === id);
      if (found) {
        declared = {
          name: found.name,
          category: found.category,
          icon: found.icon,
          description: found.description,
        };
      }
    }

    if (!declared) return msg;

    const merged: Record<string, unknown> = { ...runtime };
    for (const [key, value] of Object.entries(declared)) {
      if (value !== undefined && merged[key] === undefined) {
        merged[key] = value;
      }
    }

    return { ...msg, payload: { ...payload, data: merged } };
  }

  /**
   * All runtime contributions currently registered, as replayable
   * `extensions:contributionChanged` messages (every entry has
   * `payload.action === 'register'`).
   */
  getContributions(): ExtHostContribution[] {
    return this.contributions.map((c) => ({ ...c, payload: { ...c.payload } }));
  }

  /** Drop every recorded contribution for one extension (deactivate/uninstall). */
  private clearContributions(extensionId: string): void {
    this.contributions = this.contributions.filter((c) => c.extensionId !== extensionId);
  }

  /**
   * Forget a panel the user closed in the renderer.
   * Panels are recorded when `iris.window.createPanel` runs; without this the
   * snapshot would resurrect a dismissed panel on the next reload.
   */
  dismissPanel(panelId: string): { success: boolean } {
    const before = this.contributions.length;
    this.contributions = this.contributions.filter(
      (c) =>
        !(
          c.payload.contributionType === 'panel' &&
          (c.payload.data as { id?: unknown } | null)?.id === panelId
        )
    );
    return { success: this.contributions.length < before };
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

  /**
   * Send an event to the renderer, tolerating a window that is closing or gone.
   *
   * Optional chaining alone is NOT enough: after the window is destroyed the
   * reference is still a live object, and `webContents.send` throws
   * "Object has been destroyed". That escaped through emitStatusChanged →
   * deactivateExtension → shutdown() and aborted app teardown. `webContents`
   * can also be destroyed independently of the window, so both are checked,
   * and the send itself is wrapped — the window can be torn down between the
   * check and the call.
   */
  private sendToRenderer(channel: string, payload: unknown): void {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;

    const contents = win.webContents;
    if (!contents || contents.isDestroyed()) return;

    try {
      contents.send(channel, payload);
    } catch (err) {
      // Destroyed between the guard and the send — never fatal for the caller.
      console.warn(`[ExtManager] Dropped "${channel}" — renderer is gone:`, err);
    }
  }

  private emitStatusChanged(extensionId: string): void {
    const info = this.getExtensionStatus(extensionId);
    this.emit('statusChanged', extensionId, info);
    this.sendToRenderer('extensions:statusChanged', { extensionId, info });
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

  /**
   * Guarantee that the install directory resolves `.js` files as ESM.
   * Creates `{"type":"module"}` when package.json is missing, or adds the
   * `type` field when it exists without one. An explicit `"type"` set by the
   * extension author is respected.
   */
  private ensureModulePackageJson(installDir: string): void {
    const pkgPath = path.join(installDir, 'package.json');
    try {
      if (!existsSync(pkgPath)) {
        writeFileSync(pkgPath, `${JSON.stringify({ type: 'module' }, null, 2)}\n`, 'utf-8');
        return;
      }
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      if (typeof pkg !== 'object' || pkg === null) return;
      if (!('type' in pkg)) {
        pkg.type = 'module';
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
      }
    } catch (err) {
      console.warn(`[ExtManager] Failed to ensure ESM package.json in ${installDir}:`, err);
    }
  }

  /**
   * Create the install directory, retrying while the OS still holds the path.
   *
   * An upgrade deletes the old install directory and recreates it under the
   * same name. On Windows the delete only completes once every handle on the
   * old files is closed; until then the path is "delete pending" and mkdir
   * fails with EPERM. Awaiting worker termination (see `retireWorker` in
   * extensionHostProcess.ts) closes the extension's own handle, but a virus
   * scanner or an editor watching the folder can hold it a moment longer — so
   * back off and retry instead of failing the developer's reinstall.
   */
  private async createInstallDir(dir: string): Promise<void> {
    let lastError: unknown;
    for (const wait of DIR_CREATE_RETRY_DELAYS_MS) {
      if (wait > 0) await delay(wait);
      try {
        mkdirSync(dir, { recursive: true });
        return;
      } catch (err) {
        if (!isTransientFsError(err)) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Copy an extension source tree, skipping development-only artifacts
   * (see COPY_EXCLUDED_DIRS/FILES). `keepRelPaths` holds paths that must never
   * be skipped — the manifest's `main` entry and its ancestors — so an
   * exclusion can never remove the entry point.
   */
  private copyDirectory(src: string, dest: string, keepRelPaths?: Set<string>, relBase = ''): void {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      const mustKeep = keepRelPaths?.has(rel) ?? false;

      if (entry.isDirectory()) {
        if (!mustKeep && COPY_EXCLUDED_DIRS.has(entry.name)) continue;
        this.copyDirectory(srcPath, destPath, keepRelPaths, rel);
      } else {
        if (!mustKeep && COPY_EXCLUDED_FILES.has(entry.name)) continue;
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      }
    }
  }

  /**
   * Every path segment of the manifest `main` entry, as forward-slash relative
   * paths — used to protect the entry point from the copy exclusion list.
   */
  private mainEntryKeepPaths(mainFile: string): Set<string> {
    const normalized = mainFile.replace(/\\/g, '/').replace(/^\.\//, '');
    const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
    const keep = new Set<string>();
    let acc = '';
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      keep.add(acc);
    }
    keep.add('iris-extension.json');
    return keep;
  }
}
