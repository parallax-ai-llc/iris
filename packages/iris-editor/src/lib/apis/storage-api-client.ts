// Minimal storage type the editor references. The real storage API lives in the
// host; the editor only needs this shape for the storage input source.
export interface StorageFile {
  id: string;
  name: string;
  path: string;
  url?: string;
  mimeType?: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
}
