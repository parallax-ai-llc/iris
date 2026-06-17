#!/usr/bin/env node
/**
 * macOS DMG build cleanup helper.
 *
 * `hdiutil detach` intermittently fails with "DiskArbitration expired" when
 * Spotlight/Finder or a previous run's zombie process is still holding a
 * mounted /Volumes/Iris* image. This script kills the usual suspects and
 * force-detaches any stale Iris volumes.
 *
 * Run before AND after `electron-builder --mac` to keep the host clean.
 *
 * Usage:
 *   node scripts/mac-cleanup.mjs              # default: prune
 *   node scripts/mac-cleanup.mjs --setup      # also disable DMG verify
 */

import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

if (process.platform !== 'darwin') {
  console.log('[mac-cleanup] not darwin, skipping');
  process.exit(0);
}

const args = process.argv.slice(2);
const setup = args.includes('--setup');

function tryRun(cmd, opts = {}) {
  try {
    const result = spawnSync('/bin/sh', ['-c', cmd], { stdio: 'pipe', encoding: 'utf8', ...opts });
    return { code: result.status ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (err) {
    return { code: 1, stdout: '', stderr: err.message };
  }
}

function killProcess(name) {
  const r = tryRun(`pkill -f ${name}`);
  if (r.code === 0) console.log(`[mac-cleanup] killed: ${name}`);
}

function detachIrisVolumes() {
  if (!existsSync('/Volumes')) return;
  const entries = readdirSync('/Volumes', { withFileTypes: true });
  const targets = entries
    .filter((e) => e.name.startsWith('Iris'))
    .map((e) => `/Volumes/${e.name}`);

  for (const v of targets) {
    // Try volume name first
    let r = tryRun(`hdiutil detach "${v}" -force`);
    if (r.code === 0) {
      console.log(`[mac-cleanup] detached: ${v}`);
      continue;
    }

    // If volume name failed, try to find and detach by device ID
    const info = tryRun('hdiutil info');
    if (info.stdout) {
      const deviceMatch = info.stdout.match(new RegExp(`^/dev/disk\\d+s1\\s+.*${v.replace(/\//g, '\\/')}$`, 'm'));
      if (deviceMatch) {
        const deviceId = deviceMatch[0].split('\\s')[0];
        r = tryRun(`hdiutil detach ${deviceId} -force`);
        if (r.code === 0) {
          console.log(`[mac-cleanup] detached by device: ${v}`);
          continue;
        }
      }
    }
    console.log(`[mac-cleanup] could not detach (already gone?): ${v}`);
  }
}

console.log('[mac-cleanup] pruning stale DMG state...');

killProcess('dmgbuild');
killProcess('hdiutil');
killProcess('electron-builder');
killProcess('python'); // dmgbuild uses python

detachIrisVolumes();

// Let DiskArbitration settle after kill/detach storm.
const sleepMs = 3000; // Increased from 1500ms
const end = Date.now() + sleepMs;
while (Date.now() < end) {
  spawnSync('/bin/sleep', ['0.5'], { stdio: 'ignore' });
}

// Additional cleanup: remove temp DMG files that might be stuck
tryRun('find /Users/dev1/Production/parallax-ai/iris-desktop/release -name ".temp*" -type f -delete 2>/dev/null || true');

if (setup) {
  console.log('[mac-cleanup] disabling DMG verify (reduces DiskArbitration pressure)...');
  tryRun('defaults write com.apple.frameworks.diskimages skip-verify -bool TRUE');
  tryRun('defaults write com.apple.frameworks.diskimages skip-verify-locked -bool TRUE');
  tryRun('defaults write com.apple.frameworks.diskimages skip-verify-remote -bool TRUE');
}

console.log('[mac-cleanup] done');
