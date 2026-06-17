/**
 * iris.network API handler — proxied HTTP requests from extensions.
 * All network access goes through this handler for security.
 */
import { net } from 'electron';

export function registerNetworkApi(
  manager: { registerApiHandler: (ns: string, method: string, handler: (extId: string, args: unknown[]) => Promise<unknown>) => void }
): void {
  manager.registerApiHandler('iris.network', 'fetch', async (extId, args) => {
    const [url, options] = args as [string, { method?: string; headers?: Record<string, string>; body?: string } | undefined];

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Block local/private network access (IPv4 + IPv6)
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, ''); // strip [] from IPv6
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      // IPv6 private/loopback addresses
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('fe80:') ||  // link-local
      hostname.startsWith('fc') ||     // unique local (fc00::/7)
      hostname.startsWith('fd') ||     // unique local (fc00::/7)
      // Cloud metadata endpoints
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal'
    ) {
      throw new Error(`Network access to private addresses is not allowed: ${hostname}`);
    }

    try {
      const response = await net.fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
      });

      const body = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        headers,
        body,
      };
    } catch (err) {
      throw new Error(`Network request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
