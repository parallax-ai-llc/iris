import { app, Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Replaces Electron's default application menu.
 *
 * The default menu owns accelerators the renderer's shortcut dispatcher needs
 * or must never trigger by accident: Ctrl+W (close window), Ctrl+R (reload),
 * Ctrl+0/+/- (page zoom), Ctrl+Y (redo), Ctrl+M (minimize). Any key a screen
 * did not consume fell through to them, so Ctrl+W in the video editor closed
 * the whole window.
 *
 * - Windows/Linux: the window is frameless and every menu is rendered by the
 *   app itself, so no native menu is installed. Text fields keep their native
 *   cut/copy/paste/undo without one.
 * - macOS: a menu is required for Cmd+C/V/X/A/Z to reach text fields, and for
 *   Cmd+Q/H. Only those roles are kept: no close, reload or zoom items.
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
