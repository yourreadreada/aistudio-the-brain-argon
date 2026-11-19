import JSZip from 'jszip';

export const PORTABLE_PACKAGE_FORMAT = 'the-brain-portable-package' as const;
export const PORTABLE_MARKDOWN_FORMAT = 'the-brain-markdown' as const;
export const PORTABLE_BRAINPACK_FORMAT = 'the-brain-brainpack-zip' as const;
export const PORTABLE_SCHEMA_VERSION = 1 as const;

export type PortableConflictPolicy = 'skip' | 'merge' | 'replace';

export interface PortableExportFilter {
  brain?: string; // 'all' or specific brain slug
  source?: string; // 'all' or specific source
  dateFrom?: string; // ISO date or YYYY-MM-DD
  dateTo?: string; // ISO date or YYYY-MM-DD
  excludeSecrets?: boolean; // default true
  includePrivate?: boolean; // default false
  includeAttachments?: boolean; // default false (explicit opt-in)
  sourceInstance?: string;
}

export interface PortableBrainSummary {
  slug: string;
  factCount: number;
  sources: string[];
  latestUpdatedAt: string | null;
}

export interface PortableFactRecord {
  portableRefId: string;
  originalId: number | null;
  brain: string;
  content: string;
  source: string;
  sourceFolder: string | null;
  fileName: string | null;
  filePath: string | null;
  fileType: string | null;
  documentTitle: string | null;
  tags: string[];
  originalCreatedAt: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  checksum: string | null;
  fixtureId: string | null;
  topicKey: string | null;
  relatedSources: string[];
  structuredData: Record<string, any> | null;
  mergeHistory: any[];
  parentRefId: string | null;
  nodeKind: string | null;
  displayLabel: string | null;
}

export interface PortableAttachmentRecord {
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  contentBase64?: string;
}

export interface PortablePackageManifest {
  format: typeof PORTABLE_PACKAGE_FORMAT;
  schemaVersion: typeof PORTABLE_SCHEMA_VERSION;
  exportedAt: string;
  sourceInstance: string;
  generator: string;
  scope: {
    brain: string;
    source: string;
    dateFrom: string | null;
    dateTo: string | null;
  };
  secretsExcluded: boolean;
  privateExcluded: boolean;
  attachmentsIncluded: boolean;
  counts: {
    brains: number;
    facts: number;
    parentLinks: number;
    attachments: number;
    redactedItems: number;
    excludedPrivateItems: number;
  };
  notice: string;
}

export interface PortableBrainPackageV1 {
  format: typeof PORTABLE_PACKAGE_FORMAT;
  schemaVersion: typeof PORTABLE_SCHEMA_VERSION;
  exportedAt: string;
  sourceInstance: string;
  checksumAlgorithm: 'sha256';
  payloadChecksum: string;
  manifest: PortablePackageManifest;
  brains: PortableBrainSummary[];
  facts: PortableFactRecord[];
  attachments: PortableAttachmentRecord[];
}

export interface PortablePackageVerificationResult {
  valid: boolean;
  error?: string;
  computedChecksum?: string;
  expectedChecksum?: string;
  schemaVersion?: number;
  packageData?: PortableBrainPackageV1;
}

export interface PortableDiffItem {
  portableRefId: string;
  brain: string;
  source: string;
  fileName: string | null;
  preview: string;
  status: 'new' | 'exact_duplicate' | 'conflict';
  existingFactId?: number;
  existingPreview?: string;
}

export interface PortableInspectionPreview {
  valid: boolean;
  error?: string;
  format: 'brain_json' | 'brain_md' | 'brainpack_zip' | 'unknown';
  schemaVersion: number | null;
  checksumValid: boolean;
  exportedAt: string | null;
  sourceInstance: string | null;
  secretsExcluded: boolean;
  brains: string[];
  summary: {
    totalInPackage: number;
    newCount: number;
    exactDuplicateCount: number;
    conflictCount: number;
    attachmentCount: number;
  };
  items: PortableDiffItem[];
  packageData?: PortableBrainPackageV1;
}

