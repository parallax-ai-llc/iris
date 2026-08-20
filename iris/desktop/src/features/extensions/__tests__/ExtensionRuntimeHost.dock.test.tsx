/**
 * ExtensionRuntimeHost — panel dock layout regression tests.
 *
 * An installed extension must never cover app UI. The dock is a rail pinned to
 * the window's right edge (`position: fixed`), so the only thing keeping it off
 * the app is a matching inset on the surface underneath it: `.dt-shell-body`
 * for the standard shell, `.ext-dock-inset` (FullScreenLayout) for surfaces
 * rendered outside AppLayout.
 *
 * The layout tests below load the real `globals.css` into jsdom and measure the
 * inset each shell actually gets, rather than asserting on class-name strings.
 * The test this replaced only checked that the dock's className did not contain
 * "fixed" — which it never could, because the positioning lives in the
 * stylesheet, so it passed happily while the dock covered all three
 * full-screen editors.
 */
import { render, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ExtensionRuntimeHost } from '../components/ExtensionRuntimeHost';
import { useExtensionRuntimeStore } from '../stores/extensionRuntime.store';
import { AppLayout } from '@/app/layout/AppLayout';
import { FullScreenLayout } from '@/app/layout/FullScreenLayout';

// AppLayout's own chrome is irrelevant here and drags in half the app; the
// shell markup under test is AppLayout itself.
vi.mock('@/app/layout/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}));
vi.mock('@/app/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

const SRC_ROOT = path.resolve(__dirname, '../../..');
/** Viewport width the geometry assertions are expressed against. */
const VIEWPORT_WIDTH = 1280;

let dismissPanel: ReturnType<typeof vi.fn>;

function installStubElectronApi() {
  dismissPanel = vi.fn(() => Promise.resolve({ success: true }));
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    extensions: {
      removeAllListeners: vi.fn(),
      onContributionChanged: vi.fn(),
      onStatusChanged: vi.fn(),
      onPermissionRequired: vi.fn(),
      onContributionIgnored: vi.fn(),
      onHostError: vi.fn(),
      getContributions: vi.fn(() => Promise.resolve([])),
      dismissPanel,
      onRequest: vi.fn(() => () => {}),
      sendResponse: vi.fn(),
    },
  };
}

function resetStore() {
  useExtensionRuntimeStore.setState({
    registeredTools: {},
    registeredCommands: {},
    registeredWorkflowNodes: {},
    registeredPanels: {},
    registeredStatusBarItems: {},
    registeredKeybindings: [],
    registeredMenuItems: [],
    activeExtensions: {},
  });
}

function addPanel(id: string) {
  useExtensionRuntimeStore.getState().registerPanel({
    id,
    extensionId: 'pub.ext',
    title: 'Panel',
    location: 'sidebar',
    html: '<p>panel</p>',
  });
}

describe('ExtensionRuntimeHost panel dock', () => {
  beforeEach(() => {
    resetStore();
    installStubElectronApi();
    document.documentElement.style.removeProperty('--ext-panel-width');
  });

  it('reserves no layout space when no panel is open', () => {
    render(<ExtensionRuntimeHost />);
    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('');
    expect(document.querySelector('.ext-panel-dock')).toBeNull();
  });

  it('reserves rail width while a panel is open so app UI is not covered', () => {
    render(<ExtensionRuntimeHost />);
    act(() => addPanel('pub.ext.panel.1'));

    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('320px');
    expect(document.querySelector('.ext-panel-dock')).not.toBeNull();
  });

  it('releases the reserved width when the last panel closes', () => {
    render(<ExtensionRuntimeHost />);
    act(() => addPanel('pub.ext.panel.1'));
    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('320px');

    act(() => useExtensionRuntimeStore.getState().unregisterPanel('pub.ext.panel.1'));

    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('');
    expect(document.querySelector('.ext-panel-dock')).toBeNull();
  });

  it('releases the reserved width on unmount', () => {
    const { unmount } = render(<ExtensionRuntimeHost />);
    act(() => addPanel('pub.ext.panel.1'));
    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('320px');

    unmount();

    expect(document.documentElement.style.getPropertyValue('--ext-panel-width')).toBe('');
  });

  it('dismisses the panel in the main snapshot so a reload does not resurrect it', () => {
    render(<ExtensionRuntimeHost />);
    act(() => addPanel('pub.ext.panel.1'));

    // Close via the panel header button — the real user path.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
    });

    expect(dismissPanel).toHaveBeenCalledWith('pub.ext.panel.1');
    expect(useExtensionRuntimeStore.getState().registeredPanels['pub.ext.panel.1']).toBeUndefined();
  });
});

// ─── Layout: does the rail actually stay off the app? ───

/**
 * Resolve a computed value that may still reference `--ext-panel-width`.
 * jsdom applies the cascade but does not substitute custom properties, so the
 * substitution happens here, against the value ExtensionRuntimeHost set on
 * <html>. Returns pixels.
 */
