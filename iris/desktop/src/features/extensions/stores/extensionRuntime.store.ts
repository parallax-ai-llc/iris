/**
 * Extension Runtime Store — manages contributions from active extensions.
 *
 * This store holds the runtime registry of tools, commands, workflow nodes,
 * panels, keybindings, and status bar items that extensions have registered.
 *
 * Separate from extension.store.ts which manages the marketplace/install state.
 */
import { create } from 'zustand';

// ─── Contribution Types ───

export interface ExtToolRegistration {
  id: string;
  extensionId: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
}

export interface ExtCommandRegistration {
  id: string;
  extensionId: string;
  title: string;
  icon?: string;
  category?: string;
}

export interface ExtWorkflowNodeRegistration {
  id: string;
  extensionId: string;
  name: string;
  category: string;
  inputs: { id: string; type: string; label?: string }[];
  outputs: { id: string; type: string; label?: string }[];
  configFields?: { id: string; type: string; label: string; default?: unknown }[];
}

export interface ExtPanelRegistration {
  id: string;
  extensionId: string;
  title: string;
  location: 'sidebar' | 'bottom' | 'floating';
  icon?: string;
  html?: string;
}

export interface ExtStatusBarRegistration {
  id: string;
  extensionId: string;
  text: string;
  tooltip?: string;
  priority?: number;
}

export interface ExtKeybindingRegistration {
  command: string;
  extensionId: string;
  key: string;
  when?: string;
}

export interface ExtMenuRegistration {
  menuId: string;
  extensionId: string;
  command: string;
  when?: string;
}

export type ExtensionActiveStatus = 'activating' | 'active' | 'error';

// ─── Store Interface ───

interface ExtensionRuntimeState {
  // Registered contributions
  registeredTools: Record<string, ExtToolRegistration>;
  registeredCommands: Record<string, ExtCommandRegistration>;
  registeredWorkflowNodes: Record<string, ExtWorkflowNodeRegistration>;
  registeredPanels: Record<string, ExtPanelRegistration>;
  registeredStatusBarItems: Record<string, ExtStatusBarRegistration>;
  registeredKeybindings: ExtKeybindingRegistration[];
  registeredMenuItems: ExtMenuRegistration[];

  // Extension runtime states
  activeExtensions: Record<string, { status: ExtensionActiveStatus; error?: string }>;

  // Actions — tools
  registerTool: (tool: ExtToolRegistration) => void;
  unregisterTool: (toolId: string) => void;

  // Actions — commands
  registerCommand: (cmd: ExtCommandRegistration) => void;
  unregisterCommand: (commandId: string) => void;

  // Actions — workflow nodes
  registerWorkflowNode: (node: ExtWorkflowNodeRegistration) => void;
  unregisterWorkflowNode: (nodeId: string) => void;

  // Actions — panels
  registerPanel: (panel: ExtPanelRegistration) => void;
  unregisterPanel: (panelId: string) => void;

  // Actions — status bar
  registerStatusBarItem: (item: ExtStatusBarRegistration) => void;
  unregisterStatusBarItem: (itemId: string) => void;

  // Actions — keybindings
  registerKeybinding: (kb: ExtKeybindingRegistration) => void;
  unregisterKeybinding: (command: string) => void;

  // Actions — menu items
  registerMenuItem: (item: ExtMenuRegistration) => void;
  unregisterMenuItem: (command: string, menuId: string) => void;

  // Actions — extension status
  setExtensionStatus: (extensionId: string, status: ExtensionActiveStatus, error?: string) => void;
  removeExtension: (extensionId: string) => void;

  // Bulk clear for deactivation
  clearExtensionContributions: (extensionId: string) => void;

  // Handle contribution message from main process
  handleContributionMessage: (msg: {
    extensionId: string;
    payload: { action: 'register' | 'unregister'; contributionType: string; data: unknown };
  }) => void;
}

