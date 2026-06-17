'use strict';
/**
 * electron-builder custom sign hook (signtoolOptions.sign)
 *
 * Calls signtool.exe directly from Node.js, bypassing the TrustedSigning
 * PowerShell module's Start-Process which has execution issues on some machines.
 *
 * Requires env vars:
 *   TRUSTED_SIGNING_ENDPOINT, TRUSTED_SIGNING_ACCOUNT_NAME,
 *   TRUSTED_SIGNING_CERT_PROFILE_NAME,
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *
 * signtool.exe + dlib are auto-detected from the path the TrustedSigning
 * PowerShell module downloads them to (%LOCALAPPDATA%\TrustedSigning\...).
 * Override with SIGNTOOL_PATH and TRUSTED_SIGNING_DLIB_PATH if needed.
 */

const { spawnSync } = require('child_process');
const { writeFileSync, unlinkSync, readdirSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { join, dirname } = require('path');

function findLatestSubdir(base) {
  if (!existsSync(base)) return null;
  const entries = readdirSync(base).sort().reverse(); // descending → latest first
  return entries.length ? join(base, entries[0]) : null;
}

function findSigntool() {
  if (process.env.SIGNTOOL_PATH && existsSync(process.env.SIGNTOOL_PATH)) {
    return process.env.SIGNTOOL_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  // Downloaded by TrustedSigning PowerShell module
  // Layout: %LOCALAPPDATA%\TrustedSigning\Microsoft.Windows.SDK.BuildTools\
  //           <package-version>\bin\<sdk-version>\x64\signtool.exe
  const sdkBase = join(localAppData, 'TrustedSigning', 'Microsoft.Windows.SDK.BuildTools');
  const pkgDir = findLatestSubdir(sdkBase);
  if (!pkgDir) return null;
  const binDir = join(pkgDir, 'bin');
  const sdkVersionDir = findLatestSubdir(binDir);
  if (!sdkVersionDir) return null;
  const candidate = join(sdkVersionDir, 'x64', 'signtool.exe');
  return existsSync(candidate) ? candidate : null;
}

function findDlib() {
  if (process.env.TRUSTED_SIGNING_DLIB_PATH && existsSync(process.env.TRUSTED_SIGNING_DLIB_PATH)) {
    return process.env.TRUSTED_SIGNING_DLIB_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  // Layout: %LOCALAPPDATA%\TrustedSigning\Microsoft.Trusted.Signing.Client\
  //           <package-version>\bin\x64\Azure.CodeSigning.Dlib.dll
  const clientBase = join(localAppData, 'TrustedSigning', 'Microsoft.Trusted.Signing.Client');
  const pkgDir = findLatestSubdir(clientBase);
  if (!pkgDir) return null;
  const candidate = join(pkgDir, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll');
  return existsSync(candidate) ? candidate : null;
}

module.exports = async function sign(configuration) {
  const filePath = configuration.path;

  const required = [
    'TRUSTED_SIGNING_ENDPOINT',
    'TRUSTED_SIGNING_ACCOUNT_NAME',
    'TRUSTED_SIGNING_CERT_PROFILE_NAME',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`[sign-windows] Skipping (missing env vars: ${missing.join(', ')}): ${filePath}`);
    return;
  }

  const signtool = findSigntool();
  if (!signtool) {
    throw new Error(
      '[sign-windows] signtool.exe not found in %LOCALAPPDATA%\\TrustedSigning\\. ' +
        'Run "Import-Module TrustedSigning; Invoke-TrustedSigning ..." once to download it, ' +
        'or set SIGNTOOL_PATH env var.',
    );
  }

  const dlib = findDlib();
  if (!dlib) {
    throw new Error(
      '[sign-windows] Azure.CodeSigning.Dlib.dll not found in %LOCALAPPDATA%\\TrustedSigning\\. ' +
        'Run "Import-Module TrustedSigning; Invoke-TrustedSigning ..." once to download it, ' +
        'or set TRUSTED_SIGNING_DLIB_PATH env var.',
    );
  }

  const metadata = {
    Endpoint: process.env.TRUSTED_SIGNING_ENDPOINT,
    CodeSigningAccountName: process.env.TRUSTED_SIGNING_ACCOUNT_NAME,
    CertificateProfileName: process.env.TRUSTED_SIGNING_CERT_PROFILE_NAME,
    ExcludeCredentials: [],
  };

  const metadataPath = join(tmpdir(), `iris-sign-meta-${Date.now()}.json`);
  writeFileSync(metadataPath, JSON.stringify(metadata));

  console.log(`[sign-windows] signtool: ${signtool}`);
  console.log(`[sign-windows] dlib:     ${dlib}`);
  console.log(`[sign-windows] signing:  ${filePath}`);

  try {
    const result = spawnSync(
      signtool,
      [
        'sign',
        '/v',
        '/fd', 'SHA256',
        '/tr', 'http://timestamp.acs.microsoft.com',
        '/td', 'SHA256',
        '/dlib', dlib,
        '/dmdf', metadataPath,
        filePath,
      ],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        // Add dlib directory to PATH so Windows can find its peer DLLs
        // (concrt140.dll, mfc140.dll, Ijwhost.dll, etc.) at load time.
        env: {
          ...process.env,
          PATH: `${dirname(dlib)};${process.env.PATH || ''}`,
        },
        cwd: dirname(dlib),
      },
    );

    // Always print signtool output so failures are diagnosable
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
      // spawnSync-level error (e.g. signtool.exe itself couldn't start)
      throw new Error(`[sign-windows] signtool could not start: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const detail = (result.stdout + result.stderr).trim() || `exit code ${result.status}`;
      throw new Error(`[sign-windows] signtool failed (exit ${result.status}):\n${detail}`);
    }

    console.log(`[sign-windows] ✓ signed: ${filePath}`);
  } finally {
    try { unlinkSync(metadataPath); } catch (_) {}
  }
};