// ============================================================================
// Pure deterministic SHA-256 (synchronous, works identically in Node & Browser)
// ============================================================================
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const hiBits = Math.floor(bitLen / 0x100000000);
  const loBits = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hiBits, false);
  view.setUint32(paddedLen - 4, loBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

// ============================================================================
// Secret redaction for portable exports (Section 5.4 guardrail)
// ============================================================================
const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\bbrn_live_[A-Za-z0-9_-]{8,}\b/g, replacement: '[REDACTED_BRAIN_TOKEN]' },
  { regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_API_KEY]' },
  { regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replacement: '[REDACTED_GOOGLE_API_KEY]' },
  { regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { regex: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  {
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
];

export function redactPortableSecretText(text: string): { text: string; redacted: boolean } {
  let out = text;
  let redacted = false;
  for (const rule of SECRET_PATTERNS) {
    const next = out.replace(rule.regex, rule.replacement);
    if (next !== out) {
      redacted = true;
      out = next;
    }
  }
  return { text: out, redacted };
}

function isPrivateTagged(tags: string[]): boolean {
  const lowered = tags.map((t) => String(t || '').trim().toLowerCase());
  return lowered.includes('private') || lowered.includes('secret') || lowered.includes('credentials');
}

function parseIsoTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function computePortableRefId(fact: {
  brain: string;
  id?: number | null;
  fixtureId?: string | null;
  checksum?: string | null;
  content: string;
  source: string;
}): string {
  if (fact.fixtureId && fact.fixtureId.trim()) {
    return `fixture:${fact.brain}:${fact.fixtureId.trim()}`;
  }
  if (fact.checksum && fact.checksum.trim()) {
    return `sha:${fact.brain}:${fact.checksum.trim().slice(0, 24)}`;
  }
  const digest = sha256Hex(`${fact.brain}|${fact.source}|${fact.content.trim()}`).slice(0, 20);
  return `ref:${fact.brain}:${digest}`;
}

export function computePortablePayloadChecksum(payload: {
  brains: PortableBrainSummary[];
  facts: PortableFactRecord[];
  attachments: PortableAttachmentRecord[];
}): string {
  const canonical = JSON.stringify({
    brains: payload.brains,
    facts: payload.facts,
    attachments: payload.attachments,
  });
  return sha256Hex(canonical);
}

/**
 * Builds a verified PortableBrainPackageV1 from raw serialized facts.
 */
export function buildPortablePackage(
  rawFacts: Array<Record<string, any>>,
  filter: PortableExportFilter = {}
): PortableBrainPackageV1 {
  const excludeSecrets = filter.excludeSecrets !== false;
  const includePrivate = filter.includePrivate === true;
  const includeAttachments = filter.includeAttachments === true;
  const brainFilter = filter.brain && filter.brain !== 'all' ? filter.brain.trim().toLowerCase() : 'all';
  const sourceFilter =
    filter.source && filter.source !== 'all' ? filter.source.trim().toLowerCase() : 'all';
  const fromMs = filter.dateFrom ? parseIsoTime(filter.dateFrom) : null;
  const toMs = filter.dateTo
    ? parseIsoTime(
        filter.dateTo.length === 10 ? `${filter.dateTo}T23:59:59.999Z` : filter.dateTo
      )
    : null;

  let excludedPrivateItems = 0;
  let redactedItems = 0;

  // Filter facts first
  const eligible = rawFacts.filter((f) => {
    const brain = String(f.brain || '').toLowerCase();
    const source = String(f.source || '').toLowerCase();
    if (brainFilter !== 'all' && brain !== brainFilter) return false;
    if (sourceFilter !== 'all' && source !== sourceFilter) return false;

    const tags = Array.isArray(f.tags) ? f.tags.map(String) : [];
    if (!includePrivate && isPrivateTagged(tags)) {
      excludedPrivateItems++;
      return false;
    }

    if (fromMs !== null || toMs !== null) {
      const refTime =
        parseIsoTime(f.originalCreatedAt) ??
        parseIsoTime(f.createdAt) ??
        parseIsoTime(f.importedAt);
      if (refTime !== null) {
        if (fromMs !== null && refTime < fromMs) return false;
        if (toMs !== null && refTime > toMs) return false;
      }
    }
    return true;
  });

  // First pass: map numeric IDs to deterministic portableRefIds so parent links survive ID remapping
  const idToRef = new Map<number, string>();
  const refCounts = new Map<string, number>();

  const preMapped = eligible.map((f) => {
    let content = String(f.content || '');
    if (excludeSecrets) {
      const res = redactPortableSecretText(content);
      content = res.text;
      if (res.redacted) redactedItems++;
    }
    const baseRef = computePortableRefId({
      brain: String(f.brain || 'coding'),
      id: typeof f.id === 'number' ? f.id : null,
      fixtureId: f.fixtureId ?? null,
      checksum: f.checksum ?? null,
      content,
      source: String(f.source || 'manual'),
    });
    const seen = refCounts.get(baseRef) || 0;
    refCounts.set(baseRef, seen + 1);
    const portableRefId = seen === 0 ? baseRef : `${baseRef}#${seen + 1}`;

    if (typeof f.id === 'number') {
      idToRef.set(f.id, portableRefId);
    }
    return { raw: f, content, portableRefId };
  });

  let parentLinks = 0;
  const facts: PortableFactRecord[] = preMapped.map(({ raw, content, portableRefId }) => {
    const parentIdNum =
      typeof raw.parentId === 'number'
        ? raw.parentId
        : typeof raw.parent_id === 'number'
          ? raw.parent_id
          : null;
    const parentRefId = parentIdNum !== null ? idToRef.get(parentIdNum) ?? null : null;
    if (parentRefId) parentLinks++;

    const now = new Date().toISOString();
    const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
    const relatedSources = Array.isArray(raw.relatedSources)
      ? raw.relatedSources.map(String)
      : [];

    return {
      portableRefId,
      originalId: typeof raw.id === 'number' ? raw.id : null,
      brain: String(raw.brain || 'coding'),
      content,
      source: String(raw.source || 'manual'),
      sourceFolder: raw.sourceFolder ?? null,
      fileName: raw.fileName ?? null,
      filePath: raw.filePath ?? null,
      fileType: raw.fileType ?? null,
      documentTitle: raw.documentTitle ?? null,
      tags,
      originalCreatedAt: raw.originalCreatedAt ?? null,
      importedAt: raw.importedAt ?? raw.createdAt ?? now,
      createdAt: raw.createdAt ?? now,
      updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
      checksum: raw.checksum ?? sha256Hex(content),
      fixtureId: raw.fixtureId ?? null,
      topicKey: raw.topicKey ?? null,
      relatedSources,
      structuredData:
        raw.structuredData && typeof raw.structuredData === 'object' ? raw.structuredData : null,
      mergeHistory: Array.isArray(raw.mergeHistory) ? raw.mergeHistory : [],
      parentRefId,
      nodeKind: raw.nodeKind ?? null,
      displayLabel: raw.displayLabel ?? null,
    };
  });

  // Summarize brains
  const brainMap = new Map<string, { count: number; sources: Set<string>; latest: string | null }>();
  for (const f of facts) {
    const entry = brainMap.get(f.brain) || { count: 0, sources: new Set<string>(), latest: null };
    entry.count += 1;
    entry.sources.add(f.source);
    if (!entry.latest || f.updatedAt > entry.latest) {
      entry.latest = f.updatedAt;
    }
    brainMap.set(f.brain, entry);
  }

  const brains: PortableBrainSummary[] = Array.from(brainMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, info]) => ({
      slug,
      factCount: info.count,
      sources: Array.from(info.sources).sort(),
      latestUpdatedAt: info.latest,
    }));

  // Optional explicit attachments (inline metadata / text source artifacts when opted in)
  const attachments: PortableAttachmentRecord[] = [];
  if (includeAttachments) {
    const seenPaths = new Set<string>();
    for (const f of facts) {
      if (f.fileName && !seenPaths.has(`${f.brain}/${f.fileName}`)) {
        seenPaths.add(`${f.brain}/${f.fileName}`);
        const bytes = new TextEncoder().encode(f.content);
        attachments.push({
          path: `attachments/${f.brain}/${f.fileName.replace(/[^\w.-]/g, '_')}.txt`,
          mimeType: 'text/plain; charset=utf-8',
          sizeBytes: bytes.length,
          sha256: sha256Hex(bytes),
        });
      }
    }
  }

  const exportedAt = new Date().toISOString();
  const sourceInstance = filter.sourceInstance || 'the-brain-argon-local';
  const payloadChecksum = computePortablePayloadChecksum({ brains, facts, attachments });

  const manifest: PortablePackageManifest = {
    format: PORTABLE_PACKAGE_FORMAT,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    exportedAt,
    sourceInstance,
    generator: 'The Brain — Argon v0.2.0',
    scope: {
      brain: brainFilter,
      source: sourceFilter,
      dateFrom: filter.dateFrom || null,
      dateTo: filter.dateTo || null,
    },
    secretsExcluded: excludeSecrets,
    privateExcluded: !includePrivate,
    attachmentsIncluded: includeAttachments,
    counts: {
      brains: brains.length,
      facts: facts.length,
      parentLinks,
      attachments: attachments.length,
      redactedItems,
      excludedPrivateItems,
    },
    notice:
      'Portable content package for cross-Brain transfer and archiving. Not a replacement for SQLite .db disaster-recovery backups.',
  };

  return {
    format: PORTABLE_PACKAGE_FORMAT,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    exportedAt,
    sourceInstance,
    checksumAlgorithm: 'sha256',
    payloadChecksum,
    manifest,
    brains,
    facts,
    attachments,
  };
}