export const useExtensionRuntimeStore = create<ExtensionRuntimeState>((set, get) => ({
  registeredTools: {},
  registeredCommands: {},
  registeredWorkflowNodes: {},
  registeredPanels: {},
  registeredStatusBarItems: {},
  registeredKeybindings: [],
  registeredMenuItems: [],
  activeExtensions: {},

  // ─── Tools ───
  registerTool: (tool) =>
    set((s) => ({ registeredTools: { ...s.registeredTools, [tool.id]: tool } })),
  unregisterTool: (toolId) =>
    set((s) => {
      const { [toolId]: _, ...rest } = s.registeredTools;
      return { registeredTools: rest };
    }),

  // ─── Commands ───
  registerCommand: (cmd) =>
    set((s) => ({ registeredCommands: { ...s.registeredCommands, [cmd.id]: cmd } })),
  unregisterCommand: (commandId) =>
    set((s) => {
      const { [commandId]: _, ...rest } = s.registeredCommands;
      return { registeredCommands: rest };
    }),

  // ─── Workflow Nodes ───
  registerWorkflowNode: (node) =>
    set((s) => ({ registeredWorkflowNodes: { ...s.registeredWorkflowNodes, [node.id]: node } })),
  unregisterWorkflowNode: (nodeId) =>
    set((s) => {
      const { [nodeId]: _, ...rest } = s.registeredWorkflowNodes;
      return { registeredWorkflowNodes: rest };
    }),

  // ─── Panels ───
  registerPanel: (panel) =>
    set((s) => ({ registeredPanels: { ...s.registeredPanels, [panel.id]: panel } })),
  unregisterPanel: (panelId) =>
    set((s) => {
      const { [panelId]: _, ...rest } = s.registeredPanels;
      return { registeredPanels: rest };
    }),

  // ─── Status Bar ───
  registerStatusBarItem: (item) =>
    set((s) => ({ registeredStatusBarItems: { ...s.registeredStatusBarItems, [item.id]: item } })),
  unregisterStatusBarItem: (itemId) =>
    set((s) => {
      const { [itemId]: _, ...rest } = s.registeredStatusBarItems;
      return { registeredStatusBarItems: rest };
    }),

  // ─── Keybindings ───
  registerKeybinding: (kb) =>
    set((s) => ({ registeredKeybindings: [...s.registeredKeybindings, kb] })),
  unregisterKeybinding: (command) =>
    set((s) => ({
      registeredKeybindings: s.registeredKeybindings.filter((kb) => kb.command !== command),
    })),

  // ─── Menu Items ───
  registerMenuItem: (item) =>
    set((s) => ({ registeredMenuItems: [...s.registeredMenuItems, item] })),
  unregisterMenuItem: (command, menuId) =>
    set((s) => ({
      registeredMenuItems: s.registeredMenuItems.filter(
        (m) => !(m.command === command && m.menuId === menuId)
      ),
    })),

  // ─── Extension Status ───
  setExtensionStatus: (extensionId, status, error) =>
    set((s) => ({
      activeExtensions: {
        ...s.activeExtensions,
        [extensionId]: { status, error },
      },
    })),

  removeExtension: (extensionId) =>
    set((s) => {
      const { [extensionId]: _, ...rest } = s.activeExtensions;
      return { activeExtensions: rest };
    }),

  // ─── Bulk Clear ───
  clearExtensionContributions: (extensionId) =>
    set((s) => {
      const registeredTools = { ...s.registeredTools };
      const registeredCommands = { ...s.registeredCommands };
      const registeredWorkflowNodes = { ...s.registeredWorkflowNodes };
      const registeredPanels = { ...s.registeredPanels };
      const registeredStatusBarItems = { ...s.registeredStatusBarItems };

      for (const [id, t] of Object.entries(registeredTools)) {
        if (t.extensionId === extensionId) delete registeredTools[id];
      }
      for (const [id, c] of Object.entries(registeredCommands)) {
        if (c.extensionId === extensionId) delete registeredCommands[id];
      }
      for (const [id, n] of Object.entries(registeredWorkflowNodes)) {
        if (n.extensionId === extensionId) delete registeredWorkflowNodes[id];
      }
      for (const [id, p] of Object.entries(registeredPanels)) {
        if (p.extensionId === extensionId) delete registeredPanels[id];
      }
      for (const [id, sb] of Object.entries(registeredStatusBarItems)) {
        if (sb.extensionId === extensionId) delete registeredStatusBarItems[id];
      }

      return {
        registeredTools,
        registeredCommands,
        registeredWorkflowNodes,
        registeredPanels,
        registeredStatusBarItems,
        registeredKeybindings: s.registeredKeybindings.filter(
          (kb) => kb.extensionId !== extensionId
        ),
        registeredMenuItems: s.registeredMenuItems.filter(
          (m) => m.extensionId !== extensionId
        ),
      };
    }),

  // ─── Handle IPC contribution messages ───
  handleContributionMessage: (msg) => {
    const { extensionId, payload } = msg;
    const { action, contributionType, data } = payload;
    const state = get();

    if (action === 'register') {
      switch (contributionType) {
        case 'command':
          state.registerCommand({ ...(data as Omit<ExtCommandRegistration, 'extensionId'>), extensionId });
          break;
        case 'tool':
          state.registerTool({ ...(data as Omit<ExtToolRegistration, 'extensionId'>), extensionId });
          break;
        case 'workflowNode':
          state.registerWorkflowNode({ ...(data as Omit<ExtWorkflowNodeRegistration, 'extensionId'>), extensionId });
          break;
        case 'panel':
          state.registerPanel({ ...(data as Omit<ExtPanelRegistration, 'extensionId'>), extensionId });
          break;
        case 'statusBarItem':
          state.registerStatusBarItem({ ...(data as Omit<ExtStatusBarRegistration, 'extensionId'>), extensionId });
          break;
      }
    } else if (action === 'unregister') {
      const id = (data as { id: string }).id;
      switch (contributionType) {
        case 'command':
          state.unregisterCommand(id);
          break;
        case 'tool':
          state.unregisterTool(id);
          break;
        case 'workflowNode':
          state.unregisterWorkflowNode(id);
          break;
        case 'panel':
          state.unregisterPanel(id);
          break;
        case 'statusBarItem':
          state.unregisterStatusBarItem(id);
          break;
      }
    }
  },
}));
