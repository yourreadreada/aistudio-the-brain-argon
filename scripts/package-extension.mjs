import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT_DIR, 'extension');
const OUT_DIR = path.join(ROOT_DIR, 'dist', 'extensions');

const REQUIRED_EXTENSION_FILES = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'README.md',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const FORBIDDEN_PATTERNS = [
  /\.db(-wal|-shm)?$/i,
  /\.sqlite/i,
  /^\.env/i,
  /secret/i,
  /private_key/i,
  /node_modules/i,
];

export async function packageBrowserExtension(options = {}) {
  const extDir = options.extDir || EXT_DIR;
  const outDir = options.outDir || OUT_DIR;

  if (!fs.existsSync(extDir)) {
    throw new Error(`Extension directory not found: ${extDir}`);
  }

  for (const relPath of REQUIRED_EXTENSION_FILES) {
    const absPath = path.join(extDir, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Required extension file missing: extension/${relPath}`);
    }
  }

  const manifestRaw = fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (err) {
    throw new Error(`Invalid JSON in extension/manifest.json: ${err.message}`);
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(
      `Expected Manifest V3 (manifest_version: 3), got: ${manifest.manifest_version}`
    );
  }
  if (!manifest.name || !manifest.version) {
    throw new Error('extension/manifest.json must define "name" and "version".');
  }
  if (!manifest.action || manifest.action.default_popup !== 'popup.html') {
    throw new Error('extension/manifest.json must configure action.default_popup = "popup.html".');
  }
  if (!Array.isArray(manifest.permissions) || !manifest.permissions.includes('activeTab')) {
    throw new Error('extension/manifest.json must include "activeTab" permission.');
  }

  const zip = new JSZip();
  const includedFiles = [];

  function walkAndAdd(currentDir, relPrefix = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (FORBIDDEN_PATTERNS.some((re) => re.test(relPath) || re.test(entry.name))) {
        throw new Error(`Forbidden file or secret detected in extension dir: ${relPath}`);
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkAndAdd(fullPath, relPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath);
        zip.file(relPath, content);
        includedFiles.push(relPath);
      }
    }
  }

  walkAndAdd(extDir);

  fs.mkdirSync(outDir, { recursive: true });
  const versionedName = `the-brain-companion-chromium-v${manifest.version}.zip`;
  const latestName = 'the-brain-companion-chromium.zip';
  const versionedPath = path.join(outDir, versionedName);
  const latestPath = path.join(outDir, latestName);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(versionedPath, zipBuffer);
  fs.writeFileSync(latestPath, zipBuffer);

  return {
    manifest,
    includedFiles: includedFiles.sort(),
    versionedPath,
    latestPath,
    sizeBytes: zipBuffer.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  packageBrowserExtension()
    .then((result) => {
      console.log(
        `Packaged Browser Companion v${result.manifest.version} (${result.includedFiles.length} files, ${result.sizeBytes} bytes)`
      );
      console.log(`  -> ${result.versionedPath}`);
      console.log(`  -> ${result.latestPath}`);
    })
    .catch((err) => {
      console.error('Extension packaging failed:', err.message);
      process.exit(1);
    });
}