/**
 * Validates format, schema version, structure, and SHA-256 payload checksum of a .brain.json package.
 */
export function verifyPortablePackage(raw: unknown): PortablePackageVerificationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Invalid portable package: expected JSON object.' };
  }
  const obj = raw as Partial<PortableBrainPackageV1>;
  if (obj.format !== PORTABLE_PACKAGE_FORMAT) {
    return {
      valid: false,
      error: `Unsupported package format "${String(obj.format || 'unknown')}". Expected "${PORTABLE_PACKAGE_FORMAT}".`,
    };
  }
  if (obj.schemaVersion !== PORTABLE_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported portable schemaVersion ${String(obj.schemaVersion)}. Supported version: ${PORTABLE_SCHEMA_VERSION}.`,
      schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : undefined,
    };
  }
  if (!Array.isArray(obj.facts) || !Array.isArray(obj.brains)) {
    return { valid: false, error: 'Malformed package: missing facts or brains array.' };
  }
  const attachments = Array.isArray(obj.attachments) ? obj.attachments : [];
  const computedChecksum = computePortablePayloadChecksum({
    brains: obj.brains,
    facts: obj.facts,
    attachments,
  });
  if (!obj.payloadChecksum || computedChecksum !== obj.payloadChecksum) {
    return {
      valid: false,
      error:
        'SHA-256 payload checksum mismatch. The package may have been modified or corrupted in transit.',
      computedChecksum,
      expectedChecksum: obj.payloadChecksum,
      schemaVersion: obj.schemaVersion,
    };
  }

  return {
    valid: true,
    computedChecksum,
    expectedChecksum: obj.payloadChecksum,
    schemaVersion: obj.schemaVersion,
    packageData: {
      ...(obj as PortableBrainPackageV1),
      attachments,
    },
  };
}

export function parsePortablePackageJson(jsonText: string): PortablePackageVerificationResult {
  try {
    const parsed = JSON.parse(jsonText);
    return verifyPortablePackage(parsed);
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to parse .brain.json: ${err?.message || 'invalid JSON'}`,
    };
  }
}

