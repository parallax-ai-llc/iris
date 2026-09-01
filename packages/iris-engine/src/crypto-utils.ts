/**
 * Parallax Iris — UTIL_CRYPTO (Phase 4: reliability & security).
 *
 * Hash / HMAC / UUID / random string over Node's built-in crypto — zero
 * dependencies, pure, host-independent. Algorithms are whitelisted so a
 * workflow config can't reach arbitrary OpenSSL digests.
 */

import {
  createHash,
  createHmac,
  randomUUID,
  randomBytes,
} from 'node:crypto';

export type CryptoOperation = 'hash' | 'hmac' | 'uuid' | 'randomString';

const ALLOWED_ALGORITHMS = ['sha256', 'sha512', 'sha1', 'md5'] as const;
const ALLOWED_ENCODINGS = ['hex', 'base64'] as const;

export interface CryptoOperationInput {
  operation: CryptoOperation;
  /** hash/hmac payload. */
  data?: string;
  /** hash/hmac digest algorithm. Default sha256. */
  algorithm?: string;
  /** Output encoding for hash/hmac. Default hex. */
  encoding?: string;
  /** hmac secret. */
  secret?: string;
  /** randomString length (1–256). Default 32. */
  length?: number;
}

export function runCryptoOperation(input: CryptoOperationInput): string {
  const algorithm = (input.algorithm ?? 'sha256').toLowerCase();
  const encoding = (input.encoding ?? 'hex').toLowerCase();

  switch (input.operation) {
    case 'hash': {
      assertAlgorithm(algorithm);
      assertEncoding(encoding);
      return createHash(algorithm)
        .update(input.data ?? '', 'utf8')
        .digest(encoding as 'hex' | 'base64');
    }
    case 'hmac': {
      assertAlgorithm(algorithm);
      assertEncoding(encoding);
      if (!input.secret) {
        throw new Error('Crypto: HMAC requires a secret (config or `key` input)');
      }
      return createHmac(algorithm, input.secret)
        .update(input.data ?? '', 'utf8')
        .digest(encoding as 'hex' | 'base64');
    }
    case 'uuid':
      return randomUUID();
    case 'randomString': {
      const length = Math.max(1, Math.min(256, Number(input.length ?? 32) || 32));
      // base64url gives ~1.33 chars per byte — generate enough, then trim.
      return randomBytes(Math.ceil((length * 3) / 4) + 2)
        .toString('base64url')
        .slice(0, length);
    }
    default:
      throw new Error(`Crypto: unsupported operation "${String(input.operation)}"`);
  }
}

function assertAlgorithm(algorithm: string): void {
  if (!(ALLOWED_ALGORITHMS as readonly string[]).includes(algorithm)) {
    throw new Error(
      `Crypto: unsupported algorithm "${algorithm}" (allowed: ${ALLOWED_ALGORITHMS.join(', ')})`
    );
  }
}

function assertEncoding(encoding: string): void {
  if (!(ALLOWED_ENCODINGS as readonly string[]).includes(encoding)) {
    throw new Error(
      `Crypto: unsupported encoding "${encoding}" (allowed: ${ALLOWED_ENCODINGS.join(', ')})`
    );
  }
}
