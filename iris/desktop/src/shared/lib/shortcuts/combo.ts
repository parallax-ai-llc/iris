/**
 * Key-combo parsing, matching and display.
 *
 * Combos are written as `"Mod+Shift+Z"`. Matching is done on the PHYSICAL key
 * (`KeyboardEvent.code`), never on `KeyboardEvent.key`, so a combo matches the
 * same key regardless of:
 *   - Shift (`e.key` becomes 'Z' when Shift is held),
 *   - CapsLock (`e.key` is 'Z' without Shift),
 *   - a Korean/Japanese IME (`e.key` becomes a jamo like 'ㅋ' or 'Process'),
 *   - macOS Option producing special characters (Alt+] → '‘').
 *
 * Modifiers:
 *   Mod   = Ctrl on Windows/Linux, Cmd (Meta) on macOS
 *   Ctrl  = the Control key on every platform
 *   Meta  = Cmd / Win key (alias: Cmd)
 *   Shift, Alt (alias: Option)
 * Modifiers must match EXACTLY: "Mod+Z" does not fire for Ctrl+Shift+Z.
 */

export type ShortcutPlatform = 'mac' | 'other';

let platformOverride: ShortcutPlatform | null = null;

/** Test hook: force a platform. Pass null to restore auto-detection. */
export function setShortcutPlatform(platform: ShortcutPlatform | null): void {
  platformOverride = platform;
}

export function getShortcutPlatform(): ShortcutPlatform {
  if (platformOverride) return platformOverride;
  if (typeof window === 'undefined') return 'other';
  const platform =
    window.electronAPI?.app?.getPlatform?.() ??
    (typeof navigator !== 'undefined' ? navigator.platform : '');
  return platform === 'darwin' || platform.startsWith('Mac') ? 'mac' : 'other';
}

export interface ParsedCombo {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  /** Accepted `KeyboardEvent.code` values for the main key. */
  codes: readonly string[];
  /** Fallback for keys we have no code table for: compare against e.key (lower-cased). */
  keyFallback: string | null;
  /** Normalised main-key token, used for display (e.g. 'Z', '=', 'Escape'). */
  keyToken: string;
}

const SYMBOL_CODES: Record<string, readonly string[]> = {
  '[': ['BracketLeft'],
  ']': ['BracketRight'],
  ',': ['Comma'],
  '.': ['Period'],
  '/': ['Slash', 'NumpadDivide'],
  ';': ['Semicolon'],
  "'": ['Quote'],
  '\\': ['Backslash'],
  '`': ['Backquote'],
  '-': ['Minus', 'NumpadSubtract'],
  '=': ['Equal', 'NumpadAdd'],
};

const NAMED_CODES: Record<string, readonly string[]> = {
  escape: ['Escape'],
  esc: ['Escape'],
  enter: ['Enter', 'NumpadEnter'],
  return: ['Enter', 'NumpadEnter'],
  space: ['Space'],
  tab: ['Tab'],
  delete: ['Delete'],
  del: ['Delete'],
  backspace: ['Backspace'],
  arrowup: ['ArrowUp'],
  arrowdown: ['ArrowDown'],
  arrowleft: ['ArrowLeft'],
  arrowright: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  home: ['Home'],
  end: ['End'],
  pageup: ['PageUp'],
  pagedown: ['PageDown'],
  insert: ['Insert'],
};

const NAMED_TOKEN: Record<string, string> = {
  esc: 'Escape',
  return: 'Enter',
  del: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resolve a main-key token to accepted codes. Returns null for unknown tokens. */
export function keyTokenToCodes(token: string): { codes: readonly string[]; display: string } | null {
  if (token.length === 1) {
    const ch = token;
    const lower = ch.toLowerCase();
    if (lower >= 'a' && lower <= 'z') return { codes: [`Key${lower.toUpperCase()}`], display: lower.toUpperCase() };
    if (ch >= '0' && ch <= '9') return { codes: [`Digit${ch}`, `Numpad${ch}`], display: ch };
    const sym = SYMBOL_CODES[ch];
    if (sym) return { codes: sym, display: ch };
    return null;
  }
  const lower = token.toLowerCase();
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) {
    return { codes: [lower.toUpperCase()], display: lower.toUpperCase() };
  }
  const named = NAMED_CODES[lower];
  if (named) {
    const display = NAMED_TOKEN[lower] ?? (named[0] === 'Space' ? 'Space' : named[0]);
    return { codes: named, display };
  }
  return null;
}

