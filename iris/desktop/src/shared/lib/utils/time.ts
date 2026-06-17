export interface FormatTimeOptions {
  padMinutes?: boolean;
  fractionalDigits?: number;
}

/** Format seconds into MM:SS or M:SS with optional fractional seconds */
export function formatTime(seconds: number, options?: FormatTimeOptions): string {
  const { padMinutes = false, fractionalDigits = 0 } = options ?? {};
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const minStr = padMinutes ? String(m).padStart(2, '0') : String(m);
  const secStr = s.toString().padStart(2, '0');

  if (fractionalDigits > 0) {
    const frac = Math.floor((seconds % 1) * Math.pow(10, fractionalDigits));
    return `${minStr}:${secStr}.${frac.toString().padStart(fractionalDigits, '0')}`;
  }

  return `${minStr}:${secStr}`;
}