// ============================================================================
// .brain.md — Human-readable + round-trip parseable Markdown format
// ============================================================================
export function serializePortableMarkdown(pkg: PortableBrainPackageV1): string {
  const lines: string[] = [
    '---',
    `format: ${PORTABLE_MARKDOWN_FORMAT}`,
    `schemaVersion: ${pkg.schemaVersion}`,
    `exportedAt: "${pkg.exportedAt}"`,
    `sourceInstance: "${pkg.sourceInstance}"`,
    `scopeBrain: "${pkg.manifest.scope.brain}"`,
    `scopeSource: "${pkg.manifest.scope.source}"`,
    `factCount: ${pkg.facts.length}`,
    `secretsExcluded: ${pkg.manifest.secretsExcluded}`,
    `payloadChecksum: "${pkg.payloadChecksum}"`,
    `notice: "Portable human-readable content export. Not a full SQLite disaster-recovery backup."`,
    '---',
    '',
    `# The Brain — Portable Memory Export (${pkg.manifest.scope.brain === 'all' ? 'All Brains' : pkg.manifest.scope.brain})`,
    '',
    `> Exported \`${pkg.exportedAt}\` from \`${pkg.sourceInstance}\` · ${pkg.facts.length} memories across ${pkg.brains.length} Brain(s).`,
    '> **Note:** This `.brain.md` export is a portable content snapshot for reading, archiving, and transfer — use Settings → Database & Backups for full SQLite disaster-recovery snapshots.',
    '',
  ];

  for (const fact of pkg.facts) {
    const meta = {
      portableRefId: fact.portableRefId,
      originalId: fact.originalId,
      brain: fact.brain,
      source: fact.source,
      sourceFolder: fact.sourceFolder,
      fileName: fact.fileName,
      filePath: fact.filePath,
      fileType: fact.fileType,
      documentTitle: fact.documentTitle,
      tags: fact.tags,
      originalCreatedAt: fact.originalCreatedAt,
      importedAt: fact.importedAt,
      createdAt: fact.createdAt,
      updatedAt: fact.updatedAt,
      checksum: fact.checksum,
      fixtureId: fact.fixtureId,
      topicKey: fact.topicKey,
      relatedSources: fact.relatedSources,
      parentRefId: fact.parentRefId,
      nodeKind: fact.nodeKind,
      displayLabel: fact.displayLabel,
    };

    const headingTitle =
      fact.displayLabel || fact.documentTitle || fact.fileName || `Memory ${fact.portableRefId}`;

    lines.push(`## ${headingTitle}`);
    lines.push(`<!-- brain:fact ${JSON.stringify(meta)} -->`);
    lines.push(
      `- **Brain:** \`${fact.brain}\` · **Source:** \`${fact.source}\`${
        fact.sourceFolder ? ` · **Folder:** \`${fact.sourceFolder}\`` : ''
      }`
    );
    if (fact.fileName || fact.filePath) {
      lines.push(`- **File:** \`${fact.filePath || fact.fileName}\``);
    }
    if (fact.originalCreatedAt) {
      lines.push(`- **Original Date:** \`${fact.originalCreatedAt}\``);
    }
    if (fact.importedAt) {
      lines.push(`- **Imported:** \`${fact.importedAt}\``);
    }
    if (fact.tags.length > 0) {
      lines.push(`- **Tags:** ${fact.tags.map((t) => `\`#${t}\``).join(' ')}`);
    }
    lines.push('');
    lines.push('<!-- brain:content:start -->');
    lines.push(fact.content);
    lines.push('<!-- brain:content:end -->');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function parsePortableMarkdown(markdownText: string): PortablePackageVerificationResult {
  const fmMatch = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return {
      valid: false,
      error: 'Missing YAML frontmatter in .brain.md file.',
    };
  }
  const fmBlock = fmMatch[1];
  const getFm = (key: string): string | null => {
    const m = fmBlock.match(new RegExp(`^${key}:\\s*"?([^"\\r\\n]+)"?`, 'm'));
    return m ? m[1].trim() : null;
  };

  const format = getFm('format');
  if (format !== PORTABLE_MARKDOWN_FORMAT) {
    return {
      valid: false,
      error: `Unsupported Markdown export format "${format || 'unknown'}".`,
    };
  }

  const schemaVersion = Number(getFm('schemaVersion') || '0');
  if (schemaVersion !== PORTABLE_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported .brain.md schemaVersion ${schemaVersion}.`,
    };
  }

  const factBlockRegex =
    /<!--\s*brain:fact\s+(\{[\s\S]*?\})\s*-->[\s\S]*?<!--\s*brain:content:start\s*-->\r?\n([\s\S]*?)\r?\n<!--\s*brain:content:end\s*-->/g;

  const facts: PortableFactRecord[] = [];
  let match: RegExpExecArray | null;
  while ((match = factBlockRegex.exec(markdownText)) !== null) {
    try {
      const meta = JSON.parse(match[1]);
      const content = match[2];
      facts.push({
        portableRefId: String(meta.portableRefId || ''),
        originalId: typeof meta.originalId === 'number' ? meta.originalId : null,
        brain: String(meta.brain || 'coding'),
        content,
        source: String(meta.source || 'manual'),
        sourceFolder: meta.sourceFolder ?? null,
        fileName: meta.fileName ?? null,
        filePath: meta.filePath ?? null,
        fileType: meta.fileType ?? null,
        documentTitle: meta.documentTitle ?? null,
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
        originalCreatedAt: meta.originalCreatedAt ?? null,
        importedAt: meta.importedAt ?? null,
        createdAt: meta.createdAt ?? new Date().toISOString(),
        updatedAt: meta.updatedAt ?? meta.createdAt ?? new Date().toISOString(),
        checksum: meta.checksum ?? sha256Hex(content),
        fixtureId: meta.fixtureId ?? null,
        topicKey: meta.topicKey ?? null,
        relatedSources: Array.isArray(meta.relatedSources) ? meta.relatedSources.map(String) : [],
        structuredData: null,
        mergeHistory: [],
        parentRefId: meta.parentRefId ?? null,
        nodeKind: meta.nodeKind ?? null,
        displayLabel: meta.displayLabel ?? null,
      });
    } catch {
      return {
        valid: false,
        error: 'Malformed fact metadata block inside .brain.md export.',
      };
    }
  }

  const exportedAt = getFm('exportedAt') || new Date().toISOString();
  const sourceInstance = getFm('sourceInstance') || 'the-brain-markdown-import';
  const brainMap = new Map<string, { count: number; sources: Set<string>; latest: string | null }>();
  for (const f of facts) {
    const entry = brainMap.get(f.brain) || { count: 0, sources: new Set<string>(), latest: null };
    entry.count++;
    entry.sources.add(f.source);
    if (!entry.latest || f.updatedAt > entry.latest) entry.latest = f.updatedAt;
    brainMap.set(f.brain, entry);
  }
  const brains: PortableBrainSummary[] = Array.from(brainMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, info]) => ({
      slug,
      factCount: info.count,
      sources: Array.from(info.sources).sort(),
      latestUpdatedAt: info.latest,
    }));

  const attachments: PortableAttachmentRecord[] = [];
  const computedChecksum = computePortablePayloadChecksum({ brains, facts, attachments });
  const expectedChecksum = getFm('payloadChecksum') || undefined;

  const pkg: PortableBrainPackageV1 = {
    format: PORTABLE_PACKAGE_FORMAT,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    exportedAt,
    sourceInstance,
    checksumAlgorithm: 'sha256',
    payloadChecksum: computedChecksum,
    manifest: {
      format: PORTABLE_PACKAGE_FORMAT,
      schemaVersion: PORTABLE_SCHEMA_VERSION,
      exportedAt,
      sourceInstance,
      generator: 'The Brain — Argon .brain.md parser',
      scope: {
        brain: getFm('scopeBrain') || 'all',
        source: getFm('scopeSource') || 'all',
        dateFrom: null,
        dateTo: null,
      },
      secretsExcluded: getFm('secretsExcluded') !== 'false',
      privateExcluded: true,
      attachmentsIncluded: false,
      counts: {
        brains: brains.length,
        facts: facts.length,
        parentLinks: facts.filter((f) => Boolean(f.parentRefId)).length,
        attachments: 0,
        redactedItems: 0,
        excludedPrivateItems: 0,
      },
      notice: 'Parsed from .brain.md portable Markdown export.',
    },
    brains,
    facts,
    attachments,
  };

  return {
    valid: true,
    computedChecksum,
    expectedChecksum: expectedChecksum || computedChecksum,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    packageData: pkg,
  };
}

// ============================================================================
// .brainpack.zip — Archive with manifest, brain.json, brain.md, checksums, attachments
// ============================================================================
export async function buildBrainpackZip(
  pkg: PortableBrainPackageV1
): Promise<{ buffer: Uint8Array; checksums: Record<string, string> }> {
  const zip = new JSZip();
  const brainJsonStr = JSON.stringify(pkg, null, 2);
  const brainMdStr = serializePortableMarkdown(pkg);
  const manifestStr = JSON.stringify(
    {
      ...pkg.manifest,
      archiveFormat: PORTABLE_BRAINPACK_FORMAT,
      files: ['manifest.json', 'brain.json', 'brain.md', 'checksums.json'],
    },
    null,
    2
  );

  const checksums: Record<string, string> = {
    'manifest.json': sha256Hex(manifestStr),
    'brain.json': sha256Hex(brainJsonStr),
    'brain.md': sha256Hex(brainMdStr),
  };

  zip.file('manifest.json', manifestStr);
  zip.file('brain.json', brainJsonStr);
  zip.file('brain.md', brainMdStr);

  if (pkg.manifest.attachmentsIncluded && pkg.attachments.length > 0) {
    const byName = new Map<string, PortableFactRecord>();
    for (const f of pkg.facts) {
      if (f.fileName) {
        const key = `attachments/${f.brain}/${f.fileName.replace(/[^\w.-]/g, '_')}.txt`;
        if (!byName.has(key)) byName.set(key, f);
      }
    }
    for (const att of pkg.attachments) {
      const fact = byName.get(att.path);
      const text = fact ? fact.content : '';
      zip.file(att.path, text);
      checksums[att.path] = sha256Hex(text);
    }
  }

  zip.file('checksums.json', JSON.stringify({ algorithm: 'sha256', files: checksums }, null, 2));

  const buffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { buffer, checksums };
}

export async function parseBrainpackZip(
  zipBytes: Uint8Array | ArrayBuffer
): Promise<PortablePackageVerificationResult> {
  try {
    const zip = await JSZip.loadAsync(zipBytes);
    const brainJsonEntry = zip.file('brain.json');
    const checksumsEntry = zip.file('checksums.json');
    if (!brainJsonEntry) {
      return {
        valid: false,
        error: 'Invalid .brainpack.zip: missing required brain.json payload.',
      };
    }

    const brainJsonText = await brainJsonEntry.async('string');

    if (checksumsEntry) {
      const checksumDoc = JSON.parse(await checksumsEntry.async('string')) as {
        files?: Record<string, string>;
      };
      const expectedFiles = checksumDoc?.files || {};
      for (const [entryPath, expectedHash] of Object.entries(expectedFiles)) {
        const zf = zip.file(entryPath);
        if (!zf) {
          return {
            valid: false,
            error: `Integrity error in .brainpack.zip: declared file "${entryPath}" is missing.`,
          };
        }
        const rawBytes = await zf.async('uint8array');
        const actualHash = sha256Hex(rawBytes);
        if (actualHash !== expectedHash) {
          return {
            valid: false,
            error: `SHA-256 checksum mismatch for "${entryPath}" inside .brainpack.zip.`,
            computedChecksum: actualHash,
            expectedChecksum: expectedHash,
          };
        }
      }
    }

    return parsePortablePackageJson(brainJsonText);
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to read .brainpack.zip archive: ${err?.message || 'corrupted archive'}`,
    };
  }
}

