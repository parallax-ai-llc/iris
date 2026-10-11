/**
 * No menu or toolbar entry may pretend to work: every edit mode the menu bar
 * or the tool strip switches to must be handled somewhere in the mounted
 * editor (a panel, overlay, modal or options bar), otherwise clicking it only
 * changes `editMode` and nothing happens.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'src/features/image-editor');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const MENU = 'components/tabs/EditorMenuBar.tsx';
const TOOLBAR = 'components/Toolbar/ToolPanel.tsx';
const SHORTCUTS = 'hooks/useImageEditorShortcuts.ts';
// Not mounted anywhere (kept for reference only), so it does not count as a renderer.
const UNMOUNTED = new Set(['components/Properties/PropertiesPanel.tsx']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (name === '__tests__') continue;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** Everything that can render or react to a mode, minus the files that only SET modes. */
const HANDLER_SOURCES = [...sourceFiles('components'), ...sourceFiles('hooks')]
  .filter((rel) => rel !== MENU && rel !== TOOLBAR && rel !== SHORTCUTS && !UNMOUNTED.has(rel))
  .map(read)
  .concat(readFileSync(resolve(process.cwd(), 'src/app/editor/ImageEditorPage.tsx'), 'utf8'))
  .join('\n');

const menuModes = [...read(MENU).matchAll(/setEditMode\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
const toolbarModes = [...read(TOOLBAR).matchAll(/type: 'editMode', mode: '([A-Za-z]+)'/g)].map((m) => m[1]);
const shortcutModes = [...read(SHORTCUTS).matchAll(/setEditMode\('([A-Za-z]+)'\)/g)].map((m) => m[1]);

/**
 * Entries removed because nothing renders them. Listed explicitly too because
 * some of these names also occur elsewhere for other reasons (e.g. the
 * 'layers' right-panel tab), which the generic check above cannot tell apart.
 */
const REMOVED_MODES = [
  'importSvg', 'layers', 'measure', 'freeTransform',
  'smartPortrait', 'superZoom', 'makeupTransfer', 'photoRestoration', 'landscapeMixer',
  'selectSky', 'selectFocusArea', 'singleRowMarquee', 'singleColumnMarquee', 'reselect',
];

describe('editor menu / toolbar edit modes', () => {
  it('finds the modes (sanity)', () => {
    expect(menuModes.length).toBeGreaterThan(5);
    expect(menuModes).toContain('crop');
  });

  it.each([...new Set([...menuModes, ...toolbarModes, ...shortcutModes])].filter((m) => m !== 'none'))(
    'mode "%s" has a handler in the mounted editor',
    (mode) => {
      expect(HANDLER_SOURCES).toMatch(new RegExp(`['"]${mode}['"]`));
    },
  );

  it.each(REMOVED_MODES)('no menu item, tool or shortcut switches to the unrendered mode "%s"', (mode) => {
    expect(menuModes).not.toContain(mode);
    expect(toolbarModes).not.toContain(mode);
    expect(shortcutModes).not.toContain(mode);
  });
});
