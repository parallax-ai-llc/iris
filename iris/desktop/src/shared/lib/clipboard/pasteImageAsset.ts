/**
 * Local-only clipboard / file-picker helpers.
 *
 * These intentionally do NOT upload the file to the server — pasted or picked
 * reference images are kept in memory as File objects and converted to base64
 * only at generation time. This avoids creating throwaway assets in the user's
 * storage every time they paste a screenshot.
 */

function blobToFile(blob: Blob, namePrefix: string): File {
  const mime = blob.type || 'image/png';
  const subtype = (mime.split('/')[1] || 'png').toLowerCase();
  const ext = subtype === 'jpeg' ? 'jpg' : subtype.split(';')[0];
  const filename = `${namePrefix}-${Date.now()}.${ext}`;
  return new File([blob], filename, { type: mime });
}

export interface PickOptions {
  /** Prefix used for the generated File name. Defaults to 'clipboard'. */
  namePrefix?: string;
}

/**
 * Read the first image from a ClipboardEvent and return it as a File.
 * Returns null when the event has no image attached.
 *
 * Used by the window-level Ctrl+V handler — no permission prompt needed because
 * the paste event itself grants clipboard access.
 */
export function imageFileFromPasteEvent(
  event: ClipboardEvent,
  options: PickOptions = {},
): File | null {
  const items = event.clipboardData?.items;
  if (!items || items.length === 0) return null;
  const namePrefix = options.namePrefix ?? 'clipboard';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) return blobToFile(blob, namePrefix);
    }
  }
  return null;
}

/**
 * Read the first image from `navigator.clipboard.read()` and return it as a File.
 *
 * Used by the explicit "Paste from Clipboard" button. May throw NotAllowedError
 * when the user denies clipboard permission — callers should handle that.
 */
export async function imageFileFromClipboardApi(
  options: PickOptions = {},
): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    throw new Error('Clipboard reading is not supported in this environment');
  }
  const namePrefix = options.namePrefix ?? 'clipboard';
  const items = await navigator.clipboard.read();

  for (const item of items) {
    const imageType = item.types.find((t) => t.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return blobToFile(blob, namePrefix);
  }
  return null;
}

export interface SelectFileOptions extends PickOptions {
  /**
   * Allowed file extensions (lowercase, no dot). Used by both the Electron
   * native dialog and the HTML <input> fallback's `accept` attribute.
   */
  extensions?: string[];
}

const DEFAULT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  psd: 'image/vnd.adobe.photoshop',
};

function inferMime(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return MIME_BY_EXT[ext] || 'image/png';
}

function pickFileViaBrowserInput(extensions: string[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = extensions.map((e) => `.${e}`).join(',');
    let resolved = false;

    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('focus', onFocus);
      resolve(file);
    };

    input.onchange = () => finish(input.files?.[0] ?? null);

    // If the user dismisses the picker without choosing, onchange never fires —
    // detect cancel by waiting for window focus to come back.
    const onFocus = () => {
      window.setTimeout(() => {
        if (!resolved && (!input.files || input.files.length === 0)) finish(null);
      }, 300);
    };
    window.addEventListener('focus', onFocus, { once: true });

    input.click();
  });
}

/**
 * Show a file picker (native dialog under Electron, HTML <input> in browser)
 * and return the chosen File. Returns null when the user cancels.
 *
 * No upload happens here — callers are responsible for keeping the File locally
 * or uploading explicitly.
 */
export async function pickImageFile(
  options: SelectFileOptions = {},
): Promise<File | null> {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;

  const electronFiles = (window as unknown as {
    electronAPI?: {
      files?: {
        selectFile: (opts: { filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
        readFile: (path: string) => Promise<Uint8Array | null>;
      };
    };
  }).electronAPI?.files;

  if (electronFiles?.selectFile) {
    const filePath = await electronFiles.selectFile({
      filters: [{ name: 'Images', extensions }],
    });
    if (!filePath) return null;

    const fileData = await electronFiles.readFile(filePath);
    if (!fileData) return null;

    const fileName = filePath.split(/[/\\]/).pop() || `${options.namePrefix ?? 'image'}.png`;
    // Re-pack into a fresh ArrayBuffer so TS's stricter Blob typings accept it
    // (Uint8Array over ArrayBufferLike can be SharedArrayBuffer-backed).
    const fresh = new Uint8Array(fileData.byteLength);
    fresh.set(fileData);
    return new File([fresh.buffer as ArrayBuffer], fileName, {
      type: inferMime(fileName),
    });
  }

  // Browser fallback — hidden HTML <input type="file">.
  return pickFileViaBrowserInput(extensions);
}

/** Convert a File to a data URL (base64 with mime prefix). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