function resolvePx(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  const varRef = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/.exec(raw);
  if (varRef) {
    const [, name, fallback] = varRef;
    const declared = document.documentElement.style.getPropertyValue(name).trim();
    return resolvePx(declared || fallback || '0px');
  }
  const px = /^(-?[\d.]+)px$/.exec(raw);
  if (!px) throw new Error(`unsupported length in layout test: "${raw}"`);
  return Number(px[1]);
}

/** Total right-edge inset applied to `el` by itself and every ancestor. */
function reservedInset(el: Element): number {
  let total = 0;
  for (let node: Element | null = el; node; node = node.parentElement) {
    total += resolvePx(getComputedStyle(node).paddingRight);
  }
  return total;
}

/** Left edge of the docked rail, in viewport pixels. */
function dockLeftEdge(): number {
  const dock = document.querySelector('.ext-panel-dock');
  if (!dock) throw new Error('no dock rendered');
  const style = getComputedStyle(dock);
  expect(style.position).toBe('fixed');
  expect(resolvePx(style.right)).toBe(0);
  return VIEWPORT_WIDTH - resolvePx(style.width);
}

describe('panel dock layout (real globals.css)', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = readFileSync(path.join(SRC_ROOT, 'styles/globals.css'), 'utf8');
    document.head.appendChild(style);
    // Sanity check: if jsdom failed to parse the sheet, every assertion below
    // would silently measure 0 instead of the real cascade.
    expect(style.sheet!.cssRules.length).toBeGreaterThan(100);
  });

  beforeEach(() => {
    resetStore();
    installStubElectronApi();
    document.documentElement.style.removeProperty('--ext-panel-width');
  });

  it('keeps the standard app shell clear of the rail', () => {
    render(
      <>
        <ExtensionRuntimeHost />
        <AppLayout>
          <span data-testid="page">page</span>
        </AppLayout>
      </>,
    );
    act(() => addPanel('pub.ext.panel.1'));

    const contentRightEdge = VIEWPORT_WIDTH - reservedInset(screen.getByTestId('page'));
    expect(contentRightEdge).toBe(dockLeftEdge());
  });

  it('keeps a full-screen surface clear of the rail', () => {
    render(
      <>
        <ExtensionRuntimeHost />
        <FullScreenLayout titleBar={<div data-testid="editor-title-bar" />}>
          <span data-testid="editor-body">canvas</span>
        </FullScreenLayout>
      </>,
    );
    act(() => addPanel('pub.ext.panel.1'));

    // The regression this guards: the image / video / workflow editors render
    // outside AppLayout, got no inset at all, and the opaque 320px rail landed
    // on top of the editor's own right panel.
    const contentRightEdge = VIEWPORT_WIDTH - reservedInset(screen.getByTestId('editor-body'));
    expect(contentRightEdge).toBe(dockLeftEdge());
  });

  it('leaves the title bar full width so the window controls stay put', () => {
    render(
      <>
        <ExtensionRuntimeHost />
        <FullScreenLayout titleBar={<div data-testid="editor-title-bar" />}>
          <span data-testid="editor-body">canvas</span>
        </FullScreenLayout>
      </>,
    );
    act(() => addPanel('pub.ext.panel.1'));

    expect(reservedInset(screen.getByTestId('editor-title-bar'))).toBe(0);
  });

  it('takes no room from either shell when no panel is open', () => {
    render(
      <>
        <ExtensionRuntimeHost />
        <AppLayout>
          <span data-testid="page">page</span>
        </AppLayout>
        <FullScreenLayout titleBar={<div />}>
          <span data-testid="editor-body">canvas</span>
        </FullScreenLayout>
      </>,
    );

    expect(reservedInset(screen.getByTestId('page'))).toBe(0);
    expect(reservedInset(screen.getByTestId('editor-body'))).toBe(0);
  });
});

// ─── Coverage: every full-window surface goes through a dock-aware shell ───

/** Every .tsx file under src/app. */
function appSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(path.join(SRC_ROOT, 'app'));
  return out;
}

describe('full-window surfaces', () => {
  it('render through a dock-aware shell instead of hand-rolling one', () => {
    // `h-screen` / `.dt-shell` claim the whole window, which only the two
    // shells may do — anything else has to compose one of them, or the
    // extension panel rail will cover it.
    const SHELLS = ['layout/AppLayout.tsx', 'layout/FullScreenLayout.tsx'];
    const claimsWindow = /(?<![\w-])(h-screen|dt-shell)(?![\w-])/;

    const offenders = appSourceFiles()
      .map((file) => ({
        file: path.relative(path.join(SRC_ROOT, 'app'), file).replace(/\\/g, '/'),
        source: readFileSync(file, 'utf8'),
      }))
      .filter(({ file, source }) => !SHELLS.includes(file) && claimsWindow.test(source))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
