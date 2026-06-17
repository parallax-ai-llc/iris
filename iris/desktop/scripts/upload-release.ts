/**
 * Script to upload Electron app releases to GCS
 * Usage: npx ts-node scripts/upload-release.ts [--env=production|dev]
 *
 * Prerequisites:
 * - GOOGLE_APPLICATION_CREDENTIALS environment variable set
 * - Access to the GCS bucket
 */

import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET_NAME = 'parallax-ai-images';

interface ReleaseConfig {
  bucket: string;
  environment: 'dev' | 'production';
  releasePath: string;
}

// File extensions to upload
const RELEASE_EXTENSIONS = ['.exe', '.dmg', '.zip', '.appimage', '.blockmap', '.yml'];

async function uploadRelease(config: ReleaseConfig) {
  const storage = new Storage();
  const bucket = storage.bucket(config.bucket);
  const releaseDir = config.releasePath;

  // Check if release directory exists
  if (!fs.existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`);
    console.error('Run "npm run release:build" first to create release artifacts.');
    process.exit(1);
  }

  // Find all release artifacts
  const files = fs.readdirSync(releaseDir);
  const artifacts = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return RELEASE_EXTENSIONS.includes(ext);
  });

  if (artifacts.length === 0) {
    console.error('No release artifacts found in:', releaseDir);
    console.error('Expected files with extensions:', RELEASE_EXTENSIONS.join(', '));
    process.exit(1);
  }

  console.log(`Found ${artifacts.length} release artifacts:`);
  artifacts.forEach((file) => console.log(`  - ${file}`));
  console.log('');

  // Upload each file
  for (const file of artifacts) {
    const filePath = path.join(releaseDir, file);
    const destination = `${config.environment}/releases/${file}`;
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    console.log(`Uploading ${file} (${fileSizeMB} MB) -> ${destination}`);

    try {
      await bucket.upload(filePath, {
        destination,
        metadata: {
          // YML files should not be cached for instant update detection
          cacheControl: file.endsWith('.yml')
            ? 'no-cache, no-store, must-revalidate'
            : 'public, max-age=31536000',
        },
      });

      // Make public
      await bucket.file(destination).makePublic();
      console.log(`  ✓ Uploaded and made public`);
    } catch (error) {
      console.error(`  ✗ Failed to upload: ${error}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Release upload complete!');
  console.log(`Release URL: https://storage.googleapis.com/${config.bucket}/${config.environment}/releases/`);
  console.log('');
  console.log('Uploaded files:');
  artifacts.forEach((file) => {
    console.log(`  https://storage.googleapis.com/${config.bucket}/${config.environment}/releases/${file}`);
  });
}

// Parse args
const args = process.argv.slice(2);
const envArg = args.find((arg) => arg.startsWith('--env='));
const environment = envArg?.split('=')[1] || 'dev';

if (environment !== 'dev' && environment !== 'production') {
  console.error('Invalid environment. Use --env=dev or --env=production');
  process.exit(1);
}

console.log(`Uploading release to ${environment} environment...`);
console.log('');

uploadRelease({
  bucket: BUCKET_NAME,
  environment: environment as 'dev' | 'production',
  releasePath: path.join(__dirname, '../release'),
}).catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