// ============================================================================
// Diff / Conflict preview against existing SQLite facts
// ============================================================================
export function diffPortablePackageAgainstExisting(
  pkg: PortableBrainPackageV1,
  existingFacts: Array<{
    id: number;
    brain: string;
    content: string;
    source: string;
    fileName?: string | null;
    filePath?: string | null;
    checksum?: string | null;
    fixtureId?: string | null;
  }>
): {
  items: PortableDiffItem[];
  summary: {
    totalInPackage: number;
    newCount: number;
    exactDuplicateCount: number;
    conflictCount: number;
    attachmentCount: number;
  };
} {
  const byFixture = new Map<string, (typeof existingFacts)[number]>();
  const byExactKey = new Map<string, (typeof existingFacts)[number]>();
  const byPathKey = new Map<string, (typeof existingFacts)[number]>();

  for (const ef of existingFacts) {
    const brain = ef.brain.toLowerCase();
    if (ef.fixtureId) {
      byFixture.set(`${brain}|${ef.fixtureId}`, ef);
    }
    const contentHash = sha256Hex(ef.content.trim());
    byExactKey.set(`${brain}|${contentHash}`, ef);
    if (ef.filePath) {
      byPathKey.set(`${brain}|${ef.filePath.toLowerCase()}`, ef);
    } else if (ef.fileName) {
      byPathKey.set(`${brain}|${ef.fileName.toLowerCase()}`, ef);
    }
  }

  let newCount = 0;
  let exactDuplicateCount = 0;
  let conflictCount = 0;

  const items: PortableDiffItem[] = pkg.facts.map((fact) => {
    const brain = fact.brain.toLowerCase();
    const contentHash = sha256Hex(fact.content.trim());
    const exactMatch = byExactKey.get(`${brain}|${contentHash}`);
    if (exactMatch) {
      exactDuplicateCount++;
      return {
        portableRefId: fact.portableRefId,
        brain: fact.brain,
        source: fact.source,
        fileName: fact.fileName,
        preview: fact.content.slice(0, 140),
        status: 'exact_duplicate',
        existingFactId: exactMatch.id,
        existingPreview: exactMatch.content.slice(0, 140),
      };
    }

    const fixtureMatch = fact.fixtureId ? byFixture.get(`${brain}|${fact.fixtureId}`) : undefined;
    const pathMatch = fact.filePath
      ? byPathKey.get(`${brain}|${fact.filePath.toLowerCase()}`)
      : fact.fileName
        ? byPathKey.get(`${brain}|${fact.fileName.toLowerCase()}`)
        : undefined;
    const conflictTarget = fixtureMatch || pathMatch;

    if (conflictTarget) {
      conflictCount++;
      return {
        portableRefId: fact.portableRefId,
        brain: fact.brain,
        source: fact.source,
        fileName: fact.fileName,
        preview: fact.content.slice(0, 140),
        status: 'conflict',
        existingFactId: conflictTarget.id,
        existingPreview: conflictTarget.content.slice(0, 140),
      };
    }

    newCount++;
    return {
      portableRefId: fact.portableRefId,
      brain: fact.brain,
      source: fact.source,
      fileName: fact.fileName,
      preview: fact.content.slice(0, 140),
      status: 'new',
    };
  });

  return {
    items,
    summary: {
      totalInPackage: pkg.facts.length,
      newCount,
      exactDuplicateCount,
      conflictCount,
      attachmentCount: pkg.attachments.length,
    },
  };
}
