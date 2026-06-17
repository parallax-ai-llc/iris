/**
 * Extension Status Bar — renders status bar items contributed by extensions.
 */
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';

export function ExtensionStatusBar() {
  const statusBarItems = useExtensionRuntimeStore((s) => s.registeredStatusBarItems);

  const items = Object.values(statusBarItems).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-300 cursor-default"
          title={item.tooltip || `${item.extensionId}: ${item.text}`}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
