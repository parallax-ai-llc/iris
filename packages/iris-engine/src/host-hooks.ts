/**
 * Host hooks — capabilities the engine needs but cannot implement itself,
 * injected once by the host at startup.
 *
 * Currently: uploading a piece of media to a temporary, externally-reachable
 * URL. Some providers (Kling, Luma) only accept input media as a public URL, so
 * the engine must hand bytes to the host and get back a URL. The cloud host
 * wires this to GCS; the open-source local host wires it to its local static
 * file server; the desktop host wires it to its local media server.
 *
 * This is a pragmatic module-level injection (set once at boot). The richer,
 * per-execution `MediaStorage` port in `./ports` will eventually subsume it.
 */

export interface TempPublicUploadInput {
  /** Raw base64 (optionally a data: URL — the host is expected to strip it). */
  base64Data: string;
  mimeType: string;
  /** Provider name, used by hosts to namespace/organize temp objects. */
  provider: string;
  expirationMinutes?: number;
  makePublic?: boolean;
}

export interface TempPublicUploadOutput {
  success: boolean;
  /** Time-limited signed URL — preferred for handing to external providers. */
  signedUrl?: string;
  /** Clean public URL (only when the host made the object public). */
  publicUrl?: string;
  error?: string;
}

export type TempPublicUploader = (
  input: TempPublicUploadInput
) => Promise<TempPublicUploadOutput>;

let _tempPublicUploader: TempPublicUploader | undefined;

/** Host calls this once at startup to provide the implementation. */
export function setTempPublicUploader(fn: TempPublicUploader): void {
  _tempPublicUploader = fn;
}

/**
 * Upload media to a temporary public URL via the host-provided uploader.
 * Kept name- and shape-compatible with the server's original
 * `uploadTempPublicFile` so adapters call it unchanged.
 */
export function uploadTempPublicFile(
  input: TempPublicUploadInput
): Promise<TempPublicUploadOutput> {
  if (!_tempPublicUploader) {
    throw new Error(
      'iris-engine: temp public uploader not configured. ' +
        'Call setTempPublicUploader(...) at host startup before running ' +
        'workflows that use Kling/Luma with media inputs.'
    );
  }
  return _tempPublicUploader(input);
}