const parseCache = new Map<string, ParsedCombo>();

/** Parse a combo string ("Mod+Shift+Z") for the current platform. */
export function parseCombo(combo: string, platform: ShortcutPlatform = getShortcutPlatform()): ParsedCombo {
  const cacheKey = `${platform}|${combo}`;
  const cached = parseCache.get(cacheKey);
  if (cached) return cached;

  // Split on '+', but keep a literal '+' key (e.g. "Mod++").
  const raw = combo.trim();
  const parts: string[] = [];
  let buf = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '+' && buf.length > 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) parts.push(buf);
  if (parts.length === 0) throw new Error(`Empty shortcut combo: "${combo}"`);

  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  const keyRaw = parts[parts.length - 1].trim();
  for (const part of parts.slice(0, -1)) {
    switch (part.trim().toLowerCase()) {
      case 'mod':
        if (platform === 'mac') meta = true;
        else ctrl = true;
        break;
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        meta = true;
        break;
      case 'shift':
        shift = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      default:
        throw new Error(`Unknown modifier "${part}" in shortcut combo "${combo}"`);
    }
  }

  // "Mod++" → '+' key is Shift+= on most layouts; treat as '='.
  const keyToken = keyRaw === '+' ? '=' : keyRaw;
  const resolved = keyTokenToCodes(keyToken);
  const parsed: ParsedCombo = {
    ctrl,
    meta,
    shift,
    alt,
    codes: resolved?.codes ?? [],
    keyFallback: resolved ? null : keyToken.toLowerCase(),
    keyToken: resolved?.display ?? capitalize(keyToken),
  };
  parseCache.set(cacheKey, parsed);
  return parsed;
}

/**
 * Some environments leave `code` empty (synthetic events, a few IMEs).
 * Recover the physical code from a plain ASCII `key` in that case.
 */
function eventCode(e: KeyboardEvent): string {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const key = e.key ?? '';
  if (key.length === 1) {
    return keyTokenToCodes(key)?.codes[0] ?? '';
  }
  return keyTokenToCodes(key)?.codes[0] ?? key;
}

/** True when the event's physical key + modifiers match the combo. */
export function matchesCombo(e: KeyboardEvent, combo: string | ParsedCombo, platform?: ShortcutPlatform): boolean {
  const p = typeof combo === 'string' ? parseCombo(combo, platform) : combo;
  if (e.ctrlKey !== p.ctrl) return false;
  if (e.metaKey !== p.meta) return false;
  if (e.shiftKey !== p.shift) return false;
  if (e.altKey !== p.alt) return false;
  if (p.keyFallback !== null) {
    return (e.key ?? '').toLowerCase() === p.keyFallback;
  }
  const code = eventCode(e);
  return p.codes.includes(code);
}

const DISPLAY_KEY: Record<string, string> = {
  '=': '+',
  Escape: 'Esc',
  Delete: 'Del',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * Human-readable label in the style the editors already used:
 * "Ctrl+Shift+Z" on Windows/Linux, "⌘+Shift+Z" on macOS.
 */
export function formatCombo(combo: string, platform: ShortcutPlatform = getShortcutPlatform()): string {
  const p = parseCombo(combo, platform);
  const out: string[] = [];
  const isMac = platform === 'mac';
  if (p.ctrl) out.push('Ctrl');
  if (p.meta) out.push(isMac ? '⌘' : 'Win');
  if (p.alt) out.push(isMac ? '⌥' : 'Alt');
  if (p.shift) out.push('Shift');
  out.push(DISPLAY_KEY[p.keyToken] ?? p.keyToken);
  return out.join('+');
}

/**
 * Canonical identity of a combo on a platform. Two combos with the same
 * signature can never both fire — used by the duplicate-detection tests.
 */
export function comboSignature(combo: string, platform: ShortcutPlatform = getShortcutPlatform()): string {
  const p = parseCombo(combo, platform);
  const key = p.keyFallback ?? [...p.codes].sort().join('|');
  return `${p.ctrl ? 'C' : ''}${p.meta ? 'M' : ''}${p.alt ? 'A' : ''}${p.shift ? 'S' : ''}:${key}`;
}
