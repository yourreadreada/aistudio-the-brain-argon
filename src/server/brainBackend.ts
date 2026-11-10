import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { GoogleGenAI } from '@google/genai';

export const ALLOWED_AI_SOURCES = [
  'claude',
  'gpt',
  'gemini',
  'github',
  'moodle',
  'cursor',
  'local-ai',
] as const;

export type ValidAISource = (typeof ALLOWED_AI_SOURCES)[number];

export const ALLOWED_RESOURCE_KINDS = [
  'conversation',
  'project_instructions',
  'artifact',
  'document',
  'code',
  'repository_metadata',
  'repository_file_tree',
] as const;

export type ValidResourceKind = (typeof ALLOWED_RESOURCE_KINDS)[number];

export const ALLOWED_FILE_TYPES = [
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'code',
  'md',
  'img',
  'chat',
  'json',
] as const;

export const MAX_COMPANION_ITEMS_PER_REQUEST = 50;
export const MAX_COMPANION_ITEM_CONTENT_LENGTH = 500_000;
export const MAX_FACT_CONTENT_LENGTH = 5_000_000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_FILENAME_LENGTH = 255;
export const MAX_FILEPATH_LENGTH = 1024;
export const MAX_BRAIN_NAME_LENGTH = 64;
export const MAX_TAGS_COUNT = 50;
export const MAX_TAG_LENGTH = 64;

export const INITIAL_SEED_FACTS = [
  {
    brain: 'coding',
    source: 'claude',
    content:
      'Dog translator project: Moved from heuristic regex audio rules to a real ML model. Preprocessing pipeline uses librosa for Mel-frequency cepstral coefficients (MFCCs) with PyTorch acoustic classifier.',
    tags: ['audio-ml', 'pytorch', 'dsp'],
    fileType: 'code',
    fileName: 'dog_translator_mfcc.py',
    created_at: '2026-10-02T14:22:00Z',
    updated_at: '2026-10-02T14:22:00Z',
  },
  {
    brain: 'coding',
    source: 'gpt',
    content:
      'Dog translator audio normalization: Target sampling rate is strictly 22050 Hz, mono channel, 3.5s sliding window to capture distinctive bark frequencies and whimpers.',
    tags: ['audio-ml', 'preprocessing', 'audio'],
    fileType: 'pdf',
    fileName: 'audio_normalization_spec.pdf',
    created_at: '2026-10-03T09:15:00Z',
    updated_at: '2026-10-03T09:15:00Z',
  },
  {
    brain: 'coding',
    source: 'cursor',
    content:
      'Canteen system architecture: Built on FastAPI + React + Redis pub/sub for instant order status queue. Token collection counters refresh live without polling.',
    tags: ['fastapi', 'redis', 'architecture'],
    fileType: 'docx',
    fileName: 'canteen_architecture_rfc.docx',
    created_at: '2026-10-03T16:40:00Z',
    updated_at: '2026-10-03T16:40:00Z',
  },
  {
    brain: 'coding',
    source: 'github',
    content:
      'Canteen system commit 4f9a2c: Swapped SQLite locks for Postgres connection pooling with PgBouncer. Peak load test sustained 850 concurrent lunch requests.',
    tags: ['postgres', 'performance', 'database'],
    fileType: 'xlsx',
    fileName: 'database_load_benchmarks.xlsx',
    created_at: '2026-10-04T11:05:00Z',
    updated_at: '2026-10-04T11:05:00Z',
  },
  {
    brain: 'coding',
    source: 'claude',
    content:
      'Preferred coding style: Always TypeScript strict mode, functional components, zero unnecessary abstractions, prefer early returns, no arbitrary try/catch swallowing errors. Use Tailwind for UI without CSS files.',
    tags: ['typescript', 'coding-style', 'frontend'],
    fileType: 'md',
    fileName: 'typescript_guidelines.md',
    created_at: '2026-10-04T13:30:00Z',
    updated_at: '2026-10-04T13:30:00Z',
  },
  {
    brain: 'coding',
    source: 'gemini',
    content:
      'Idea-builder-system: Context window optimization strategy. Store summaries in local vector cache and feed only the last 3 turns + top 5 relevant memory cards to preserve tokens.',
    tags: ['llm-context', 'vector-cache', 'optimization'],
    fileType: 'pptx',
    fileName: 'context_window_strategy.pptx',
    created_at: '2026-10-04T15:10:00Z',
    updated_at: '2026-10-04T15:10:00Z',
  },
  {
    brain: 'coding',
    source: 'local-ai',
    content:
      'Local Ollama setup: Qwen 2.5 Coder 14B runs at 38 t/s on local GPU; used for quick boilerplate generation without exposing internal project tokens.',
    tags: ['ollama', 'local-llm', 'gpu'],
    fileType: 'code',
    fileName: 'local_ollama_qwen.py',
    created_at: '2026-10-04T17:45:00Z',
    updated_at: '2026-10-04T17:45:00Z',
  },
  {
    brain: 'college',
    source: 'moodle',
    content:
      'Moodle extension: Automated scraper for attendance portal and lab submission notices. Uses DOM mutation observers to inject quick download buttons beside PDF links.',
    tags: ['moodle', 'scraping', 'extension'],
    fileType: 'code',
    fileName: 'moodle_scraper_extension.ts',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
  },
  {
    brain: 'college',
    source: 'moodle',
    content:
      'Computer Networks Assignment 3: Implementation of distance vector routing algorithm and Bellman-Ford count-to-infinity mitigation. Deadline Friday 11:59 PM.',
    tags: ['networks', 'assignment', 'algorithms'],
    fileType: 'pdf',
    fileName: 'cn_assignment3_routing.pdf',
    created_at: '2026-10-03T18:20:00Z',
    updated_at: '2026-10-03T18:20:00Z',
  },
  {
    brain: 'college',
    source: 'claude',
    content:
      'SIH (Smart India Hackathon) project: Edge AI system for offline agricultural disease detection on low-cost smartphones with quantized MobileNetV3.',
    tags: ['sih', 'edge-ai', 'hackathon'],
    fileType: 'pptx',
    fileName: 'sih_crop_disease_model.pptx',
    created_at: '2026-10-04T10:12:00Z',
    updated_at: '2026-10-04T10:12:00Z',
  },
  {
    brain: 'college',
    source: 'gpt',
    content:
      'Research paper literature review: Surveying retrieval-augmented generation architectures for cross-session developer memory retention.',
    tags: ['rag', 'research', 'paper'],
    fileType: 'pdf',
    fileName: 'rag_architectures_literature_review.pdf',
    created_at: '2026-10-04T12:00:00Z',
    updated_at: '2026-10-04T12:00:00Z',
  },
  {
    brain: 'coding',
    source: 'claude',
    content: `# Project - The Brain

#### User
new project idea: build something which is like a centralised memory, like this: https://apex.host/

#### Assistant
That search pulled up web/Minecraft hosting companies, not what you're describing — let me check the actual site directly. Who is this centralized memory for? What should it pull together first? Should the AI just answer questions from it, or also act?

#### User
me and if its good, we will launch it. What should it pull together first? everything. but first all different ai chats and codes and moodle, drive, things etc. personal mein can say not yet now. Should the AI just answer questions from it, or also act? no idea. i just thought of such idea, not clear about this though.

#### Assistant
Okay, that actually makes a lot of sense given how much you've got running in parallel — moodle extension, dog translator, canteen system, idea-builder-system, a couple of papers, SIH... you're basically already living the problem apex.host is solving for businesses, just across tools instead of across a sales team.
One thing worth flagging before we go further: Claude and ChatGPT don't give you a live API to pull your own conversation history. You can export it, but there's no "connect and it auto-syncs". So "code and Moodle and Drive" are realistically connect-and-sync; "AI chats" would start as exports or manual paste.
Which tools are in your rotation where re-explaining happens?

#### User
i am switching between tools and context understanding wastes a lot of time and tokens, which is not optimised and efficient. Claude, GPT, Gemini, GLM, Github, Local AI and what not, can say everything. By context explaining, i mean that if i am working on same project using different platforms, have to explain to each one of them, and not just that, a topic i need to understand, or just the way and style in which i code.

#### Assistant
That's a sharp, specific pain point — and honestly, you've got a live example of half this problem sitting right in front of you. What Claude is doing right now, reading those project files before answering you, is already a working mini-version of "context so I don't have to re-explain myself." The gap is that it's scoped to Claude only — if you move to ChatGPT or Cursor or Antigravity for the same project, none of that transfers.
Good catch — right now images inside a PDF or PPTX need OCR or Vision. Next up: a live GitHub connector to pull commits, issues and PRs in directly.`,
    tags: ['centralized-memory', 'multi-tool-context', 'apex-architecture'],
    fileType: 'md',
    fileName: 'Project - The Brain.md',
    filePath: 'exports/claude/Project - The Brain.md',
    isDocumentRoot: true,
    isUnifiedContextNode: true,
    documentTitle: 'Project - The Brain',
    semanticSectionCount: 6,
    mergeHistory: [
      {
        timestamp: '2026-10-06T09:50:00Z',
        action: 'created',
        summary: 'Unified context node initialized from Claude chat export (6 conversation turns)',
        newContentLength: 1740,
      },
    ],
    created_at: '2026-10-06T09:50:00Z',
    updated_at: '2026-10-06T09:50:00Z',
  },
  {
    brain: 'personal',
    source: 'gemini',
    content:
      'Reading & synthesis workflow: Technical papers and architectural notes are summarized into atomic durable facts and linked by project domain tags.',
    tags: ['workflow', 'knowledge-base', 'synthesis'],
    fileType: 'md',
    fileName: 'reading_synthesis_notes.md',
    created_at: '2026-10-05T11:20:00Z',
    updated_at: '2026-10-05T11:20:00Z',
  },
];

/**
 * Generates a cryptographically secure Companion Device Token (`brn_live_...`),
 * its SHA-256 hex digest for storage, and a display prefix.
 */
export function generateCompanionToken(): {
  token: string;
  fullToken: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const randomPart = crypto.randomBytes(32).toString('base64url');
  const token = `brn_live_${randomPart}`;
  const tokenHash = hashCompanionToken(token);
  const tokenPrefix = `${token.slice(0, 13)}…${token.slice(-4)}`;
  return { token, fullToken: token, tokenHash, tokenPrefix };
}

/**
 * Hashes a companion device token using SHA-256 so plaintext tokens are never stored in SQLite.
 */
export function hashCompanionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Verifies a Bearer token against active (non-revoked) devices in SQLite using timing-safe comparison.
 * Updates `last_used_at` ONLY when authentication succeeds.
 */
export function verifyCompanionToken(
  db: DatabaseSync,
  rawToken: string | undefined | null
): {
  id: string;
  name: string;
  token_prefix: string;
  browser: string;
  created_at: string;
  last_used_at: string;
  revoked_at: string | null;
} | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const trimmed = rawToken.trim();
  if (!trimmed.startsWith('brn_live_') || trimmed.length < 20 || trimmed.length > 256) {
    return null;
  }

  const candidateHash = hashCompanionToken(trimmed);
  const candidateBuf = Buffer.from(candidateHash, 'hex');

  const rows = db
    .prepare(
      `SELECT id, name, token_prefix, token_hash, browser, created_at, last_used_at, revoked_at
       FROM companion_devices
       WHERE revoked_at IS NULL AND token_hash IS NOT NULL AND token_hash != ''`
    )
    .all() as Array<{
    id: string;
    name: string;
    token_prefix: string;
    token_hash: string;
    browser: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>;

  for (const row of rows) {
    try {
      const storedBuf = Buffer.from(row.token_hash, 'hex');
      if (
        storedBuf.length === candidateBuf.length &&
        crypto.timingSafeEqual(storedBuf, candidateBuf)
      ) {
        const now = new Date().toISOString();
        db.prepare('UPDATE companion_devices SET last_used_at = ? WHERE id = ?').run(
          now,
          row.id
        );
        return {
          id: row.id,
          name: row.name,
          token_prefix: row.token_prefix,
          browser: row.browser,
          created_at: row.created_at,
          last_used_at: now,
          revoked_at: null,
        };
      }
    } catch {
      // Ignore malformed stored hash
    }
  }

  return null;
}

export type BackupKind = 'manual' | 'pre-migration' | 'pre-restore-safety';

export interface DatabaseIntegrityResult {
  valid: boolean;
  integrityStatus: string;
  schemaVersion: number;
  factsCount: number;
  sizeBytes: number;
  tables: string[];
  error?: string;
}

export interface BackupMetadata {
  fileName: string;
  backupPath: string;
  createdAt: string;
  sizeBytes: number;
  verified: boolean;
  integrityStatus: string;
  schemaVersion: number;
  factsCount: number;
  kind: BackupKind;
}

export interface CreateConsistentBackupOptions {
  backupDir?: string;
  kind?: BackupKind;
  maxBackups?: number;
  /**
   * Test hook to simulate an interrupted or corrupted staging snapshot before promotion.
   */
  simulateInterruptedBackup?: boolean;
  simulateCorruptStaging?: boolean;
}

export interface BackupRetentionResult {
  maxBackups: number;
  keptCount: number;
  deletedCount: number;
  deletedFiles: string[];
  lastKnownGoodBackup: string | null;
}

export interface RestoreDatabaseOptions {
  db?: DatabaseSync;
  dbPath: string;
  backupPath: string;
  backupDir?: string;
  /**
   * Test hooks to simulate failure during staging or during live restore commit
   * to verify automatic rollback to the pre-restore safety backup.
   */
  simulateStageFailure?: boolean;
  simulateApplyFailure?: boolean;
}

export interface RestoreDatabaseResult {
  success: boolean;
  restoredFrom: BackupMetadata;
  safetyBackup: BackupMetadata;
  factsCountAfterRestore: number;
  schemaVersionAfterRestore: number;
  integrityStatus: string;
}

const SQLITE_MAGIC_HEADER = 'SQLite format 3\0';
const REQUIRED_CORE_TABLES = [
  'app_metadata',
  'schema_migrations',
  'facts',
  'companion_devices',
  'companion_captures',
] as const;

/**
 * Checks whether a file on disk has a valid 16-byte SQLite3 file header.
 * Empty (0-byte) files are treated as uninitialized rather than corrupted.
 */
export function hasValidSqliteHeader(filePath: string): {
  valid: boolean;
  empty: boolean;
  error?: string;
} {
  if (!filePath || filePath === ':memory:' || !fs.existsSync(filePath)) {
    return { valid: true, empty: true };
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { valid: true, empty: true };
  }
  if (stat.size < 16) {
    return {
      valid: false,
      empty: false,
      error: `File is truncated (${stat.size} bytes < 16-byte SQLite header)`,
    };
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    const headerStr = buf.toString('utf8');
    if (headerStr !== SQLITE_MAGIC_HEADER) {
      return {
        valid: false,
        empty: false,
        error: 'Invalid SQLite file header (not a valid SQLite 3 database)',
      };
    }
    return { valid: true, empty: false };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Verifies a SQLite database file on disk using SQLite header inspection,
 * `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and core table presence.
 */
export function verifyDatabaseFileIntegrity(
  filePath: string,
  options?: { requireCoreTables?: boolean }
): DatabaseIntegrityResult {
  const requireCoreTables = options?.requireCoreTables !== false;

  if (!filePath || filePath === ':memory:' || !fs.existsSync(filePath)) {
    return {
      valid: false,
      integrityStatus: 'missing',
      schemaVersion: 0,
      factsCount: 0,
      sizeBytes: 0,
      tables: [],
      error: 'Database file does not exist',
    };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (err: any) {
    return {
      valid: false,
      integrityStatus: 'unreadable',
      schemaVersion: 0,
      factsCount: 0,
      sizeBytes: 0,
      tables: [],
      error: err?.message || 'Unable to stat database file',
    };
  }

  if (stat.size === 0) {
    return {
      valid: false,
      integrityStatus: 'empty',
      schemaVersion: 0,
      factsCount: 0,
      sizeBytes: 0,
      tables: [],
      error: 'Database file is empty (0 bytes)',
    };
  }

  const headerCheck = hasValidSqliteHeader(filePath);
  if (!headerCheck.valid) {
    return {
      valid: false,
      integrityStatus: 'corrupted_header',
      schemaVersion: 0,
      factsCount: 0,
      sizeBytes: stat.size,
      tables: [],
      error: headerCheck.error || 'Malformed SQLite header',
    };
  }

  let checkDb: DatabaseSync | null = null;
  try {
    checkDb = new DatabaseSync(filePath);
    const integrityRows = checkDb.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check?: string;
    }>;
    const integrityMessages = integrityRows
      .map((r) => String(r.integrity_check || '').trim())
      .filter(Boolean);
    const isIntegrityOk =
      integrityMessages.length === 1 &&
      integrityMessages[0].toLowerCase() === 'ok';

    if (!isIntegrityOk) {
      return {
        valid: false,
        integrityStatus: integrityMessages.join('; ') || 'integrity_check_failed',
        schemaVersion: 0,
        factsCount: 0,
        sizeBytes: stat.size,
        tables: [],
        error: `SQLite integrity_check failed: ${integrityMessages.join('; ')}`,
      };
    }

    const fkRows = checkDb.prepare('PRAGMA foreign_key_check').all();
    if (fkRows.length > 0) {
      return {
        valid: false,
        integrityStatus: 'foreign_key_violation',
        schemaVersion: 0,
        factsCount: 0,
        sizeBytes: stat.size,
        tables: [],
        error: `SQLite foreign_key_check reported ${fkRows.length} violation(s)`,
      };
    }

    const tableRows = checkDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tables = tableRows.map((r) => r.name);

    if (requireCoreTables) {
      const missingTables = REQUIRED_CORE_TABLES.filter(
        (reqTable) => !tables.includes(reqTable)
      );
      if (missingTables.length > 0) {
        return {
          valid: false,
          integrityStatus: `missing_tables:${missingTables.join(',')}`,
          schemaVersion: 0,
          factsCount: 0,
          sizeBytes: stat.size,
          tables,
          error: `Database is missing required Argon tables: ${missingTables.join(', ')}`,
        };
      }
    }

    let schemaVersion = 0;
    if (tables.includes('schema_migrations')) {
      const versionRow = checkDb
        .prepare('SELECT MAX(version) as maxVer FROM schema_migrations')
        .get() as { maxVer: number | null } | undefined;
      schemaVersion = Number(versionRow?.maxVer || 0);
    }

    let factsCount = 0;
    if (tables.includes('facts')) {
      const countRow = checkDb
        .prepare('SELECT count(*) as count FROM facts')
        .get() as { count: number } | undefined;
      factsCount = Number(countRow?.count || 0);
    }

    return {
      valid: true,
      integrityStatus: 'ok',
      schemaVersion,
      factsCount,
      sizeBytes: stat.size,
      tables,
    };
  } catch (err: any) {
    return {
      valid: false,
      integrityStatus: 'corrupted',
      schemaVersion: 0,
      factsCount: 0,
      sizeBytes: stat.size,
      tables: [],
      error: err?.message || 'SQLite database verification failed',
    };
  } finally {
    if (checkDb) {
      try {
        checkDb.close();
      } catch {}
    }
  }
}

/**
 * Removes incomplete `.tmp` staging files from the backup directory so interrupted
 * backups never linger or appear as valid backups.
 */
export function cleanupIncompleteBackups(backupDir: string): string[] {
  if (!backupDir || !fs.existsSync(backupDir)) return [];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(backupDir)) {
    if (
      entry.endsWith('.tmp') ||
      entry.endsWith('.tmp-wal') ||
      entry.endsWith('.tmp-shm') ||
      entry.startsWith('.staging_') ||
      entry.startsWith('.restore_stage_')
    ) {
      const fullPath = path.join(backupDir, entry);
      try {
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
          removed.push(entry);
        }
      } catch {}
    }
  }
  return removed;
}

/**
 * Generates a unique, non-colliding timestamped backup filename in `targetDir`
 * so an existing valid backup is NEVER overwritten.
 */
function allocateUniqueBackupFilePath(targetDir: string): {
  fileName: string;
  backupPath: string;
} {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let attempt = 0;
  while (true) {
    const randSuffix = crypto.randomBytes(3).toString('hex');
    const suffix = attempt === 0 ? randSuffix : `${randSuffix}_${attempt}`;
    const fileName = `brain_backup_${stamp}_${suffix}.db`;
    const backupPath = path.join(targetDir, fileName);
    if (!fs.existsSync(backupPath)) {
      return { fileName, backupPath };
    }
    attempt++;
  }
}

/**
 * Creates a transactionally consistent, verified SQLite snapshot using `VACUUM INTO`
 * to a temporary staging file first, verifies its integrity with `PRAGMA integrity_check`,
 * atomically renames it to a unique timestamped `.db` file, and writes a `.meta.json` sidecar.
 */
export function createConsistentBackup(
  dbOrPath: DatabaseSync | string,
  dbPathOrOptions?: string | CreateConsistentBackupOptions,
  maybeOptions: CreateConsistentBackupOptions = {}
): BackupMetadata {
  let activeDb: DatabaseSync | null = null;
  let ownsDb = false;
  let dbPath = '';
  let options: CreateConsistentBackupOptions = maybeOptions;

  if (typeof dbOrPath === 'string') {
    dbPath = dbOrPath;
    if (typeof dbPathOrOptions === 'object' && dbPathOrOptions !== null) {
      options = dbPathOrOptions;
    } else if (typeof dbPathOrOptions === 'string') {
      options = { ...maybeOptions, backupDir: dbPathOrOptions };
    }
  } else {
    activeDb = dbOrPath;
    if (typeof dbPathOrOptions === 'string') {
      dbPath = dbPathOrOptions;
    } else if (typeof dbPathOrOptions === 'object' && dbPathOrOptions !== null) {
      options = dbPathOrOptions;
      dbPath = (activeDb as any).__brainDbPath || '';
    } else {
      dbPath = (activeDb as any).__brainDbPath || '';
    }
  }

  if (!activeDb) {
    if (!dbPath || dbPath === ':memory:' || !fs.existsSync(dbPath)) {
      throw new Error(`Cannot create backup: database file not found at "${dbPath}"`);
    }
    const stat = fs.statSync(dbPath);
    if (stat.size === 0) {
      throw new Error(`Cannot create backup: database file at "${dbPath}" is empty`);
    }
    const headerCheck = hasValidSqliteHeader(dbPath);
    if (!headerCheck.valid) {
      throw new Error(
        `Cannot create backup: source database is malformed (${headerCheck.error})`
      );
    }
    activeDb = new DatabaseSync(dbPath);
    ownsDb = true;
  }

  const targetDir =
    options.backupDir ||
    (activeDb as any).__brainBackupDir ||
    (dbPath && dbPath !== ':memory:'
      ? path.join(path.dirname(dbPath), 'backups')
      : path.join(process.cwd(), 'data', 'backups'));

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  cleanupIncompleteBackups(targetDir);

  const stagingId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const stagingPath = path.join(targetDir, `.staging_brain_backup_${stagingId}.db.tmp`);

  try {
    const escapedStagingPath = stagingPath.replace(/'/g, "''");
    // VACUUM INTO creates a self-contained, transactionally consistent SQLite snapshot
    // safely even while the live database is open and in WAL mode.
    activeDb.exec(`VACUUM INTO '${escapedStagingPath}'`);

    if (options.simulateInterruptedBackup) {
      throw new Error('Simulated backup interruption during staging');
    }

    if (options.simulateCorruptStaging) {
      fs.writeFileSync(stagingPath, 'CORRUPTED_SQLITE_SNAPSHOT_BYTES', 'utf8');
    }

    // Verify the staged snapshot before promoting it to a final backup file.
    // Allow pre-migration backups of older schema versions that may not yet have all v4 tables.
    const kind: BackupKind = options.kind || 'manual';
    const verification = verifyDatabaseFileIntegrity(stagingPath, {
      requireCoreTables: kind !== 'pre-migration',
    });

    if (!verification.valid) {
      throw new Error(
        `Backup verification failed on staged snapshot: ${
          verification.error || verification.integrityStatus
        }`
      );
    }

    const { fileName, backupPath } = allocateUniqueBackupFilePath(targetDir);
    const createdAt = new Date().toISOString();

    // Atomically promote verified staging file to final backup path
    fs.renameSync(stagingPath, backupPath);

    const metadata: BackupMetadata = {
      fileName,
      backupPath,
      createdAt,
      sizeBytes: verification.sizeBytes,
      verified: true,
      integrityStatus: verification.integrityStatus,
      schemaVersion: verification.schemaVersion,
      factsCount: verification.factsCount,
      kind,
    };

    const metaPath = `${backupPath}.meta.json`;
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          fileName: metadata.fileName,
          createdAt: metadata.createdAt,
          sizeBytes: metadata.sizeBytes,
          verified: metadata.verified,
          integrityStatus: metadata.integrityStatus,
          schemaVersion: metadata.schemaVersion,
          factsCount: metadata.factsCount,
          kind: metadata.kind,
        },
        null,
        2
      ),
      'utf8'
    );

    if (typeof options.maxBackups === 'number' && options.maxBackups >= 1) {
      applyBackupRetention(targetDir, options.maxBackups);
    }

    return metadata;
  } finally {
    // Always clean up incomplete staging files on failure or interruption
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${stagingPath}${suffix}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    if (ownsDb && activeDb) {
      try {
        activeDb.close();
      } catch {}
    }
  }
}

/**
 * Creates a safe, SQLite-consistent timestamped backup of an existing SQLite database.
 * Returns the final verified backup file path, or `null` if the source database does not exist yet.
 */
export function backupDatabaseFile(
  dbPath: string,
  backupDir?: string,
  existingDb?: DatabaseSync,
  kind: BackupKind = 'manual'
): string | null {
  if (!dbPath || dbPath === ':memory:') {
    return null;
  }
  if (!existingDb) {
    if (!fs.existsSync(dbPath)) return null;
    const stat = fs.statSync(dbPath);
    if (stat.size === 0) return null;
  }
  const meta = existingDb
    ? createConsistentBackup(existingDb, dbPath, { backupDir, kind })
    : createConsistentBackup(dbPath, { backupDir, kind });
  return meta.backupPath;
}

/**
 * Lists all backup `.db` files in `backupDir` (ignoring incomplete `.tmp` staging files),
 * verifying each backup's SQLite integrity and reading its sidecar metadata.
 * Sorted newest-first.
 */
export function listBackups(backupDir: string): BackupMetadata[] {
  if (!backupDir || !fs.existsSync(backupDir)) {
    return [];
  }

  const entries = fs.readdirSync(backupDir);
  const backups: BackupMetadata[] = [];

  for (const entry of entries) {
    // Never list temporary/staging files or hidden files as backups
    if (
      !entry.endsWith('.db') ||
      entry.endsWith('.tmp') ||
      entry.startsWith('.')
    ) {
      continue;
    }

    const fullPath = path.join(backupDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    const metaPath = `${fullPath}.meta.json`;
    let sidecar: Partial<BackupMetadata> = {};
    if (fs.existsSync(metaPath)) {
      try {
        sidecar = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {}
    }

    const kind: BackupKind =
      sidecar.kind === 'pre-migration' ||
      sidecar.kind === 'pre-restore-safety' ||
      sidecar.kind === 'manual'
        ? sidecar.kind
        : 'manual';

    const verification = verifyDatabaseFileIntegrity(fullPath, {
      requireCoreTables: kind !== 'pre-migration',
    });

    backups.push({
      fileName: entry,
      backupPath: fullPath,
      createdAt: sidecar.createdAt || stat.mtime.toISOString(),
      sizeBytes: stat.size,
      verified: verification.valid,
      integrityStatus: verification.valid
        ? 'ok'
        : verification.error || verification.integrityStatus,
      schemaVersion: verification.valid
        ? verification.schemaVersion
        : Number(sidecar.schemaVersion || 0),
      factsCount: verification.valid
        ? verification.factsCount
        : Number(sidecar.factsCount || 0),
      kind,
    });
  }

  backups.sort((a, b) => {
    const timeDiff =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.fileName.localeCompare(a.fileName);
  });

  return backups;
}

/**
 * Applies backup retention cleanup in `backupDir`, keeping up to `maxBackups` verified backups.
 * SAFETY INVARIANT: Never deletes the last known-good (`verified: true`) backup.
 */
export function applyBackupRetention(
  backupDir: string,
  maxBackups: number = 10
): BackupRetentionResult {
  const effectiveMax = Math.max(1, Math.floor(Number(maxBackups) || 10));
  if (!backupDir || !fs.existsSync(backupDir)) {
    return {
      maxBackups: effectiveMax,
      keptCount: 0,
      deletedCount: 0,
      deletedFiles: [],
      lastKnownGoodBackup: null,
    };
  }

  cleanupIncompleteBackups(backupDir);

  const allBackups = listBackups(backupDir);
  const verifiedBackups = allBackups.filter((b) => b.verified);
  const lastKnownGood = verifiedBackups.length > 0 ? verifiedBackups[0] : null;

  if (verifiedBackups.length <= effectiveMax) {
    return {
      maxBackups: effectiveMax,
      keptCount: allBackups.length,
      deletedCount: 0,
      deletedFiles: [],
      lastKnownGoodBackup: lastKnownGood ? lastKnownGood.fileName : null,
    };
  }

  const toDelete = verifiedBackups.slice(effectiveMax);
  const deletedFiles: string[] = [];

  for (const candidate of toDelete) {
    // Never delete the last known-good backup under any circumstance
    if (lastKnownGood && candidate.fileName === lastKnownGood.fileName) {
      continue;
    }
    try {
      if (fs.existsSync(candidate.backupPath)) {
        fs.unlinkSync(candidate.backupPath);
      }
      for (const suffix of ['.meta.json', '-wal', '-shm']) {
        const sidePath = `${candidate.backupPath}${suffix}`;
        if (fs.existsSync(sidePath)) {
          fs.unlinkSync(sidePath);
        }
      }
      deletedFiles.push(candidate.fileName);
    } catch {}
  }

  const remaining = listBackups(backupDir);
  return {
    maxBackups: effectiveMax,
    keptCount: remaining.length,
    deletedCount: deletedFiles.length,
    deletedFiles,
    lastKnownGoodBackup: lastKnownGood ? lastKnownGood.fileName : null,
  };
}

const OPTIONAL_EXTENDED_TABLES = [
  'activity_logs',
  'wormhole_transfers',
] as const;

/**
 * Copies all Argon schema tables and auto-increment sequences from an attached source
 * database schema (`restore_source`) into `main` inside a single atomic transaction.
 */
function copyDatabaseStateFromAttached(
  targetDb: DatabaseSync,
  attachedFilePath: string,
  simulateApplyFailure?: boolean
): void {
  const escapedPath = attachedFilePath.replace(/'/g, "''");
  targetDb.exec(`ATTACH DATABASE '${escapedPath}' AS restore_source`);
  try {
    targetDb.exec('BEGIN IMMEDIATE');
    try {
      const sourceTables = (
        targetDb
          .prepare(`SELECT name FROM restore_source.sqlite_master WHERE type = 'table'`)
          .all() as Array<{ name: string }>
      ).map((t) => t.name);
      const mainTables = (
        targetDb
          .prepare(`SELECT name FROM main.sqlite_master WHERE type = 'table'`)
          .all() as Array<{ name: string }>
      ).map((t) => t.name);

      const tablesToSync = [
        ...REQUIRED_CORE_TABLES,
        ...OPTIONAL_EXTENDED_TABLES.filter(
          (t) => sourceTables.includes(t) && mainTables.includes(t)
        ),
      ];

      for (const table of tablesToSync) {
        if (!mainTables.includes(table) || !sourceTables.includes(table)) continue;
        targetDb.exec(`DELETE FROM main.${table}`);
        const cols = (
          targetDb.prepare(`PRAGMA main.table_info(${table})`).all() as Array<{
            name: string;
          }>
        ).map((c) => c.name);
        const srcCols = (
          targetDb
            .prepare(`PRAGMA restore_source.table_info(${table})`)
            .all() as Array<{ name: string }>
        ).map((c) => c.name);
        const sharedCols = cols.filter((c) => srcCols.includes(c));
        if (sharedCols.length > 0) {
          const colList = sharedCols.join(', ');
          targetDb.exec(
            `INSERT INTO main.${table} (${colList}) SELECT ${colList} FROM restore_source.${table}`
          );
        }
      }

      // Synchronize sqlite_sequence for facts so AUTOINCREMENT continues cleanly after restore
      try {
        targetDb.exec(`DELETE FROM main.sqlite_sequence WHERE name = 'facts'`);
        targetDb.exec(
          `INSERT INTO main.sqlite_sequence (name, seq) SELECT 'facts', COALESCE(MAX(id), 0) FROM main.facts`
        );
      } catch {}

      if (simulateApplyFailure) {
        throw new Error(
          'Simulated failure while applying staged restore to live database'
        );
      }

      targetDb.exec('COMMIT');
    } catch (err) {
      try {
        targetDb.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  } finally {
    try {
      targetDb.exec('DETACH DATABASE restore_source');
    } catch {}
  }

  try {
    targetDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {}
}

/**
 * Safely restores the database from a validated backup:
 * 1. Validates the candidate backup file (`PRAGMA integrity_check`, header, tables).
 * 2. Automatically creates a verified `pre-restore-safety` backup of the current live database.
 * 3. Stages the candidate backup into a temporary file, runs any pending migrations on the staged copy,
 *    and verifies the staged database (`PRAGMA integrity_check`) before touching the live database.
 * 4. Applies the verified staged database transactionally (and checkpoints WAL).
 * 5. Verifies the restored live database (`PRAGMA integrity_check`).
 * 6. If any stage fails, preserves or automatically rolls back to the `pre-restore-safety` backup.
 */
export function restoreDatabaseFromBackup(
  options: RestoreDatabaseOptions
): RestoreDatabaseResult {
  const { dbPath, backupPath } = options;
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error('Selected backup file does not exist');
  }

  // Step 1: Validate the candidate backup before doing anything else
  const candidateVerification = verifyDatabaseFileIntegrity(backupPath, {
    requireCoreTables: false,
  });
  if (!candidateVerification.valid) {
    throw new Error(
      `Cannot restore from invalid or corrupted backup: ${
        candidateVerification.error || candidateVerification.integrityStatus
      }`
    );
  }
  if (!candidateVerification.tables.includes('facts')) {
    throw new Error(
      'Cannot restore: backup file does not contain a valid Argon facts table'
    );
  }

  const targetBackupDir =
    options.backupDir ||
    (options.db && (options.db as any).__brainBackupDir) ||
    (dbPath && dbPath !== ':memory:'
      ? path.join(path.dirname(dbPath), 'backups')
      : path.join(process.cwd(), 'data', 'backups'));

  if (!fs.existsSync(targetBackupDir)) {
    fs.mkdirSync(targetBackupDir, { recursive: true });
  }

  let liveDb: DatabaseSync | null = options.db || null;
  let ownsLiveDb = false;
  if (!liveDb) {
    if (!dbPath || dbPath === ':memory:') {
      throw new Error('A valid database path or open DatabaseSync instance is required');
    }
    const initialized = initializeDatabase(dbPath, {
      seedOnBrandNewDb: false,
      backupDir: targetBackupDir,
    });
    liveDb = initialized.db;
    ownsLiveDb = true;
  }

  const stagingId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const stagedRestorePath = path.join(
    targetBackupDir,
    `.restore_stage_${stagingId}.db.tmp`
  );

  try {
    // Step 2: Create a verified safety backup of the current live database BEFORE restoring
    const safetyBackup = createConsistentBackup(liveDb, dbPath, {
      backupDir: targetBackupDir,
      kind: 'pre-restore-safety',
    });

    if (!safetyBackup.verified) {
      throw new Error(
        'Aborted restore: failed to verify pre-restore safety backup of current database'
      );
    }

    // Step 3: Stage the backup into a temporary file, migrate if older schema, and verify integrity
    let candidateDb: DatabaseSync | null = null;
    try {
      candidateDb = new DatabaseSync(backupPath);
      const escapedStage = stagedRestorePath.replace(/'/g, "''");
      candidateDb.exec(`VACUUM INTO '${escapedStage}'`);
    } finally {
      if (candidateDb) {
        try {
          candidateDb.close();
        } catch {}
      }
    }

    if (options.simulateStageFailure) {
      throw new Error('Simulated failure during restore staging verification');
    }

    // Ensure the staged database has all current migrations applied
    let stageDb: DatabaseSync | null = null;
    try {
      stageDb = new DatabaseSync(stagedRestorePath);
      runSchemaMigrations(stageDb);
    } finally {
      if (stageDb) {
        try {
          stageDb.close();
        } catch {}
      }
    }

    const stageVerification = verifyDatabaseFileIntegrity(stagedRestorePath, {
      requireCoreTables: true,
    });
    if (!stageVerification.valid) {
      throw new Error(
        `Staged restore verification failed: ${
          stageVerification.error || stageVerification.integrityStatus
        }`
      );
    }

    // Step 4: Apply the verified staged database to the live database, with automatic rollback on failure
    try {
      copyDatabaseStateFromAttached(
        liveDb,
        stagedRestorePath,
        options.simulateApplyFailure
      );

      // Step 5: Verify the live database integrity after restore
      const liveIntegrityRow = liveDb
        .prepare('PRAGMA integrity_check')
        .get() as { integrity_check?: string } | undefined;
      if (
        !liveIntegrityRow ||
        String(liveIntegrityRow.integrity_check || '').toLowerCase() !== 'ok'
      ) {
        throw new Error(
          `Post-restore integrity check failed: ${
            liveIntegrityRow?.integrity_check || 'unknown'
          }`
        );
      }
    } catch (applyErr: any) {
      // Step 6: Automatic rollback from the verified pre-restore safety backup
      try {
        copyDatabaseStateFromAttached(liveDb, safetyBackup.backupPath, false);
      } catch {}
      const rollbackErr = new Error(
        `Restore failed and was safely rolled back to safety backup (${safetyBackup.fileName}): ${
          applyErr?.message || 'Unknown error'
        }`
      );
      (rollbackErr as any).rolledBack = true;
      (rollbackErr as any).safetyBackup = safetyBackup;
      throw rollbackErr;
    }

    const factsCountAfterRestore = (
      liveDb.prepare('SELECT count(*) as count FROM facts').get() as {
        count: number;
      }
    ).count;
    const schemaVersionRow = liveDb
      .prepare('SELECT MAX(version) as maxVer FROM schema_migrations')
      .get() as { maxVer: number | null } | undefined;
    const schemaVersionAfterRestore = Number(schemaVersionRow?.maxVer || 0);

    const backupStat = fs.statSync(backupPath);
    let sidecar: Partial<BackupMetadata> = {};
    const metaPath = `${backupPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        sidecar = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {}
    }
    const restoredKind: BackupKind =
      sidecar.kind === 'pre-migration' ||
      sidecar.kind === 'pre-restore-safety' ||
      sidecar.kind === 'manual'
        ? sidecar.kind
        : 'manual';

    const restoredFrom: BackupMetadata = {
      fileName: path.basename(backupPath),
      backupPath,
      createdAt: sidecar.createdAt || backupStat.mtime.toISOString(),
      sizeBytes: backupStat.size,
      verified: true,
      integrityStatus: 'ok',
      schemaVersion: candidateVerification.schemaVersion,
      factsCount: candidateVerification.factsCount,
      kind: restoredKind,
    };

    return {
      success: true,
      restoredFrom,
      safetyBackup,
      factsCountAfterRestore,
      schemaVersionAfterRestore,
      integrityStatus: 'ok',
    };
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${stagedRestorePath}${suffix}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    if (ownsLiveDb && liveDb) {
      try {
        liveDb.close();
      } catch {}
    }
  }
}

export interface MigrationDefinition {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

export const SCHEMA_MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db: DatabaseSync) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brain TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          file_name TEXT,
          file_path TEXT,
          file_type TEXT,
          tags_json TEXT,
          parent_id INTEGER,
          is_document_root INTEGER DEFAULT 0,
          is_unified_context_node INTEGER DEFAULT 0,
          document_title TEXT,
          semantic_section_count INTEGER,
          merge_history_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS companion_devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token_prefix TEXT NOT NULL,
          token_value TEXT NOT NULL DEFAULT '',
          token_hash TEXT,
          browser TEXT,
          created_at TEXT NOT NULL,
          last_used_at TEXT,
          revoked_at TEXT
        );

        CREATE TABLE IF NOT EXISTS companion_captures (
          id TEXT PRIMARY KEY,
          brain TEXT NOT NULL,
          source TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_type TEXT,
          project_name TEXT,
          provenance_url TEXT,
          resource_kind TEXT,
          tags_json TEXT,
          unreachable_json TEXT,
          device_id TEXT,
          created_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: '002_facts_extended_columns',
    up: (db: DatabaseSync) => {
      const existingCols = (
        db.prepare('PRAGMA table_info(facts)').all() as { name: string }[]
      ).map((c) => c.name);
      const alterColumns: [string, string][] = [
        ['file_type', 'TEXT'],
        ['tags_json', 'TEXT'],
        ['parent_id', 'INTEGER'],
        ['is_document_root', 'INTEGER DEFAULT 0'],
        ['is_unified_context_node', 'INTEGER DEFAULT 0'],
        ['document_title', 'TEXT'],
        ['semantic_section_count', 'INTEGER'],
        ['merge_history_json', 'TEXT'],
      ];
      for (const [col, type] of alterColumns) {
        if (!existingCols.includes(col)) {
          db.exec(`ALTER TABLE facts ADD COLUMN ${col} ${type}`);
        }
      }
    },
  },
  {
    version: 3,
    name: '003_companion_device_security',
    up: (db: DatabaseSync) => {
      const existingCols = (
        db.prepare('PRAGMA table_info(companion_devices)').all() as {
          name: string;
        }[]
      ).map((c) => c.name);

      if (!existingCols.includes('token_hash')) {
        db.exec('ALTER TABLE companion_devices ADD COLUMN token_hash TEXT');
      }
      if (!existingCols.includes('revoked_at')) {
        db.exec('ALTER TABLE companion_devices ADD COLUMN revoked_at TEXT');
      }

      // Migrate any legacy plaintext token_value rows to SHA-256 token_hash and scrub plaintext
      if (existingCols.includes('token_value')) {
        const legacyRows = db
          .prepare(
            `SELECT id, token_value, token_hash FROM companion_devices
             WHERE token_value IS NOT NULL AND token_value != ''`
          )
          .all() as {
          id: string;
          token_value: string;
          token_hash: string | null;
        }[];

        const updateStmt = db.prepare(
          `UPDATE companion_devices SET token_hash = ?, token_value = '' WHERE id = ?`
        );
        for (const row of legacyRows) {
          const computedHash = row.token_hash || hashCompanionToken(row.token_value);
          updateStmt.run(computedHash, row.id);
        }
      }
    },
  },
  {
    version: 4,
    name: '004_companion_captures_hardening',
    up: (db: DatabaseSync) => {
      const existingCols = (
        db.prepare('PRAGMA table_info(companion_captures)').all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const alterColumns: [string, string][] = [
        ['file_type', 'TEXT'],
        ['project_name', 'TEXT'],
        ['provenance_url', 'TEXT'],
        ['resource_kind', 'TEXT'],
        ['tags_json', 'TEXT'],
        ['unreachable_json', 'TEXT'],
        ['device_id', 'TEXT'],
      ];
      for (const [col, type] of alterColumns) {
        if (!existingCols.includes(col)) {
          db.exec(`ALTER TABLE companion_captures ADD COLUMN ${col} ${type}`);
        }
      }
    },
  },
  {
    version: 5,
    name: '005_provenance_audit_and_entities',
    up: (db: DatabaseSync) => {
      const existingFactCols = (
        db.prepare('PRAGMA table_info(facts)').all() as { name: string }[]
      ).map((c) => c.name);

      const newFactColumns: [string, string][] = [
        ['source_folder', 'TEXT'],
        ['original_created_at', 'TEXT'],
        ['imported_at', 'TEXT'],
        ['import_batch_id', 'TEXT'],
        ['checksum', 'TEXT'],
        ['extraction_status', "TEXT DEFAULT 'success'"],
        ['extraction_warnings_json', 'TEXT'],
        ['related_sources_json', 'TEXT'],
        ['fixture_id', 'TEXT'],
        ['topic_key', 'TEXT'],
        ['file_size_bytes', 'INTEGER'],
        ['structured_data_json', 'TEXT'],
      ];

      for (const [col, type] of newFactColumns) {
        if (!existingFactCols.includes(col)) {
          db.exec(`ALTER TABLE facts ADD COLUMN ${col} ${type}`);
        }
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          operation_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          duration_ms INTEGER,
          brain TEXT,
          source TEXT,
          record_id INTEGER,
          file_name TEXT,
          batch_or_backup_id TEXT,
          summary TEXT NOT NULL,
          details_json TEXT,
          error_category TEXT,
          recovery_action TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_brain ON activity_logs(brain);

        CREATE TABLE IF NOT EXISTS wormhole_transfers (
          id TEXT PRIMARY KEY,
          origin_entity TEXT NOT NULL,
          destination_entity TEXT NOT NULL,
          destination_brain TEXT NOT NULL,
          transferred_fact_ids_json TEXT,
          direction TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          transformation_summary TEXT NOT NULL,
          validation_status TEXT NOT NULL,
          audit_operation_id TEXT NOT NULL
        );
      `);

      // Non-destructively repair and enrich provenance on existing facts rows
      repairAndEnrichFactsProvenance(db);
    },
  },
];

/**
 * Maps a raw folder segment or provider label to a canonical AISource.
 */
export function resolveServerSourceToken(token: string): ValidAISource | null {
  const clean = (token || '').trim().toLowerCase();
  if (!clean) return null;
  if (
    clean === '01_claude' ||
    clean === 'claude' ||
    clean === 'anthropic' ||
    clean.startsWith('01_claude') ||
    clean.includes('claude')
  ) {
    return 'claude';
  }
  if (
    clean === '02_chatgpt' ||
    clean === 'chatgpt' ||
    clean === 'gpt' ||
    clean === 'openai' ||
    clean.startsWith('02_chatgpt') ||
    clean.includes('chatgpt') ||
    clean.includes('openai')
  ) {
    return 'gpt';
  }
  if (
    clean === '03_gemini' ||
    clean === 'gemini' ||
    clean.startsWith('03_gemini') ||
    clean.includes('gemini')
  ) {
    return 'gemini';
  }
  if (
    clean === '04_github' ||
    clean === 'github' ||
    clean.startsWith('04_github') ||
    clean.includes('github')
  ) {
    return 'github';
  }
  if (
    clean === '05_moodle' ||
    clean === 'moodle' ||
    clean.startsWith('05_moodle') ||
    clean.includes('moodle')
  ) {
    return 'moodle';
  }
  if (
    clean === '06_cursor_antigravity' ||
    clean === '06_cursor' ||
    clean === 'cursor' ||
    clean === 'antigravity' ||
    clean.startsWith('06_cursor') ||
    clean.includes('cursor') ||
    clean.includes('antigravity')
  ) {
    return 'cursor';
  }
  if (
    clean === '07_local_ai_ollama' ||
    clean === '07_local_ai' ||
    clean === 'local-ai' ||
    clean === 'local_ai' ||
    clean === 'ollama' ||
    clean.startsWith('07_local_ai') ||
    clean.includes('local_ai') ||
    clean.includes('local-ai') ||
    clean.includes('ollama')
  ) {
    return 'local-ai';
  }
  return null;
}

/**
 * Resolves authoritative source and metadata from a fact's file_path and content.
 * Folder path (`01_claude`, `02_chatgpt`, etc.) and explicit `Primary Source:` headers
 * strictly take precedence over incidental keywords in body text.
 */
export function deriveAuthoritativeFactProvenance(
  filePath: string | null | undefined,
  fileName: string | null | undefined,
  content: string | null | undefined,
  currentSource: string
): {
  source: ValidAISource;
  sourceFolder: string | null;
  fixtureId: string | null;
  relatedSources: ValidAISource[];
  topicKey: string | null;
  originalCreatedAt: string | null;
  checksum: string;
  fileSizeBytes: number;
  wasSourceRepaired: boolean;
} {
  const rawContent = String(content || '');
  const checksum = crypto
    .createHash('sha256')
    .update(rawContent, 'utf8')
    .digest('hex');
  const fileSizeBytes = Buffer.byteLength(rawContent, 'utf8');

  const normPath = String(filePath || fileName || '')
    .replace(/\\/g, '/')
    .trim();
  const segments = normPath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];

  let resolvedSource: ValidAISource | null = null;
  let sourceFolder: string | null = null;

  // 1. Folder path segment precedence
  for (const seg of dirSegments) {
    const matched = resolveServerSourceToken(seg);
    if (matched) {
      resolvedSource = matched;
      sourceFolder = seg;
      break;
    }
  }

  // 2. Explicit `Primary Source:` header in content
  const headerSlice = rawContent.slice(0, 3000);
  if (!resolvedSource) {
    const headerMatch =
      headerSlice.match(
        /(?:\*\*Primary Source:\*\*|Primary Source:)\s*([^\n\r]+)/i
      ) || headerSlice.match(/"primary_source"\s*:\s*"([^"]+)"/i);
    if (headerMatch && headerMatch[1]) {
      const token = headerMatch[1].replace(/[*`]/g, '').trim();
      const matched = resolveServerSourceToken(token);
      if (matched) {
        resolvedSource = matched;
        if (!sourceFolder) {
          sourceFolder = dirSegments[dirSegments.length - 1] || token;
        }
      }
    }
  }

  const fallbackSource: ValidAISource = (
    ALLOWED_AI_SOURCES as readonly string[]
  ).includes(currentSource)
    ? (currentSource as ValidAISource)
    : 'claude';
  const finalSource: ValidAISource = resolvedSource || fallbackSource;
  const wasSourceRepaired = Boolean(
    resolvedSource && resolvedSource !== currentSource
  );

  if (!sourceFolder && dirSegments.length > 0) {
    sourceFolder = dirSegments[dirSegments.length - 1];
  }

  // 3. Extract Fixture ID
  let fixtureId: string | null = null;
  const fixtureMatch =
    headerSlice.match(/(?:\*\*Fixture ID:\*\*|Fixture ID:)\s*([A-Z0-9_-]+)/i) ||
    headerSlice.match(/"fixture_id"\s*:\s*"([^"]+)"/i) ||
    headerSlice.match(
      /\b(BRAIN-(?:GRAPH|CORPUS|STRESS|FIXTURE|TEST)-[A-Z0-9_-]+)\b/
    );
  if (fixtureMatch && fixtureMatch[1]) {
    fixtureId = fixtureMatch[1].trim();
  }

  // 4. Extract Related Sources
  const relatedSet = new Set<ValidAISource>();
  const relatedMatch =
    headerSlice.match(
      /(?:\*\*Related Sources?:\*\*|Related Sources?:)\s*([^\n\r]+)/i
    ) || headerSlice.match(/"related_sources"\s*:\s*\[([^\]]+)\]/i);
  if (relatedMatch && relatedMatch[1]) {
    const tokens = relatedMatch[1].replace(/["'`*]/g, '').split(/[,;|]+/);
    for (const tok of tokens) {
      const m = resolveServerSourceToken(tok);
      if (m && m !== finalSource) {
        relatedSet.add(m);
      }
    }
  }

  // 5. Extract Topic Key
  let topicKey: string | null = null;
  const topicMatch =
    headerSlice.match(/(?:\*\*Topic Key:\*\*|Topic Key:)\s*([^\n\r]+)/i) ||
    headerSlice.match(/"topic_key"\s*:\s*"([^"]+)"/i);
  if (topicMatch && topicMatch[1]) {
    topicKey = topicMatch[1].replace(/[*`]/g, '').trim().toLowerCase();
  }

  // 6. Extract Original Created At (only when explicitly in document metadata; never invented)
  let originalCreatedAt: string | null = null;
  const origDateMatch =
    headerSlice.match(
      /(?:\*\*Original Created(?: At)?:\*\*|\*\*Document Date:\*\*|\*\*Created Date:\*\*|Original Created At:|Document Date:)\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?)/i
    ) ||
    headerSlice.match(
      /"(?:original_created_at|document_date|created_date)"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/i
    );
  if (origDateMatch && origDateMatch[1]) {
    originalCreatedAt = origDateMatch[1].trim();
  }

  return {
    source: finalSource,
    sourceFolder,
    fixtureId,
    relatedSources: Array.from(relatedSet),
    topicKey,
    originalCreatedAt,
    checksum,
    fileSizeBytes,
    wasSourceRepaired,
  };
}

/**
 * Non-destructively scans all rows in `facts` and repairs misattributed `source` fields
 * where folder provenance (`01_claude/...`, `02_chatgpt/...`, etc.) or explicit `Primary Source:`
 * headers were previously overridden by body keyword heuristics. Also populates `source_folder`,
 * `fixture_id`, `related_sources_json`, `topic_key`, `checksum`, and `file_size_bytes`.
 */
export function repairAndEnrichFactsProvenance(db: DatabaseSync): {
  totalInspected: number;
  repairedCount: number;
  repairedIds: number[];
} {
  let rows: any[] = [];
  try {
    rows = db.prepare('SELECT * FROM facts ORDER BY id ASC').all() as any[];
  } catch {
    return { totalInspected: 0, repairedCount: 0, repairedIds: [] };
  }

  const updateStmt = db.prepare(`
    UPDATE facts
    SET source = ?,
        source_folder = COALESCE(?, source_folder),
        fixture_id = COALESCE(?, fixture_id),
        related_sources_json = COALESCE(?, related_sources_json),
        topic_key = COALESCE(?, topic_key),
        original_created_at = COALESCE(?, original_created_at),
        imported_at = COALESCE(imported_at, created_at),
        checksum = COALESCE(checksum, ?),
        file_size_bytes = COALESCE(file_size_bytes, ?),
        extraction_status = COALESCE(extraction_status, 'success')
    WHERE id = ?
  `);

  const repairedIds: number[] = [];
  const sourceTransitionCounts: Record<string, number> = {};

  for (const row of rows) {
    const derived = deriveAuthoritativeFactProvenance(
      row.file_path,
      row.file_name,
      row.content,
      row.source
    );

    const relatedJson =
      derived.relatedSources.length > 0
        ? JSON.stringify(derived.relatedSources)
        : row.related_sources_json || null;

    updateStmt.run(
      derived.source,
      derived.sourceFolder,
      derived.fixtureId,
      relatedJson,
      derived.topicKey,
      derived.originalCreatedAt,
      derived.checksum,
      derived.fileSizeBytes,
      row.id
    );

    if (derived.wasSourceRepaired) {
      repairedIds.push(row.id);
      const key = `${row.source} -> ${derived.source}`;
      sourceTransitionCounts[key] = (sourceTransitionCounts[key] || 0) + 1;
    }
  }

  if (repairedIds.length > 0) {
    try {
      recordSystemAuditLog(db, {
        category: 'migration_executed',
        status: 'success',
        summary: `Repaired source provenance on ${repairedIds.length} corpus record(s) using authoritative folder/header provenance`,
        details: {
          totalInspected: rows.length,
          repairedCount: repairedIds.length,
          transitions: sourceTransitionCounts,
          sampleRepairedIds: repairedIds.slice(0, 25),
        },
      });
    } catch {}
  }

  return {
    totalInspected: rows.length,
    repairedCount: repairedIds.length,
    repairedIds,
  };
}

/**
 * Redacts sensitive tokens, Bearer strings, or API keys from any diagnostic details object before storage or export.
 */
export function redactSecrets(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input
      .replace(/brn_live_[a-zA-Z0-9_-]+/g, 'brn_live_[REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/AIza[a-zA-Z0-9_-]{20,}/g, 'AIza[REDACTED]');
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item));
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (/^(token|token_value|token_hash|secret|password|authorization|api_?key)$/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return input;
}

export interface SystemAuditLogInput {
  id?: string;
  operationId?: string;
  timestamp?: string;
  category: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  durationMs?: number | null;
  brain?: string | null;
  source?: string | null;
  recordId?: number | null;
  fileName?: string | null;
  batchOrBackupId?: string | null;
  summary: string;
  details?: Record<string, any> | null;
  errorCategory?: string | null;
  recoveryAction?: string | null;
}

export function recordSystemAuditLog(
  db: DatabaseSync,
  entry: SystemAuditLogInput
): any {
  try {
    const hasTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='activity_logs'`
      )
      .get();
    if (!hasTable) return null;

    const id =
      entry.id ||
      `act_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const operationId =
      entry.operationId || `op_${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = entry.timestamp || new Date().toISOString();
    const status = entry.status || 'success';
    const sanitizedDetails = entry.details ? redactSecrets(entry.details) : null;
    const detailsJson = sanitizedDetails
      ? JSON.stringify(sanitizedDetails)
      : null;

    db.prepare(`
      INSERT INTO activity_logs (
        id, operation_id, timestamp, category, status, duration_ms,
        brain, source, record_id, file_name, batch_or_backup_id,
        summary, details_json, error_category, recovery_action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      operationId,
      timestamp,
      entry.category,
      status,
      entry.durationMs ?? null,
      entry.brain ?? null,
      entry.source ?? null,
      entry.recordId ?? null,
      entry.fileName ?? null,
      entry.batchOrBackupId ?? null,
      redactSecrets(entry.summary),
      detailsJson,
      entry.errorCategory ?? null,
      entry.recoveryAction ?? null
    );

    return {
      id,
      operationId,
      timestamp,
      category: entry.category,
      status,
      durationMs: entry.durationMs ?? undefined,
      brain: entry.brain ?? undefined,
      source: entry.source ?? undefined,
      recordId: entry.recordId ?? undefined,
      fileName: entry.fileName ?? undefined,
      batchOrBackupId: entry.batchOrBackupId ?? undefined,
      summary: redactSecrets(entry.summary),
      details: sanitizedDetails ?? undefined,
      errorCategory: entry.errorCategory ?? undefined,
      recoveryAction: entry.recoveryAction ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Runs repeatable, versioned, ordered schema migrations and creates a verified
 * SQLite-consistent backup prior to migrating if an existing database has user data
 * and pending migrations. Each migration executes in an atomic transaction.
 */
export function runSchemaMigrations(
  db: DatabaseSync,
  dbPath?: string,
  backupDir?: string,
  customMigrations?: MigrationDefinition[]
): { appliedMigrations: string[]; backupPath: string | null } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC')
    .all() as { version: number; name: string }[];
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  const allMigrations = [...(customMigrations || SCHEMA_MIGRATIONS)].sort(
    (a, b) => a.version - b.version
  );
  const pending = allMigrations.filter((m) => !appliedVersions.has(m.version));
  if (pending.length === 0) {
    return { appliedMigrations: [], backupPath: null };
  }

  // Check if the database already has existing tables/data before applying migrations
  let hasExistingData = false;
  try {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('facts', 'companion_devices', 'companion_captures')`
      )
      .all() as { name: string }[];
    if (tables.length > 0) {
      hasExistingData = true;
    }
  } catch {}

  let backupPath: string | null = null;
  if (hasExistingData && dbPath && dbPath !== ':memory:') {
    backupPath = backupDatabaseFile(dbPath, backupDir, db, 'pre-migration');
  }

  const appliedMigrations: string[] = [];
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      insertMigration.run(
        migration.version,
        migration.name,
        new Date().toISOString()
      );
      db.exec('COMMIT');
      appliedMigrations.push(migration.name);
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  return { appliedMigrations, backupPath };
}

/**
 * Non-destructively seeds demo facts ONLY when explicitly requested or when initializing
 * a genuinely brand-new database. NEVER deletes or overwrites existing user facts.
 */
export function seedDemoFactsNonDestructive(db: DatabaseSync): number {
  const existingCount = (
    db.prepare('SELECT count(*) as count FROM facts').get() as { count: number }
  ).count;

  const insertSeed = db.prepare(`
    INSERT INTO facts (
      brain, content, source, file_name, file_path, file_type, tags_json,
      is_document_root, is_unified_context_node, document_title, semantic_section_count,
      merge_history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkExisting = db.prepare(
    'SELECT id FROM facts WHERE brain = ? AND file_name = ? LIMIT 1'
  );

  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of INITIAL_SEED_FACTS) {
      if (existingCount > 0) {
        const found = checkExisting.get(item.brain, item.fileName || '');
        if (found) continue;
      }
      insertSeed.run(
        item.brain,
        item.content,
        item.source,
        item.fileName || null,
        (item as any).filePath || item.fileName || null,
        item.fileType || null,
        JSON.stringify(item.tags || []),
        (item as any).isDocumentRoot ? 1 : 0,
        (item as any).isUnifiedContextNode ? 1 : 0,
        (item as any).documentTitle || null,
        (item as any).semanticSectionCount || null,
        (item as any).mergeHistory
          ? JSON.stringify((item as any).mergeHistory)
          : null,
        item.created_at,
        item.updated_at
      );
      inserted++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return inserted;
}

export interface InitializeDatabaseOptions {
  dbPath?: string;
  backupDir?: string;
  /**
   * When true, seeds INITIAL_SEED_FACTS ONLY if the database is genuinely brand-new
   * (never initialized before and has 0 facts, 0 devices, and 0 captures).
   * Defaults to false for strict data safety unless BRAIN_SEED_DEMO=true.
   */
  seedOnBrandNewDb?: boolean;
  /**
   * Explicitly seed missing demo facts without deleting any existing facts.
   */
  forceSeedDemo?: boolean;
  forceDemoSeed?: boolean;
  /**
   * Optional custom migration list (used in automated tests to verify migration ordering and rollback).
   */
  customMigrations?: MigrationDefinition[];
}

export function initializeDatabase(
  dbPathOrOptions: string | InitializeDatabaseOptions = {},
  maybeOptions: InitializeDatabaseOptions = {}
): {
  db: DatabaseSync;
  dbPath: string;
  isBrandNew: boolean;
  isBrandNewDb: boolean;
  appliedMigrations: string[];
  backupPath: string | null;
  seededCount: number;
} {
  const options: InitializeDatabaseOptions =
    typeof dbPathOrOptions === 'string'
      ? { ...maybeOptions, dbPath: dbPathOrOptions }
      : dbPathOrOptions;

  const dbPath = options.dbPath || ':memory:';
  const fileExistedBefore =
    dbPath !== ':memory:' && fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;

  if (fileExistedBefore) {
    const headerCheck = hasValidSqliteHeader(dbPath);
    if (!headerCheck.valid) {
      throw new Error(
        `Malformed or corrupted SQLite database file at "${dbPath}": ${headerCheck.error}`
      );
    }
  }

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const resolvedBackupDir =
    options.backupDir ||
    (dbPath !== ':memory:'
      ? path.join(path.dirname(dbPath), 'backups')
      : path.join(process.cwd(), 'data', 'backups'));

  const db = new DatabaseSync(dbPath);
  (db as any).__brainDbPath = dbPath;
  (db as any).__brainBackupDir = resolvedBackupDir;

  try {
    if (dbPath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
    }
    db.exec('PRAGMA foreign_keys = ON');

    // Verify SQLite structural integrity before migrating or serving
    const integrityCheck = db
      .prepare('PRAGMA integrity_check')
      .get() as { integrity_check?: string } | undefined;
    if (
      !integrityCheck ||
      String(integrityCheck.integrity_check || '').toLowerCase() !== 'ok'
    ) {
      throw new Error(
        `Database integrity check failed on startup: ${
          integrityCheck?.integrity_check || 'corrupted database'
        }`
      );
    }

    // Check if facts table existed prior to running migrations
    const hadFactsTable = Boolean(
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='facts'`
        )
        .get()
    );

    const { appliedMigrations, backupPath } = runSchemaMigrations(
      db,
      dbPath,
      resolvedBackupDir,
      options.customMigrations
    );

    const initMeta = db
      .prepare(`SELECT value FROM app_metadata WHERE key = 'db_initialized'`)
      .get() as { value: string } | undefined;

    const factsCount = (
      db.prepare('SELECT count(*) as count FROM facts').get() as {
        count: number;
      }
    ).count;
    const devicesCount = (
      db.prepare('SELECT count(*) as count FROM companion_devices').get() as {
        count: number;
      }
    ).count;
    const capturesCount = (
      db.prepare('SELECT count(*) as count FROM companion_captures').get() as {
        count: number;
      }
    ).count;

    const isBrandNewDb =
      !fileExistedBefore &&
      !hadFactsTable &&
      !initMeta &&
      factsCount === 0 &&
      devicesCount === 0 &&
      capturesCount === 0;

    let seededCount = 0;
    if (options.forceSeedDemo || options.forceDemoSeed) {
      seededCount = seedDemoFactsNonDestructive(db);
    } else if (isBrandNewDb && options.seedOnBrandNewDb) {
      seededCount = seedDemoFactsNonDestructive(db);
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('db_initialized', '1', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at`
    ).run(now);

    return {
      db,
      dbPath,
      isBrandNew: isBrandNewDb,
      isBrandNewDb,
      appliedMigrations,
      backupPath,
      seededCount,
    };
  } catch (err) {
    try {
      db.close();
    } catch {}
    throw err;
  }
}

/**
 * Resolves the server bind host.
 * LAN and remote access are explicitly deferred in this phase; Argon binds strictly to 127.0.0.1.
 */
export function resolveBindHost(_env: NodeJS.ProcessEnv = process.env): string {
  return '127.0.0.1';
}

/**
 * Narrowly scoped local-development CORS origin validator.
 * Permits localhost, 127.0.0.1, Chromium/Firefox extension origins, and configured APP_URL / AI Studio preview.
 */
export function isAllowedCorsOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!origin) return true; // Same-origin or non-browser local request
  const trimmed = origin.trim();
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed) ||
    /^chrome-extension:\/\/[a-z0-9_-]+$/i.test(trimmed) ||
    /^moz-extension:\/\/[a-z0-9_-]+$/i.test(trimmed) ||
    /^https:\/\/[a-z0-9-]+\.run\.app$/i.test(trimmed)
  ) {
    return true;
  }
  if (env.APP_URL && trimmed === env.APP_URL.trim().replace(/\/$/, '')) {
    return true;
  }
  return false;
}

export function validateBrainName(raw: unknown): {
  valid: boolean;
  value: string;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return { valid: false, value: '', error: 'Brain name must be a string' };
  }
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) {
    return { valid: false, value: '', error: 'Brain name cannot be empty' };
  }
  if (cleaned.length > MAX_BRAIN_NAME_LENGTH) {
    return {
      valid: false,
      value: '',
      error: `Brain name exceeds maximum length of ${MAX_BRAIN_NAME_LENGTH} characters`,
    };
  }
  if (!/^[a-z0-9][a-z0-9 _-]*$/.test(cleaned) || cleaned.includes('..')) {
    return {
      valid: false,
      value: '',
      error:
        'Brain name may only contain lowercase letters, numbers, spaces, hyphens, and underscores',
    };
  }
  return { valid: true, value: cleaned };
}

export function validateAISource(raw: unknown): {
  valid: boolean;
  value: ValidAISource;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return {
      valid: false,
      value: 'claude',
      error: `Source must be one of: ${ALLOWED_AI_SOURCES.join(', ')}`,
    };
  }
  const cleaned = raw.trim().toLowerCase();
  if ((ALLOWED_AI_SOURCES as readonly string[]).includes(cleaned)) {
    return { valid: true, value: cleaned as ValidAISource };
  }
  return {
    valid: false,
    value: 'claude',
    error: `Invalid source "${raw}". Allowed sources: ${ALLOWED_AI_SOURCES.join(', ')}`,
  };
}

export function validateProvenanceUrl(raw: unknown): {
  valid: boolean;
  value: string | null;
  error?: string;
} {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { valid: false, value: null, error: 'provenanceUrl must be a string' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, value: null };
  if (trimmed.length > 2048) {
    return {
      valid: false,
      value: null,
      error: 'provenanceUrl exceeds maximum length of 2048 characters',
    };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        value: null,
        error: `Unsafe URL scheme "${parsed.protocol}" in provenanceUrl. Only http: and https: are allowed.`,
      };
    }
    return { valid: true, value: trimmed };
  } catch {
    return {
      valid: false,
      value: null,
      error: 'Malformed provenanceUrl: must be a valid http(s) URL',
    };
  }
}

export function validateSafeFilePath(
  raw: unknown,
  maxLength: number,
  fieldName: string
): { valid: boolean; value: string; error?: string } {
  if (typeof raw !== 'string') {
    return { valid: false, value: '', error: `${fieldName} must be a string` };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, value: '', error: `${fieldName} cannot be empty` };
  }
  if (trimmed.length > maxLength) {
    return {
      valid: false,
      value: '',
      error: `${fieldName} exceeds maximum length of ${maxLength} characters`,
    };
  }
  if (
    trimmed.includes('\0') ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(trimmed)
  ) {
    return {
      valid: false,
      value: '',
      error: `${fieldName} contains unsafe path traversal sequences`,
    };
  }
  return { valid: true, value: trimmed };
}

export function serializeFactRow(row: any) {
  if (!row) return null;
  let tags: string[] = [];
  let mergeHistory: any[] | undefined = undefined;
  let extractionWarnings: string[] | undefined = undefined;
  let relatedSources: string[] | undefined = undefined;
  let structuredData: any | undefined = undefined;

  try {
    if (row.tags_json) tags = JSON.parse(row.tags_json);
  } catch {}
  try {
    if (row.merge_history_json) mergeHistory = JSON.parse(row.merge_history_json);
  } catch {}
  try {
    if (row.extraction_warnings_json) {
      extractionWarnings = JSON.parse(row.extraction_warnings_json);
    }
  } catch {}
  try {
    if (row.related_sources_json) {
      relatedSources = JSON.parse(row.related_sources_json);
    }
  } catch {}
  try {
    if (row.structured_data_json) {
      structuredData = JSON.parse(row.structured_data_json);
    }
  } catch {}

  return {
    id: row.id,
    brain: row.brain,
    content: row.content,
    source: row.source,
    fileName: row.file_name || undefined,
    filePath: row.file_path || undefined,
    sourceFolder: row.source_folder || undefined,
    fileType: row.file_type || undefined,
    tags,
    parentId: row.parent_id || undefined,
    isDocumentRoot: Boolean(row.is_document_root),
    isUnifiedContextNode: Boolean(row.is_unified_context_node),
    documentTitle: row.document_title || undefined,
    semanticSectionCount: row.semantic_section_count || undefined,
    mergeHistory,
    originalCreatedAt:
      row.original_created_at !== undefined ? row.original_created_at : null,
    importedAt: row.imported_at || row.created_at,
    importBatchId: row.import_batch_id || undefined,
    checksum: row.checksum || undefined,
    extractionStatus: row.extraction_status || 'success',
    extractionWarnings,
    relatedSources,
    fixtureId: row.fixture_id || undefined,
    topicKey: row.topic_key || undefined,
    fileSizeBytes:
      typeof row.file_size_bytes === 'number'
        ? row.file_size_bytes
        : Buffer.byteLength(String(row.content || ''), 'utf8'),
    structuredData,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeCompanionCaptureRow(row: any) {
  if (!row) return null;
  let tags: string[] = [];
  let unreachableResources: { name: string; reason: string; kind?: string }[] = [];
  try {
    if (row.tags_json) tags = JSON.parse(row.tags_json);
  } catch {}
  try {
    if (row.unreachable_json) unreachableResources = JSON.parse(row.unreachable_json);
  } catch {}
  return {
    id: row.id,
    brain: row.brain,
    source: row.source,
    title: row.title,
    content: row.content,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type || 'md',
    projectName: row.project_name || undefined,
    provenanceUrl: row.provenance_url || undefined,
    resourceKind: row.resource_kind || 'document',
    tags,
    unreachableResources,
    created_at: row.created_at,
  };
}

export interface CreateBrainAppOptions {
  dbPath?: string;
  backupDir?: string;
}

function formatSafeDisplayPath(targetPath: string): string {
  if (!targetPath || targetPath === ':memory:') return ':memory:';
  const rel = path.relative(process.cwd(), targetPath).replace(/\\/g, '/');
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel;
  }
  return path.basename(targetPath);
}

/**
 * Creates the Express application wired to the provided SQLite DatabaseSync instance.
 */
export function createBrainApp(
  db: DatabaseSync,
  options: CreateBrainAppOptions = {}
) {
  const app = express();
  const resolvedDbPath: string =
    options.dbPath ||
    (db as any).__brainDbPath ||
    path.join(process.cwd(), 'data', 'brain.db');
  const resolvedBackupDir: string =
    options.backupDir ||
    (db as any).__brainBackupDir ||
    (resolvedDbPath !== ':memory:'
      ? path.join(path.dirname(resolvedDbPath), 'backups')
      : path.join(process.cwd(), 'data', 'backups'));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Narrowly scoped local-development CORS policy
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!isAllowedCorsOrigin(origin)) {
        return res.status(403).json({
          error: 'Origin is not permitted by Argon local security policy',
          code: 'CORS_ORIGIN_FORBIDDEN',
        });
      }
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    } else {
      res.header('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Brain-Local-Client, X-Brain-UI-Intent, X-Simulate-Failure'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Global Bearer token authentication check:
  // Whenever an Authorization header is sent to /api/*, verify it strictly.
  // Invalid or revoked tokens are immediately rejected with 401.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== undefined) {
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Malformed Authorization header. Expected Bearer <token>.',
          code: 'MALFORMED_AUTH_HEADER',
        });
      }
      const rawToken = authHeader.slice(7).trim();
      const verifiedDevice = verifyCompanionToken(db, rawToken);
      if (!verifiedDevice) {
        return res.status(401).json({
          error: 'Invalid or revoked companion device token.',
          code: 'INVALID_OR_REVOKED_TOKEN',
        });
      }
      (req as any).companionDevice = verifiedDevice;
    }
    next();
  });

  /**
   * Middleware that protects Companion endpoints (`/api/companion/*`).
   * Requires either:
   * 1. A verified non-revoked Companion Device Bearer token (`req.companionDevice`), OR
   * 2. An explicit local Capture Hub UI client request (`X-Brain-Local-Client: argon-capture-hub`)
   *    originating from a non-extension local/same-origin context.
   */
  function requireCompanionAuth(options?: {
    requireLocalEnrollmentIntent?: boolean;
    requiredUiIntent?: string;
  }) {
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin || '';
      const isExtensionOrigin =
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://');
      const localClientHeader = req.headers['x-brain-local-client'];
      const uiIntentHeader = req.headers['x-brain-ui-intent'];
      const verifiedDevice = (req as any).companionDevice;

      if (options?.requireLocalEnrollmentIntent) {
        if (
          isExtensionOrigin ||
          localClientHeader !== 'argon-capture-hub' ||
          uiIntentHeader !== 'enroll-device'
        ) {
          return res.status(401).json({
            error:
              'Device token enrollment requires an intentional local user action inside Capture Hub.',
            code: 'ENROLLMENT_INTENT_REQUIRED',
          });
        }
        return next();
      }

      if (verifiedDevice) {
        return next();
      }

      if (
        !isExtensionOrigin &&
        localClientHeader === 'argon-capture-hub' &&
        (!options?.requiredUiIntent || uiIntentHeader === options.requiredUiIntent)
      ) {
        return next();
      }

      return res.status(401).json({
        error:
          'Authentication required. Configure a valid Companion Device Token in the extension popup or perform this action from Capture Hub.',
        code: 'COMPANION_AUTH_REQUIRED',
      });
    };
  }

  function getBrainList(): string[] {
    const rows = db
      .prepare('SELECT DISTINCT brain FROM facts ORDER BY brain')
      .all() as { brain: string }[];
    const found = rows.map((r) => r.brain);
    const defaults = ['coding', 'college', 'personal'];
    return Array.from(new Set([...defaults, ...found]));
  }

  function getConfiguredRetentionCount(): number {
    try {
      const row = db
        .prepare(
          `SELECT value FROM app_metadata WHERE key = 'backup_retention_count'`
        )
        .get() as { value: string } | undefined;
      if (row && row.value) {
        const parsed = Number.parseInt(row.value, 10);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) {
          return parsed;
        }
      }
    } catch {}
    return 10;
  }

  function setConfiguredRetentionCount(maxBackups: number): number {
    const clamped = Math.max(1, Math.min(100, Math.floor(maxBackups)));
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('backup_retention_count', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(String(clamped), now);
    return clamped;
  }

  function buildDatabaseStatusPayload() {
    const factsCount = (
      db.prepare('SELECT count(*) as count FROM facts').get() as { count: number }
    ).count;
    const activeDevicesCount = (
      db
        .prepare(
          'SELECT count(*) as count FROM companion_devices WHERE revoked_at IS NULL'
        )
        .get() as { count: number }
    ).count;
    const capturesCount = (
      db.prepare('SELECT count(*) as count FROM companion_captures').get() as {
        count: number;
      }
    ).count;
    const migrations = db
      .prepare(
        'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
      )
      .all() as Array<{ version: number; name: string; applied_at: string }>;
    const schemaVersion =
      migrations.length > 0 ? migrations[migrations.length - 1].version : 0;

    let journalMode = 'memory';
    try {
      const jmRow = db.prepare('PRAGMA journal_mode').get() as
        | { journal_mode?: string }
        | undefined;
      if (jmRow?.journal_mode) {
        journalMode = String(jmRow.journal_mode).toLowerCase();
      }
    } catch {}

    let integrityStatus = 'ok';
    try {
      const icRow = db.prepare('PRAGMA quick_check').get() as
        | { quick_check?: string }
        | undefined;
      if (icRow?.quick_check) {
        integrityStatus = String(icRow.quick_check).toLowerCase();
      }
    } catch {
      integrityStatus = 'error';
    }

    let dbSizeBytes = 0;
    if (resolvedDbPath !== ':memory:' && fs.existsSync(resolvedDbPath)) {
      try {
        dbSizeBytes = fs.statSync(resolvedDbPath).size;
      } catch {}
    }

    const maxBackups = getConfiguredRetentionCount();
    const backups = listBackups(resolvedBackupDir).map((b) => ({
      ...b,
      backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${b.fileName}`,
    }));
    const verifiedBackups = backups.filter((b) => b.verified);
    const invalidBackups = backups.filter((b) => !b.verified);

    const brainCountsRows = db
      .prepare('SELECT brain, count(*) as count FROM facts GROUP BY brain')
      .all() as Array<{ brain: string; count: number }>;
    const brainCounts: Record<string, number> = {};
    for (const r of brainCountsRows) {
      brainCounts[r.brain] = Number(r.count || 0);
    }

    return {
      status: integrityStatus === 'ok' ? 'healthy' : 'degraded',
      engine: 'SQLite (node:sqlite)',
      journalMode,
      integrityStatus,
      schemaVersion,
      appliedMigrations: migrations,
      dbLocation: formatSafeDisplayPath(resolvedDbPath),
      backupLocation: `${formatSafeDisplayPath(resolvedBackupDir)}/`,
      dbSizeBytes,
      factsCount,
      brainsCount: getBrainList().length,
      brains: getBrainList(),
      brainCounts,
      devicesCount: activeDevicesCount,
      capturesCount,
      retention: {
        maxBackups,
      },
      backupsSummary: {
        totalBackups: backups.length,
        verifiedBackups: verifiedBackups.length,
        invalidBackups: invalidBackups.length,
        latestBackupAt: verifiedBackups[0]?.createdAt || null,
        latestBackupFileName: verifiedBackups[0]?.fileName || null,
      },
      backups,
    };
  }

  // 1. Status API
  app.get('/api/status', (_req: Request, res: Response) => {
    const count = (
      db.prepare('SELECT count(*) as count FROM facts').get() as { count: number }
    ).count;
    const activeDevicesCount = (
      db
        .prepare(
          'SELECT count(*) as count FROM companion_devices WHERE revoked_at IS NULL'
        )
        .get() as { count: number }
    ).count;
    res.json({
      status: 'online',
      time: new Date().toISOString(),
      database: 'sqlite-embedded',
      factsCount: count,
      brains: getBrainList(),
      companionDevicesCount: activeDevicesCount,
      geminiLiveTest: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 1a. Database & Backup Settings APIs
  app.get('/api/database/status', (_req: Request, res: Response) => {
    try {
      res.json(buildDatabaseStatusPayload());
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to read database status',
        code: 'DATABASE_STATUS_FAILED',
      });
    }
  });

  app.get('/api/database/backups', (_req: Request, res: Response) => {
    try {
      const maxBackups = getConfiguredRetentionCount();
      const backups = listBackups(resolvedBackupDir).map((b) => ({
        ...b,
        backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${b.fileName}`,
      }));
      res.json({
        backups,
        backupLocation: `${formatSafeDisplayPath(resolvedBackupDir)}/`,
        retention: { maxBackups },
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to list database backups',
        code: 'BACKUP_LIST_FAILED',
      });
    }
  });

  app.post('/api/database/backups', (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      if (req.headers['x-simulate-failure'] === 'true') {
        recordSystemAuditLog(db, {
          category: 'error',
          status: 'error',
          durationMs: Date.now() - startedAt,
          summary: 'Simulated backup creation failure',
          errorCategory: 'BACKUP_FAILED',
          recoveryAction: 'Retry backup creation when disk is writable',
        });
        return res.status(500).json({
          error: 'Simulated backup creation failure',
          code: 'BACKUP_FAILED',
        });
      }
      const maxBackups = getConfiguredRetentionCount();
      const created = createConsistentBackup(db, resolvedDbPath, {
        backupDir: resolvedBackupDir,
        kind: 'manual',
      });
      const retentionResult = applyBackupRetention(
        resolvedBackupDir,
        maxBackups
      );
      const backups = listBackups(resolvedBackupDir).map((b) => ({
        ...b,
        backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${b.fileName}`,
      }));

      recordSystemAuditLog(db, {
        category: 'backup_created',
        status: 'success',
        durationMs: Date.now() - startedAt,
        fileName: created.fileName,
        batchOrBackupId: created.fileName,
        summary: `Created verified SQLite backup ${created.fileName} (${created.factsCount} memories, schema v${created.schemaVersion})`,
        details: {
          fileName: created.fileName,
          sizeBytes: created.sizeBytes,
          factsCount: created.factsCount,
          schemaVersion: created.schemaVersion,
          integrityStatus: created.integrityStatus,
          retentionDeleted: retentionResult.deletedFiles,
        },
      });

      res.status(201).json({
        success: true,
        backup: {
          ...created,
          backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${created.fileName}`,
        },
        retentionResult,
        backups,
      });
    } catch (err: any) {
      recordSystemAuditLog(db, {
        category: 'error',
        status: 'error',
        durationMs: Date.now() - startedAt,
        summary: `Backup creation failed: ${err?.message || 'Unknown error'}`,
        errorCategory: 'BACKUP_FAILED',
        recoveryAction: 'Verify disk space and database integrity',
      });
      res.status(500).json({
        error: err?.message || 'Failed to create consistent SQLite backup',
        code: 'BACKUP_FAILED',
      });
    }
  });

  app.get(
    '/api/database/backups/:fileName/download',
    (req: Request, res: Response) => {
      const rawName = String(req.params.fileName || '').trim();
      if (
        !rawName ||
        !/^[a-zA-Z0-9_.-]+\.db$/.test(rawName) ||
        rawName.includes('..') ||
        rawName.endsWith('.tmp')
      ) {
        return res.status(400).json({
          error: 'Invalid backup file name',
          code: 'INVALID_BACKUP_FILENAME',
        });
      }

      const targetPath = path.join(resolvedBackupDir, rawName);
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({
          error: 'Backup file not found',
          code: 'BACKUP_NOT_FOUND',
        });
      }

      const verification = verifyDatabaseFileIntegrity(targetPath, {
        requireCoreTables: false,
      });
      if (!verification.valid) {
        return res.status(400).json({
          error: `Backup file failed integrity verification and cannot be exported: ${
            verification.error || verification.integrityStatus
          }`,
          code: 'BACKUP_CORRUPTED',
        });
      }

      recordSystemAuditLog(db, {
        category: 'backup_exported',
        status: 'success',
        fileName: rawName,
        batchOrBackupId: rawName,
        summary: `Exported verified SQLite backup ${rawName} (${verification.sizeBytes} bytes, ${verification.factsCount} memories)`,
        details: {
          fileName: rawName,
          sizeBytes: verification.sizeBytes,
          factsCount: verification.factsCount,
          schemaVersion: verification.schemaVersion,
        },
      });

      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${rawName}"`
      );
      res.setHeader('Content-Length', String(verification.sizeBytes));
      res.setHeader('X-Sqlite-Verified', 'true');
      res.setHeader('X-Sqlite-Facts-Count', String(verification.factsCount));
      const stream = fs.createReadStream(targetPath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream backup file' });
        }
      });
      stream.pipe(res);
    }
  );

  // Delete an individual backup (protects the last known-good verified backup)
  app.delete(
    '/api/database/backups/:fileName',
    (req: Request, res: Response) => {
      const rawName = String(req.params.fileName || '').trim();
      if (
        !rawName ||
        !/^[a-zA-Z0-9_.-]+\.db$/.test(rawName) ||
        rawName.includes('..') ||
        rawName.endsWith('.tmp')
      ) {
        return res.status(400).json({
          error: 'Invalid backup file name',
          code: 'INVALID_BACKUP_FILENAME',
        });
      }

      const targetPath = path.join(resolvedBackupDir, rawName);
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({
          error: `Backup "${rawName}" not found`,
          code: 'BACKUP_NOT_FOUND',
        });
      }

      const allBackups = listBackups(resolvedBackupDir);
      const targetMeta = allBackups.find((b) => b.fileName === rawName);
      const verifiedBackups = allBackups.filter((b) => b.verified);

      // Protect the last known-good verified backup from accidental deletion
      if (
        targetMeta?.verified &&
        verifiedBackups.length <= 1 &&
        verifiedBackups[0]?.fileName === rawName
      ) {
        return res.status(400).json({
          error:
            'Cannot delete the only remaining verified backup (last known-good backup is protected). Create another verified backup first.',
          code: 'LAST_KNOWN_GOOD_PROTECTED',
        });
      }

      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        for (const suffix of ['.meta.json', '-wal', '-shm']) {
          const sidePath = `${targetPath}${suffix}`;
          if (fs.existsSync(sidePath)) {
            fs.unlinkSync(sidePath);
          }
        }

        recordSystemAuditLog(db, {
          category: 'backup_deleted',
          status: 'success',
          fileName: rawName,
          batchOrBackupId: rawName,
          summary: `Deleted ${
            targetMeta?.verified ? 'verified' : 'invalid/unverified'
          } backup ${rawName}`,
          details: {
            fileName: rawName,
            wasVerified: Boolean(targetMeta?.verified),
            sizeBytes: targetMeta?.sizeBytes || 0,
          },
        });

        res.json({
          success: true,
          deletedFileName: rawName,
          status: buildDatabaseStatusPayload(),
        });
      } catch (err: any) {
        res.status(500).json({
          error: err?.message || 'Failed to delete backup file',
          code: 'BACKUP_DELETE_FAILED',
        });
      }
    }
  );

  // Delete all invalid / unverified backups in one action
  app.post(
    '/api/database/backups/cleanup-invalid',
    (_req: Request, res: Response) => {
      try {
        const tempRemoved = cleanupIncompleteBackups(resolvedBackupDir);
        const allBackups = listBackups(resolvedBackupDir);
        const invalidBackups = allBackups.filter((b) => !b.verified);
        const deletedFiles: string[] = [...tempRemoved];

        for (const inv of invalidBackups) {
          try {
            if (fs.existsSync(inv.backupPath)) {
              fs.unlinkSync(inv.backupPath);
            }
            for (const suffix of ['.meta.json', '-wal', '-shm']) {
              const sidePath = `${inv.backupPath}${suffix}`;
              if (fs.existsSync(sidePath)) {
                fs.unlinkSync(sidePath);
              }
            }
            deletedFiles.push(inv.fileName);
          } catch {}
        }

        recordSystemAuditLog(db, {
          category: 'backup_deleted',
          status: 'success',
          summary: `Cleaned up ${deletedFiles.length} invalid or incomplete backup file(s)`,
          details: {
            deletedCount: deletedFiles.length,
            deletedFiles,
          },
        });

        res.json({
          success: true,
          deletedCount: deletedFiles.length,
          deletedFiles,
          status: buildDatabaseStatusPayload(),
        });
      } catch (err: any) {
        res.status(500).json({
          error: err?.message || 'Failed to clean up invalid backups',
          code: 'CLEANUP_INVALID_FAILED',
        });
      }
    }
  );

  // Inspect an external .db file selected by the user before restoring or verifying
  app.post(
    '/api/database/backups/inspect-external',
    (req: Request, res: Response) => {
      const rawFileName =
        typeof req.body?.fileName === 'string'
          ? req.body.fileName.trim()
          : 'external_backup.db';
      const base64Data =
        typeof req.body?.base64Data === 'string'
          ? req.body.base64Data.trim()
          : '';

      if (!base64Data) {
        return res.status(400).json({
          valid: false,
          error: 'No file content provided (base64Data is empty).',
          code: 'EMPTY_EXTERNAL_FILE',
        });
      }

      let buf: Buffer;
      try {
        const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        buf = Buffer.from(cleanB64, 'base64');
      } catch {
        return res.status(400).json({
          valid: false,
          error: 'Malformed base64 payload.',
          code: 'MALFORMED_BASE64',
        });
      }

      if (buf.length === 0) {
        return res.status(400).json({
          valid: false,
          error: 'Selected file is empty (0 bytes).',
          code: 'EMPTY_EXTERNAL_FILE',
        });
      }

      const asciiPreview = buf
        .subarray(0, Math.min(buf.length, 256))
        .toString('utf8')
        .trim();
      if (
        /^<!doctype\s+html/i.test(asciiPreview) ||
        /^<html/i.test(asciiPreview) ||
        asciiPreview.includes('<script') ||
        asciiPreview.includes('Cookie check')
      ) {
        return res.status(400).json({
          valid: false,
          isHtmlResponse: true,
          sizeBytes: buf.length,
          error:
            'Rejected: Selected file is an HTML document (e.g. a browser proxy or cookie-check page), NOT a valid SQLite 3 binary database.',
          code: 'HTML_NOT_SQLITE',
        });
      }

      if (
        buf.length < 16 ||
        buf.subarray(0, 16).toString('utf8') !== SQLITE_MAGIC_HEADER
      ) {
        return res.status(400).json({
          valid: false,
          sizeBytes: buf.length,
          error:
            'Rejected: File does not start with the 16-byte "SQLite format 3\\0" header.',
          code: 'INVALID_SQLITE_HEADER',
        });
      }

      if (!fs.existsSync(resolvedBackupDir)) {
        fs.mkdirSync(resolvedBackupDir, { recursive: true });
      }
      const tempInspectPath = path.join(
        resolvedBackupDir,
        `.staging_inspect_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.db.tmp`
      );

      try {
        fs.writeFileSync(tempInspectPath, buf);
        const verification = verifyDatabaseFileIntegrity(tempInspectPath, {
          requireCoreTables: false,
        });

        if (!verification.valid) {
          return res.status(400).json({
            valid: false,
            sizeBytes: buf.length,
            integrityStatus: verification.integrityStatus,
            error:
              verification.error ||
              `SQLite PRAGMA integrity_check failed: ${verification.integrityStatus}`,
            code: 'INTEGRITY_CHECK_FAILED',
          });
        }

        if (!verification.tables.includes('facts')) {
          return res.status(400).json({
            valid: false,
            sizeBytes: buf.length,
            integrityStatus: 'missing_facts_table',
            tables: verification.tables,
            error:
              'Rejected: Valid SQLite file, but it does not contain an Argon "facts" table.',
            code: 'MISSING_FACTS_TABLE',
          });
        }

        // Read workspace breakdown from the external backup
        let brainBreakdown: Record<string, number> = {};
        let sourceBreakdown: Record<string, number> = {};
        let inspectDb: DatabaseSync | null = null;
        try {
          inspectDb = new DatabaseSync(tempInspectPath);
          const brainRows = inspectDb
            .prepare('SELECT brain, count(*) as count FROM facts GROUP BY brain')
            .all() as Array<{ brain: string; count: number }>;
          for (const r of brainRows) {
            brainBreakdown[r.brain] = Number(r.count || 0);
          }
          const srcRows = inspectDb
            .prepare('SELECT source, count(*) as count FROM facts GROUP BY source')
            .all() as Array<{ source: string; count: number }>;
          for (const r of srcRows) {
            sourceBreakdown[r.source] = Number(r.count || 0);
          }
        } finally {
          if (inspectDb) {
            try {
              inspectDb.close();
            } catch {}
          }
        }

        const liveFactsCount = (
          db.prepare('SELECT count(*) as count FROM facts').get() as {
            count: number;
          }
        ).count;

        recordSystemAuditLog(db, {
          category: 'integrity_check',
          status: 'success',
          fileName: rawFileName,
          summary: `Verified external SQLite backup "${rawFileName}" (${verification.factsCount} memories, schema v${verification.schemaVersion}, integrity: ok)`,
          details: {
            fileName: rawFileName,
            sizeBytes: buf.length,
            factsCount: verification.factsCount,
            schemaVersion: verification.schemaVersion,
            brainBreakdown,
          },
        });

        return res.json({
          valid: true,
          fileName: rawFileName,
          sizeBytes: buf.length,
          sqliteHeaderValid: true,
          integrityStatus: verification.integrityStatus,
          schemaVersion: verification.schemaVersion,
          factsCount: verification.factsCount,
          tables: verification.tables,
          brainBreakdown,
          sourceBreakdown,
          liveFactsCount,
          willOverwriteLiveData: liveFactsCount > 0,
        });
      } finally {
        for (const suffix of ['', '-wal', '-shm']) {
          const p = `${tempInspectPath}${suffix}`;
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch {}
          }
        }
      }
    }
  );

  // Restore from an external .db file uploaded by the user (supports both existing and fresh installations)
  app.post(
    '/api/database/restore-external',
    (req: Request, res: Response) => {
      const startedAt = Date.now();
      const rawFileName =
        typeof req.body?.fileName === 'string' && req.body.fileName.trim()
          ? path.basename(req.body.fileName.trim())
          : 'external_backup.db';
      const base64Data =
        typeof req.body?.base64Data === 'string'
          ? req.body.base64Data.trim()
          : '';
      const confirm = req.body?.confirm === true;

      if (!confirm) {
        return res.status(400).json({
          error:
            'Explicit confirmation (confirm: true) is required before restoring an external database backup.',
          code: 'RESTORE_CONFIRMATION_REQUIRED',
        });
      }

      if (!base64Data) {
        return res.status(400).json({
          error: 'No external backup file payload provided.',
          code: 'EMPTY_EXTERNAL_FILE',
        });
      }

      let buf: Buffer;
      try {
        const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        buf = Buffer.from(cleanB64, 'base64');
      } catch {
        return res.status(400).json({
          error: 'Malformed base64 backup payload.',
          code: 'MALFORMED_BASE64',
        });
      }

      const asciiPreview = buf
        .subarray(0, Math.min(buf.length, 256))
        .toString('utf8')
        .trim();
      if (
        /^<!doctype\s+html/i.test(asciiPreview) ||
        /^<html/i.test(asciiPreview) ||
        asciiPreview.includes('Cookie check')
      ) {
        recordSystemAuditLog(db, {
          category: 'restore_failed',
          status: 'error',
          fileName: rawFileName,
          summary: `Rejected external restore of "${rawFileName}": file is an HTML document, not a SQLite database`,
          errorCategory: 'HTML_NOT_SQLITE',
          recoveryAction: 'Select a valid .db SQLite backup file',
        });
        return res.status(400).json({
          error:
            'Cannot restore: Selected file is an HTML document, not a SQLite 3 database.',
          code: 'HTML_NOT_SQLITE',
        });
      }

      if (
        buf.length < 16 ||
        buf.subarray(0, 16).toString('utf8') !== SQLITE_MAGIC_HEADER
      ) {
        recordSystemAuditLog(db, {
          category: 'restore_failed',
          status: 'error',
          fileName: rawFileName,
          summary: `Rejected external restore of "${rawFileName}": invalid SQLite 16-byte header`,
          errorCategory: 'INVALID_SQLITE_HEADER',
          recoveryAction: 'Select a valid .db SQLite backup file',
        });
        return res.status(400).json({
          error:
            'Cannot restore: File does not have a valid 16-byte SQLite 3 header.',
          code: 'INVALID_SQLITE_HEADER',
        });
      }

      if (!fs.existsSync(resolvedBackupDir)) {
        fs.mkdirSync(resolvedBackupDir, { recursive: true });
      }

      const { fileName: importedBackupFileName, backupPath: importedBackupPath } =
        allocateUniqueBackupFilePath(resolvedBackupDir);

      try {
        recordSystemAuditLog(db, {
          category: 'restore_started',
          status: 'info',
          fileName: rawFileName,
          batchOrBackupId: importedBackupFileName,
          summary: `Started staged restore from external backup "${rawFileName}"`,
        });

        fs.writeFileSync(importedBackupPath, buf);

        const simulateApplyFailure =
          req.headers['x-simulate-failure'] === 'true' ||
          req.body?.simulateApplyFailure === true;

        const result = restoreDatabaseFromBackup({
          db,
          dbPath: resolvedDbPath,
          backupPath: importedBackupPath,
          backupDir: resolvedBackupDir,
          simulateApplyFailure,
        });

        // Write metadata sidecar for the imported external backup so it is retained as a verified backup
        const metaPath = `${importedBackupPath}.meta.json`;
        fs.writeFileSync(
          metaPath,
          JSON.stringify(
            {
              fileName: importedBackupFileName,
              originalExternalFileName: rawFileName,
              createdAt: new Date().toISOString(),
              sizeBytes: buf.length,
              verified: true,
              integrityStatus: 'ok',
              schemaVersion: result.schemaVersionAfterRestore,
              factsCount: result.factsCountAfterRestore,
              kind: 'manual',
            },
            null,
            2
          ),
          'utf8'
        );

        recordSystemAuditLog(db, {
          category: 'restore_completed',
          status: 'success',
          durationMs: Date.now() - startedAt,
          fileName: rawFileName,
          batchOrBackupId: importedBackupFileName,
          summary: `Completed external restore from "${rawFileName}" (${result.factsCountAfterRestore} memories active; safety backup: ${result.safetyBackup.fileName})`,
          details: {
            externalFileName: rawFileName,
            storedBackupFileName: importedBackupFileName,
            safetyBackupFileName: result.safetyBackup.fileName,
            factsCountAfterRestore: result.factsCountAfterRestore,
            schemaVersionAfterRestore: result.schemaVersionAfterRestore,
          },
        });

        return res.json({
          success: true,
          message: `Successfully restored ${result.factsCountAfterRestore} memories from external backup "${rawFileName}". Pre-restore safety snapshot saved as ${result.safetyBackup.fileName}.`,
          restoredFrom: {
            ...result.restoredFrom,
            fileName: importedBackupFileName,
            backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${importedBackupFileName}`,
          },
          safetyBackup: {
            ...result.safetyBackup,
            backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${
              result.safetyBackup.fileName
            }`,
          },
          status: buildDatabaseStatusPayload(),
        });
      } catch (err: any) {
        // Remove the uploaded candidate file if it was invalid and prevented restore
        if (fs.existsSync(importedBackupPath)) {
          try {
            fs.unlinkSync(importedBackupPath);
          } catch {}
        }
        const isRolledBack = Boolean(err?.rolledBack);
        recordSystemAuditLog(db, {
          category: 'restore_failed',
          status: 'error',
          durationMs: Date.now() - startedAt,
          fileName: rawFileName,
          summary: `External restore failed for "${rawFileName}": ${
            err?.message || 'Unknown error'
          }`,
          errorCategory: isRolledBack
            ? 'RESTORE_ROLLED_BACK'
            : 'RESTORE_REJECTED',
          recoveryAction: isRolledBack
            ? `Database was automatically rolled back to safety backup ${err?.safetyBackup?.fileName}`
            : 'Existing database was not modified',
        });

        const statusCode = isRolledBack ? 500 : 400;
        return res.status(statusCode).json({
          error: err?.message || 'External database restore failed',
          code: isRolledBack ? 'RESTORE_ROLLED_BACK' : 'RESTORE_REJECTED',
          rolledBack: isRolledBack,
          safetyBackupFileName: err?.safetyBackup?.fileName || null,
        });
      }
    }
  );

  app.post('/api/database/restore', (req: Request, res: Response) => {
    const startedAt = Date.now();
    const rawName =
      typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
    const confirm = req.body?.confirm === true;

    if (!confirm) {
      return res.status(400).json({
        error:
          'Explicit confirmation (confirm: true) is required before restoring a database backup.',
        code: 'RESTORE_CONFIRMATION_REQUIRED',
      });
    }

    if (
      !rawName ||
      !/^[a-zA-Z0-9_.-]+\.db$/.test(rawName) ||
      rawName.includes('..') ||
      rawName.endsWith('.tmp')
    ) {
      return res.status(400).json({
        error: 'Invalid backup file name',
        code: 'INVALID_BACKUP_FILENAME',
      });
    }

    const candidatePath = path.join(resolvedBackupDir, rawName);
    if (!fs.existsSync(candidatePath)) {
      return res.status(404).json({
        error: `Backup "${rawName}" does not exist in ${formatSafeDisplayPath(
          resolvedBackupDir
        )}/`,
        code: 'BACKUP_NOT_FOUND',
      });
    }

    try {
      recordSystemAuditLog(db, {
        category: 'restore_started',
        status: 'info',
        fileName: rawName,
        batchOrBackupId: rawName,
        summary: `Started staged restore from backup ${rawName}`,
      });

      const simulateApplyFailure =
        req.headers['x-simulate-failure'] === 'true' ||
        req.body?.simulateApplyFailure === true;
      const result = restoreDatabaseFromBackup({
        db,
        dbPath: resolvedDbPath,
        backupPath: candidatePath,
        backupDir: resolvedBackupDir,
        simulateApplyFailure,
      });

      recordSystemAuditLog(db, {
        category: 'restore_completed',
        status: 'success',
        durationMs: Date.now() - startedAt,
        fileName: rawName,
        batchOrBackupId: rawName,
        summary: `Restored database from ${result.restoredFrom.fileName} (${result.factsCountAfterRestore} memories; safety backup: ${result.safetyBackup.fileName})`,
        details: {
          restoredFrom: result.restoredFrom.fileName,
          safetyBackup: result.safetyBackup.fileName,
          factsCountAfterRestore: result.factsCountAfterRestore,
          schemaVersionAfterRestore: result.schemaVersionAfterRestore,
        },
      });

      res.json({
        success: true,
        message: `Restored database from ${result.restoredFrom.fileName}. A pre-restore safety backup was saved as ${result.safetyBackup.fileName}.`,
        restoredFrom: {
          ...result.restoredFrom,
          backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${
            result.restoredFrom.fileName
          }`,
        },
        safetyBackup: {
          ...result.safetyBackup,
          backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${
            result.safetyBackup.fileName
          }`,
        },
        status: buildDatabaseStatusPayload(),
      });
    } catch (err: any) {
      const isRolledBack = Boolean(err?.rolledBack);
      recordSystemAuditLog(db, {
        category: 'restore_failed',
        status: 'error',
        durationMs: Date.now() - startedAt,
        fileName: rawName,
        batchOrBackupId: rawName,
        summary: `Restore from ${rawName} failed: ${err?.message || 'Unknown error'}`,
        errorCategory: isRolledBack ? 'RESTORE_ROLLED_BACK' : 'RESTORE_REJECTED',
        recoveryAction: isRolledBack
          ? `Rolled back automatically to ${err?.safetyBackup?.fileName}`
          : 'Live database was not modified',
      });
      const statusCode = isRolledBack ? 500 : 400;
      res.status(statusCode).json({
        error: err?.message || 'Database restore failed',
        code: isRolledBack ? 'RESTORE_ROLLED_BACK' : 'RESTORE_REJECTED',
        rolledBack: isRolledBack,
        safetyBackupFileName: err?.safetyBackup?.fileName || null,
      });
    }
  });

  app.post('/api/database/retention', (req: Request, res: Response) => {
    const rawMax = Number(req.body?.maxBackups);
    if (!Number.isInteger(rawMax) || rawMax < 1 || rawMax > 100) {
      return res.status(400).json({
        error: 'Retention count (maxBackups) must be a whole number between 1 and 100.',
        code: 'INVALID_RETENTION_COUNT',
      });
    }

    try {
      const savedMax = setConfiguredRetentionCount(rawMax);
      const retentionResult = applyBackupRetention(resolvedBackupDir, savedMax);
      const backups = listBackups(resolvedBackupDir).map((b) => ({
        ...b,
        backupPath: `${formatSafeDisplayPath(resolvedBackupDir)}/${b.fileName}`,
      }));

      res.json({
        success: true,
        maxBackups: savedMax,
        retentionResult,
        backups,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to apply backup retention policy',
        code: 'RETENTION_FAILED',
      });
    }
  });

  // 1d. Activity Log & Diagnostics APIs (Section 8)
  function queryActivityLogs(
    query: Record<string, any>,
    options: { unpaginated?: boolean } = {}
  ) {
    const brain =
      typeof query.brain === 'string' && query.brain !== 'all'
        ? query.brain.trim()
        : '';
    const category =
      typeof query.category === 'string' && query.category !== 'all'
        ? query.category.trim()
        : '';
    const source =
      typeof query.source === 'string' && query.source !== 'all'
        ? query.source.trim()
        : '';
    const status =
      typeof query.status === 'string' && query.status !== 'all'
        ? query.status.trim()
        : '';
    const search =
      typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
    const startDate =
      typeof query.startDate === 'string'
        ? query.startDate.trim()
        : typeof query.fromDate === 'string'
        ? query.fromDate.trim()
        : '';
    const endDate =
      typeof query.endDate === 'string'
        ? query.endDate.trim()
        : typeof query.toDate === 'string'
        ? query.toDate.trim()
        : '';
    const sort = typeof query.sort === 'string' ? query.sort.trim() : 'newest';

    const rawPageSize = parseInt(
      String(query.pageSize || query.limit || '50'),
      10
    );
    const pageSize = Math.min(
      2000,
      Math.max(1, Number.isFinite(rawPageSize) ? rawPageSize : 50)
    );
    const rawPage = parseInt(String(query.page || '1'), 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const rawOffset =
      query.offset !== undefined ? parseInt(String(query.offset), 10) : NaN;
    const offset = Number.isFinite(rawOffset)
      ? Math.max(0, rawOffset)
      : (page - 1) * pageSize;

    const clauses: string[] = [];
    const params: any[] = [];

    if (brain) {
      clauses.push('(brain = ? OR brain IS NULL)');
      params.push(brain);
    }
    if (category) {
      clauses.push('category = ?');
      params.push(category);
    }
    if (source) {
      clauses.push('source = ?');
      params.push(source);
    }
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (startDate) {
      clauses.push('timestamp >= ?');
      params.push(startDate);
    }
    if (endDate) {
      clauses.push('timestamp <= ?');
      params.push(
        endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`
      );
    }
    if (search) {
      clauses.push(
        "(LOWER(summary) LIKE ? OR LOWER(COALESCE(file_name, '')) LIKE ? OR LOWER(COALESCE(category, '')) LIKE ? OR LOWER(COALESCE(batch_or_backup_id, '')) LIKE ? OR CAST(COALESCE(record_id, '') AS TEXT) LIKE ?)"
      );
      const pat = `%${search}%`;
      params.push(pat, pat, pat, pat, pat);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderSql =
      sort === 'oldest' || sort === 'asc'
        ? 'ORDER BY timestamp ASC, id ASC'
        : sort === 'category'
        ? 'ORDER BY category ASC, timestamp DESC, id DESC'
        : sort === 'status'
        ? 'ORDER BY status ASC, timestamp DESC, id DESC'
        : 'ORDER BY timestamp DESC, id DESC';

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM activity_logs ${whereSql}`)
      .get(...params) as { total: number } | undefined;
    const total = Number(countRow?.total || 0);

    const rows = (
      options.unpaginated
        ? db
            .prepare(`SELECT * FROM activity_logs ${whereSql} ${orderSql}`)
            .all(...params)
        : db
            .prepare(
              `SELECT * FROM activity_logs ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
            )
            .all(...params, pageSize, offset)
    ) as any[];

    const logs = rows.map((r) => {
      let details: any = undefined;
      try {
        if (r.details_json) details = redactSecrets(JSON.parse(r.details_json));
      } catch {}
      return {
        id: r.id,
        operationId: r.operation_id,
        timestamp: r.timestamp,
        category: r.category,
        status: r.status,
        durationMs: r.duration_ms ?? undefined,
        brain: r.brain || undefined,
        source: r.source || undefined,
        recordId: r.record_id ?? undefined,
        fileName: r.file_name || undefined,
        batchOrBackupId: r.batch_or_backup_id || undefined,
        summary: redactSecrets(r.summary),
        details,
        errorCategory: r.error_category || undefined,
        recoveryAction: r.recovery_action || undefined,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasMore = offset + logs.length < total;

    return {
      logs,
      total,
      page,
      pageSize,
      offset,
      totalPages,
      hasMore,
    };
  }

  app.get('/api/activity-logs', (req: Request, res: Response) => {
    try {
      const result = queryActivityLogs(req.query);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to query activity logs',
      });
    }
  });

  app.post('/api/activity-logs', (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      if (!body.category || !body.summary) {
        return res.status(400).json({
          error: 'category and summary are required',
        });
      }
      const created = recordSystemAuditLog(db, {
        category: String(body.category),
        status: body.status || 'success',
        durationMs: typeof body.durationMs === 'number' ? body.durationMs : null,
        brain: body.brain || null,
        source: body.source || null,
        recordId: typeof body.recordId === 'number' ? body.recordId : null,
        fileName: body.fileName || null,
        batchOrBackupId: body.batchOrBackupId || null,
        summary: String(body.summary),
        details: body.details || null,
        errorCategory: body.errorCategory || null,
        recoveryAction: body.recoveryAction || null,
      });
      res.status(201).json({ ok: true, entry: created });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to record activity log entry',
      });
    }
  });

  app.get('/api/activity-logs/export', (req: Request, res: Response) => {
    try {
      const format = String(req.query.format || 'json').toLowerCase();
      const { logs } = queryActivityLogs(req.query, { unpaginated: true });
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === 'csv') {
        const headers = [
          'id',
          'operationId',
          'timestamp',
          'category',
          'status',
          'durationMs',
          'brain',
          'source',
          'recordId',
          'fileName',
          'batchOrBackupId',
          'summary',
          'errorCategory',
          'recoveryAction',
        ];
        const escapeCsv = (val: any) => {
          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return /[",\n\r]/.test(str) ? `"${str}"` : str;
        };
        const lines = [
          headers.join(','),
          ...logs.map((row: any) =>
            headers.map((h) => escapeCsv(row[h])).join(',')
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="the-brain-activity-log-${stamp}.csv"`
        );
        return res.send(lines.join('\n'));
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="the-brain-activity-log-${stamp}.json"`
      );
      res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            count: logs.length,
            redactionApplied: true,
            logs,
          },
          null,
          2
        )
      );
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to export activity logs',
      });
    }
  });


  // 1b. Browser Companion Device Tokens API (All protected)
  app.get(
    '/api/companion/devices',
    requireCompanionAuth(),
    (_req: Request, res: Response) => {
      const rows = db
        .prepare(
          `SELECT id, name, token_prefix, browser, created_at, last_used_at, revoked_at
           FROM companion_devices
           ORDER BY created_at DESC`
        )
        .all();
      res.json(rows);
    }
  );

  app.post(
    '/api/companion/devices',
    requireCompanionAuth({ requireLocalEnrollmentIntent: true }),
    (req: Request, res: Response) => {
      const rawName =
        typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : 'Chrome Browser Companion';
      const rawBrowser =
        typeof req.body?.browser === 'string'
          ? req.body.browser.trim()
          : 'Chromium / Manifest V3';

      if (!rawName || rawName.length > 120) {
        return res.status(400).json({
          error: 'Device name must be between 1 and 120 characters.',
        });
      }
      if (!rawBrowser || rawBrowser.length > 120) {
        return res.status(400).json({
          error: 'Browser label must be between 1 and 120 characters.',
        });
      }

      const id = `dev_${crypto.randomBytes(8).toString('hex')}`;
      const { token, tokenHash, tokenPrefix } = generateCompanionToken();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO companion_devices (
          id, name, token_prefix, token_value, token_hash, browser, created_at, last_used_at, revoked_at
        ) VALUES (?, ?, ?, '', ?, ?, ?, NULL, NULL)`
      ).run(id, rawName, tokenPrefix, tokenHash, rawBrowser, now);

      res.status(201).json({
        device: {
          id,
          name: rawName,
          token_prefix: tokenPrefix,
          browser: rawBrowser,
          created_at: now,
          last_used_at: null,
          revoked_at: null,
        },
        token,
      });
    }
  );

  app.post(
    '/api/companion/devices/:id/revoke',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      const id = String(req.params.id || '').trim();
      if (!id || id.length > 128) {
        return res.status(400).json({ error: 'Valid device id is required' });
      }
      const existing = db
        .prepare('SELECT id, revoked_at FROM companion_devices WHERE id = ?')
        .get(id) as { id: string; revoked_at: string | null } | undefined;
      if (!existing) {
        return res.status(404).json({ error: 'Companion device not found' });
      }
      const revokedAt = existing.revoked_at || new Date().toISOString();
      db.prepare(
        `UPDATE companion_devices SET revoked_at = ?, token_value = '' WHERE id = ?`
      ).run(revokedAt, id);
      res.json({ ok: true, id, revoked_at: revokedAt });
    }
  );

  app.delete(
    '/api/companion/devices/:id',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      const id = String(req.params.id || '').trim();
      if (!id || id.length > 128) {
        return res.status(400).json({ error: 'Valid device id is required' });
      }
      const mode = req.query.mode === 'revoke' ? 'revoke' : 'delete';
      const existing = db
        .prepare('SELECT id FROM companion_devices WHERE id = ?')
        .get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Companion device not found' });
      }

      if (mode === 'revoke') {
        const revokedAt = new Date().toISOString();
        db.prepare(
          `UPDATE companion_devices SET revoked_at = ?, token_value = '' WHERE id = ?`
        ).run(revokedAt, id);
        return res.json({ ok: true, id, action: 'revoked', revoked_at: revokedAt });
      }

      db.prepare('DELETE FROM companion_devices WHERE id = ?').run(id);
      res.json({ ok: true, id, action: 'deleted' });
    }
  );

  // 1c. Browser Companion Project & Resource Staging API (All protected & validated)
  app.get(
    '/api/companion/captures',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      const brainFilter =
        typeof req.query.brain === 'string' && req.query.brain.trim()
          ? req.query.brain.trim().toLowerCase()
          : null;

      if (brainFilter) {
        const brainCheck = validateBrainName(brainFilter);
        if (!brainCheck.valid) {
          return res.status(400).json({ error: brainCheck.error });
        }
        const rows = db
          .prepare(
            'SELECT * FROM companion_captures WHERE brain = ? ORDER BY created_at DESC LIMIT 200'
          )
          .all(brainCheck.value);
        return res.json(rows.map(serializeCompanionCaptureRow));
      }

      const rows = db
        .prepare('SELECT * FROM companion_captures ORDER BY created_at DESC LIMIT 200')
        .all();
      res.json(rows.map(serializeCompanionCaptureRow));
    }
  );

  app.post(
    '/api/companion/captures',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      try {
        if (!req.body || typeof req.body !== 'object') {
          return res.status(400).json({ error: 'Request body must be a JSON object' });
        }

        const brainValidation = validateBrainName(req.body.brain || 'coding');
        if (!brainValidation.valid) {
          return res.status(400).json({ error: brainValidation.error });
        }
        const targetBrain = brainValidation.value;

        const sourceValidation = validateAISource(req.body.source || 'claude');
        if (!sourceValidation.valid) {
          return res.status(400).json({ error: sourceValidation.error });
        }
        const defaultSource = sourceValidation.value;

        const defaultProject =
          req.body.projectName !== undefined && req.body.projectName !== null
            ? String(req.body.projectName).trim()
            : null;
        if (defaultProject && defaultProject.length > MAX_TITLE_LENGTH) {
          return res.status(400).json({
            error: `projectName exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
          });
        }

        const provValidation = validateProvenanceUrl(req.body.provenanceUrl);
        if (!provValidation.valid) {
          return res.status(400).json({ error: provValidation.error });
        }
        const defaultProvenanceUrl = provValidation.value;

        const rawUnreachable = Array.isArray(req.body.unreachableResources)
          ? req.body.unreachableResources
          : [];
        if (rawUnreachable.length > 200) {
          return res.status(400).json({
            error: 'unreachableResources exceeds maximum of 200 entries',
          });
        }

        const sanitizedUnreachable: {
          name: string;
          reason: string;
          kind?: string;
        }[] = [];
        for (const u of rawUnreachable) {
          if (!u || typeof u !== 'object') continue;
          const name = String(u.name || 'Unnamed attachment').trim().slice(0, 255);
          const reason = String(
            u.reason || 'Unavailable in active browser DOM'
          )
            .trim()
            .slice(0, 500);
          const kind = u.kind ? String(u.kind).trim().slice(0, 64) : undefined;
          sanitizedUnreachable.push({ name, reason, kind });
        }

        const rawItems = Array.isArray(req.body.items)
          ? req.body.items
          : typeof req.body.content === 'string'
          ? [req.body]
          : null;

        if (!rawItems || rawItems.length === 0) {
          return res.status(400).json({
            error: 'At least one capture item is required in items[]',
          });
        }

        if (rawItems.length > MAX_COMPANION_ITEMS_PER_REQUEST) {
          return res.status(400).json({
            error: `Batch exceeds maximum of ${MAX_COMPANION_ITEMS_PER_REQUEST} items per capture request`,
          });
        }

        interface PreparedCaptureRecord {
          id: string;
          brain: string;
          source: ValidAISource;
          title: string;
          content: string;
          fileName: string;
          filePath: string;
          fileType: string;
          projectName: string | null;
          provenanceUrl: string | null;
          resourceKind: ValidResourceKind;
          tags: string[];
        }

        const preparedRecords: PreparedCaptureRecord[] = [];
        const skippedItems: { name: string; reason: string; kind?: string }[] = [
          ...sanitizedUnreachable,
        ];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx];
          if (!item || typeof item !== 'object') {
            return res.status(400).json({
              error: `Item at index ${idx} must be an object`,
            });
          }

          // Prevent cross-Brain injection inside a single batch
          if (item.brain !== undefined) {
            const itemBrainCheck = validateBrainName(item.brain);
            if (!itemBrainCheck.valid) {
              return res.status(400).json({
                error: `Item ${idx}: ${itemBrainCheck.error}`,
              });
            }
            if (itemBrainCheck.value !== targetBrain) {
              return res.status(400).json({
                error: `Cross-Brain batch mismatch at item ${idx}: item brain "${itemBrainCheck.value}" does not match request brain "${targetBrain}"`,
              });
            }
          }

          const itemSourceCheck =
            item.source !== undefined
              ? validateAISource(item.source)
              : { valid: true, value: defaultSource };
          if (!itemSourceCheck.valid) {
            return res.status(400).json({
              error: `Item ${idx}: ${itemSourceCheck.error}`,
            });
          }

          const rawKind =
            item.resourceKind !== undefined
              ? String(item.resourceKind).trim()
              : 'document';
          if (!(ALLOWED_RESOURCE_KINDS as readonly string[]).includes(rawKind)) {
            return res.status(400).json({
              error: `Item ${idx}: Invalid resourceKind "${rawKind}". Allowed: ${ALLOWED_RESOURCE_KINDS.join(', ')}`,
            });
          }
          const resourceKind = rawKind as ValidResourceKind;

          const itemProvCheck =
            item.provenanceUrl !== undefined
              ? validateProvenanceUrl(item.provenanceUrl)
              : { valid: true, value: defaultProvenanceUrl };
          if (!itemProvCheck.valid) {
            return res.status(400).json({
              error: `Item ${idx}: ${itemProvCheck.error}`,
            });
          }

          const rawTitle = String(
            item.title || item.fileName || `Project Resource ${idx + 1}`
          ).trim();
          if (rawTitle.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({
              error: `Item ${idx}: title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
            });
          }

          const rawContent =
            typeof item.content === 'string' ? item.content.trim() : '';
          if (!rawContent) {
            skippedItems.push({
              name: rawTitle,
              reason:
                item.reason ||
                'Resource had no readable text content in active tab DOM.',
            });
            continue;
          }

          if (rawContent.length > MAX_COMPANION_ITEM_CONTENT_LENGTH) {
            return res.status(400).json({
              error: `Item ${idx} ("${rawTitle}") content length (${rawContent.length}) exceeds maximum limit of ${MAX_COMPANION_ITEM_CONTENT_LENGTH} characters`,
            });
          }

          const safeSlug =
            rawTitle
              .replace(/[^a-zA-Z0-9_-]+/g, '_')
              .replace(/^_+|_+$/g, '')
              .toLowerCase()
              .slice(0, 80) || `resource_${idx + 1}`;
          const candidateFileName = String(
            item.fileName || item.file_name || `${safeSlug}.md`
          ).trim();
          const fileNameCheck = validateSafeFilePath(
            candidateFileName,
            MAX_FILENAME_LENGTH,
            `Item ${idx} fileName`
          );
          if (!fileNameCheck.valid) {
            return res.status(400).json({ error: fileNameCheck.error });
          }

          const itemProject =
            item.projectName !== undefined && item.projectName !== null
              ? String(item.projectName).trim()
              : defaultProject;
          if (itemProject && itemProject.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({
              error: `Item ${idx}: projectName exceeds maximum length of ${MAX_TITLE_LENGTH} characters`,
            });
          }

          const defaultFilePath = itemProject
            ? `${itemSourceCheck.value}-project/${itemProject
                .replace(/[^a-zA-Z0-9_-]+/g, '_')
                .toLowerCase()}/${fileNameCheck.value}`
            : `${itemSourceCheck.value}-companion/${fileNameCheck.value}`;
          const candidateFilePath = String(
            item.filePath || item.file_path || defaultFilePath
          ).trim();
          const filePathCheck = validateSafeFilePath(
            candidateFilePath,
            MAX_FILEPATH_LENGTH,
            `Item ${idx} filePath`
          );
          if (!filePathCheck.valid) {
            return res.status(400).json({ error: filePathCheck.error });
          }

          const rawFileType = String(
            item.fileType || item.file_type || 'md'
          ).trim();
          if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(rawFileType)) {
            return res.status(400).json({
              error: `Item ${idx}: Invalid fileType "${rawFileType}". Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`,
            });
          }

          let validatedTags: string[] = [
            'companion-capture',
            resourceKind,
            ...(itemProject ? ['project-resource'] : []),
          ];
          if (item.tags !== undefined) {
            if (!Array.isArray(item.tags) || item.tags.length > MAX_TAGS_COUNT) {
              return res.status(400).json({
                error: `Item ${idx}: tags must be an array of at most ${MAX_TAGS_COUNT} strings`,
              });
            }
            validatedTags = [];
            for (const t of item.tags) {
              if (typeof t !== 'string') {
                return res.status(400).json({
                  error: `Item ${idx}: each tag must be a string`,
                });
              }
              const cleanTag = t.trim().toLowerCase();
              if (!cleanTag) continue;
              if (cleanTag.length > MAX_TAG_LENGTH) {
                return res.status(400).json({
                  error: `Item ${idx}: tag exceeds maximum length of ${MAX_TAG_LENGTH} characters`,
                });
              }
              validatedTags.push(cleanTag);
            }
          }

          preparedRecords.push({
            id: `cap_${Date.now().toString(36)}_${idx}_${crypto
              .randomBytes(4)
              .toString('hex')}`,
            brain: targetBrain,
            source: itemSourceCheck.value,
            title: rawTitle,
            content: rawContent,
            fileName: fileNameCheck.value,
            filePath: filePathCheck.value,
            fileType: rawFileType,
            projectName: itemProject || null,
            provenanceUrl: itemProvCheck.value,
            resourceKind,
            tags: Array.from(new Set(validatedTags)),
          });
        }

        const now = new Date().toISOString();
        const deviceId = (req as any).companionDevice?.id || null;
        const insertStmt = db.prepare(`
          INSERT INTO companion_captures (
            id, brain, source, title, content, file_name, file_path,
            file_type, project_name, provenance_url, resource_kind,
            tags_json, unreachable_json, device_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const stagedCaptures: any[] = [];
        db.exec('BEGIN IMMEDIATE');
        try {
          for (let i = 0; i < preparedRecords.length; i++) {
            const rec = preparedRecords[i];
            insertStmt.run(
              rec.id,
              rec.brain,
              rec.source,
              rec.title,
              rec.content,
              rec.fileName,
              rec.filePath,
              rec.fileType,
              rec.projectName,
              rec.provenanceUrl,
              rec.resourceKind,
              JSON.stringify(rec.tags),
              JSON.stringify(i === 0 ? skippedItems : []),
              deviceId,
              now
            );
            const savedRow = db
              .prepare('SELECT * FROM companion_captures WHERE id = ?')
              .get(rec.id);
            stagedCaptures.push(serializeCompanionCaptureRow(savedRow));
          }
          db.exec('COMMIT');
        } catch (txErr) {
          db.exec('ROLLBACK');
          throw txErr;
        }

        res.json({
          ok: true,
          stagedCount: stagedCaptures.length,
          skippedUnreachableCount: skippedItems.length,
          items: stagedCaptures,
          captures: stagedCaptures,
          unreachableResources: skippedItems,
        });
      } catch (err: any) {
        res.status(500).json({
          error: 'Failed to stage companion project capture',
        });
      }
    }
  );

  app.delete(
    '/api/companion/captures/:id',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      const id = String(req.params.id || '').trim();
      if (!id || id.length > 128) {
        return res.status(400).json({ error: 'Valid capture id is required' });
      }
      db.prepare('DELETE FROM companion_captures WHERE id = ?').run(id);
      res.json({ ok: true, id });
    }
  );

  app.post(
    '/api/companion/captures/clear',
    requireCompanionAuth(),
    (req: Request, res: Response) => {
      db.prepare('DELETE FROM companion_captures').run();
      res.json({ ok: true });
    }
  );

  // 2. List Brains API
  app.get('/api/brains', (_req: Request, res: Response) => {
    res.json(getBrainList());
  });

  // 3. Facts by Brain API
  app.get('/api/facts', (req: Request, res: Response) => {
    const brain = typeof req.query.brain === 'string' ? req.query.brain.trim() : '';
    if (!brain) {
      const allRows = db
        .prepare('SELECT * FROM facts ORDER BY updated_at DESC LIMIT 5000')
        .all();
      return res.json(allRows.map(serializeFactRow));
    }
    const brainCheck = validateBrainName(brain);
    if (!brainCheck.valid) {
      return res.status(400).json({ error: brainCheck.error });
    }
    const rows = db
      .prepare('SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT 5000')
      .all(brainCheck.value);
    res.json(rows.map(serializeFactRow));
  });

  // 4. Recall Search API (Full Workspace Search across all metadata fields)
  app.get('/api/recall', (req: Request, res: Response) => {
    const brain = typeof req.query.brain === 'string' ? req.query.brain.trim() : '';
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const rawLimit = parseInt((req.query.limit as string) || '250', 10);
    const limit = Math.min(2000, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 250));

    if (!brain) {
      return res.status(400).json({ error: 'missing ?brain=' });
    }
    const brainCheck = validateBrainName(brain);
    if (!brainCheck.valid) {
      return res.status(400).json({ error: brainCheck.error });
    }

    if (query.trim()) {
      const cleanQuery = query.trim().toLowerCase();
      const terms = cleanQuery
        .replace(/[^\w\s._/-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2)
        .slice(0, 12);

      if (terms.length > 0) {
        const termClauses = terms.map(
          () =>
            `(LOWER(content) LIKE ? OR LOWER(COALESCE(document_title, '')) LIKE ? OR LOWER(COALESCE(file_name, '')) LIKE ? OR LOWER(COALESCE(file_path, '')) LIKE ? OR LOWER(COALESCE(source, '')) LIKE ? OR LOWER(COALESCE(tags_json, '')) LIKE ? OR LOWER(COALESCE(fixture_id, '')) LIKE ? OR LOWER(COALESCE(topic_key, '')) LIKE ?)`
        );
        const whereTerms = termClauses.join(' OR ');
        const params: any[] = [brainCheck.value];
        for (const t of terms) {
          const pat = `%${t}%`;
          params.push(pat, pat, pat, pat, pat, pat, pat, pat);
        }
        params.push(limit);
        const sql = `SELECT * FROM facts WHERE brain = ? AND (${whereTerms}) ORDER BY updated_at DESC LIMIT ?`;
        const rows = db.prepare(sql).all(...params);
        return res.json(rows.map(serializeFactRow));
      }
    }

    const defaultRows = db
      .prepare('SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT ?')
      .all(brainCheck.value, limit);
    res.json(defaultRows.map(serializeFactRow));
  });

  // 5. Store / Remember Fact API
  app.post('/api/remember', (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      if (req.headers['x-simulate-failure'] === 'true') {
        recordSystemAuditLog(db, {
          category: 'error',
          status: 'error',
          durationMs: Date.now() - startedAt,
          brain: req.body?.brain || null,
          source: req.body?.source || null,
          fileName: req.body?.fileName || req.body?.file_name || null,
          summary: 'Simulated persistence failure during fact creation',
          errorCategory: 'SIMULATED_FAILURE',
          recoveryAction: 'Retry item persistence from Review Queue',
        });
        return res.status(503).json({
          error: 'Simulated persistence failure — destination Brain was not modified',
        });
      }

      const {
        brain,
        content,
        source,
        file_name,
        fileName,
        file_path,
        filePath,
        sourceFolder,
        file_type,
        fileType,
        tags,
        isDocumentRoot,
        isUnifiedContextNode,
        documentTitle,
        semanticSectionCount,
        mergeHistory,
        parentId,
        originalCreatedAt,
        importedAt,
        importBatchId,
        checksum,
        extractionStatus,
        extractionWarnings,
        relatedSources,
        fixtureId,
        topicKey,
        fileSizeBytes,
        structuredData,
      } = req.body || {};

      if (!brain || !content || !source) {
        return res
          .status(400)
          .json({ error: 'brain, content, and source are required' });
      }

      const brainCheck = validateBrainName(brain);
      if (!brainCheck.valid) {
        return res.status(400).json({ error: brainCheck.error });
      }

      const sourceCheck = validateAISource(source);
      if (!sourceCheck.valid) {
        return res.status(400).json({ error: sourceCheck.error });
      }

      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'content must be a non-empty string' });
      }
      if (content.length > MAX_FACT_CONTENT_LENGTH) {
        return res.status(400).json({
          error: `content exceeds maximum length of ${MAX_FACT_CONTENT_LENGTH} characters`,
        });
      }

      const now = new Date().toISOString();
      const resolvedFileName = fileName || file_name || null;
      if (resolvedFileName) {
        const fnCheck = validateSafeFilePath(
          resolvedFileName,
          MAX_FILENAME_LENGTH,
          'fileName'
        );
        if (!fnCheck.valid) {
          return res.status(400).json({ error: fnCheck.error });
        }
      }

      const resolvedFilePath = filePath || file_path || resolvedFileName;
      if (resolvedFilePath) {
        const fpCheck = validateSafeFilePath(
          resolvedFilePath,
          MAX_FILEPATH_LENGTH,
          'filePath'
        );
        if (!fpCheck.valid) {
          return res.status(400).json({ error: fpCheck.error });
        }
      }

      // Derive provenance metadata from path/content while honoring explicit folder/header provenance
      const derivedProv = deriveAuthoritativeFactProvenance(
        resolvedFilePath,
        resolvedFileName,
        content,
        sourceCheck.value
      );
      const effectiveSource = derivedProv.source;
      const effectiveSourceFolder =
        sourceFolder || derivedProv.sourceFolder || null;
      const effectiveFixtureId = fixtureId || derivedProv.fixtureId || null;
      const effectiveTopicKey = topicKey || derivedProv.topicKey || null;
      const effectiveOriginalCreatedAt =
        originalCreatedAt !== undefined
          ? originalCreatedAt
          : derivedProv.originalCreatedAt;
      const effectiveChecksum = checksum || derivedProv.checksum;
      const effectiveSizeBytes =
        typeof fileSizeBytes === 'number'
          ? fileSizeBytes
          : derivedProv.fileSizeBytes;
      const effectiveRelatedSources =
        Array.isArray(relatedSources) && relatedSources.length > 0
          ? relatedSources
          : derivedProv.relatedSources;

      const resolvedFileType = fileType || file_type || null;
      const tagsJson = Array.isArray(tags)
        ? JSON.stringify(
            tags.slice(0, MAX_TAGS_COUNT).map((t) => String(t).slice(0, MAX_TAG_LENGTH))
          )
        : '[]';
      const mergeHistoryJson = Array.isArray(mergeHistory)
        ? JSON.stringify(mergeHistory)
        : null;
      const warningsJson = Array.isArray(extractionWarnings)
        ? JSON.stringify(extractionWarnings)
        : null;
      const relatedSourcesJson =
        effectiveRelatedSources.length > 0
          ? JSON.stringify(effectiveRelatedSources)
          : null;
      const structuredDataJson = structuredData
        ? JSON.stringify(structuredData)
        : null;

      const insert = db.prepare(`
        INSERT INTO facts (
          brain, content, source, file_name, file_path, source_folder, file_type, tags_json,
          parent_id, is_document_root, is_unified_context_node, document_title,
          semantic_section_count, merge_history_json,
          original_created_at, imported_at, import_batch_id, checksum,
          extraction_status, extraction_warnings_json, related_sources_json,
          fixture_id, topic_key, file_size_bytes, structured_data_json,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(
        brainCheck.value,
        content.trim(),
        effectiveSource,
        resolvedFileName,
        resolvedFilePath,
        effectiveSourceFolder,
        resolvedFileType,
        tagsJson,
        parentId ?? null,
        isDocumentRoot ? 1 : 0,
        isUnifiedContextNode ? 1 : 0,
        documentTitle ? String(documentTitle).slice(0, MAX_TITLE_LENGTH) : null,
        semanticSectionCount ?? null,
        mergeHistoryJson,
        effectiveOriginalCreatedAt ?? null,
        importedAt || now,
        importBatchId || null,
        effectiveChecksum,
        extractionStatus || 'success',
        warningsJson,
        relatedSourcesJson,
        effectiveFixtureId,
        effectiveTopicKey,
        effectiveSizeBytes,
        structuredDataJson,
        now,
        now
      );

      const newFact = db
        .prepare('SELECT * FROM facts WHERE id = ?')
        .get(result.lastInsertRowid);
      const serialized = serializeFactRow(newFact);

      recordSystemAuditLog(db, {
        category: resolvedFileName ? 'imported' : 'created',
        status: 'success',
        durationMs: Date.now() - startedAt,
        brain: brainCheck.value,
        source: effectiveSource,
        recordId: Number(result.lastInsertRowid),
        fileName: resolvedFileName,
        batchOrBackupId: importBatchId || null,
        summary: `Stored memory #${result.lastInsertRowid} in "${brainCheck.value}" (${effectiveSource}${
          resolvedFileName ? ` · ${resolvedFileName}` : ''
        })`,
        details: {
          filePath: resolvedFilePath,
          sourceFolder: effectiveSourceFolder,
          fileType: resolvedFileType,
          fixtureId: effectiveFixtureId,
          checksum: effectiveChecksum,
        },
      });

      res.json(serialized);
    } catch {
      res.status(500).json({ error: 'Failed to persist fact' });
    }
  });

  // 6. Correct / Update Fact API
  app.post('/api/correct', (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      if (req.headers['x-simulate-failure'] === 'true') {
        return res.status(503).json({
          error: 'Simulated persistence failure — destination node was not modified',
        });
      }

      const {
        id,
        content,
        source,
        tags,
        fileName,
        filePath,
        fileType,
        documentTitle,
        semanticSectionCount,
        mergeHistory,
        isDocumentRoot,
        isUnifiedContextNode,
        actionType,
      } = req.body || {};

      if (id === undefined || (!content && !Array.isArray(tags))) {
        return res
          .status(400)
          .json({ error: 'id and content or tags are required' });
      }

      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return res.status(400).json({ error: 'id must be a positive integer' });
      }

      const existing = db
        .prepare('SELECT * FROM facts WHERE id = ?')
        .get(numericId) as any;
      if (!existing) {
        return res
          .status(404)
          .json({ error: `Destination node #${numericId} not found on backend` });
      }

      if (typeof content === 'string' && content.length > MAX_FACT_CONTENT_LENGTH) {
        return res.status(400).json({
          error: `content exceeds maximum length of ${MAX_FACT_CONTENT_LENGTH} characters`,
        });
      }

      let nextSource = existing.source;
      if (typeof source === 'string' && source.trim()) {
        const srcCheck = validateAISource(source);
        if (!srcCheck.valid) {
          return res.status(400).json({ error: srcCheck.error });
        }
        nextSource = srcCheck.value;
      }

      const now = new Date().toISOString();
      const nextContent =
        typeof content === 'string' ? content.trim() : existing.content;
      const nextChecksum = crypto
        .createHash('sha256')
        .update(nextContent, 'utf8')
        .digest('hex');
      const nextTagsJson = Array.isArray(tags)
        ? JSON.stringify(
            tags.slice(0, MAX_TAGS_COUNT).map((t) => String(t).slice(0, MAX_TAG_LENGTH))
          )
        : existing.tags_json;
      const nextFileName =
        fileName !== undefined ? fileName : existing.file_name;
      const nextFilePath =
        filePath !== undefined ? filePath : existing.file_path;
      const nextFileType =
        fileType !== undefined ? fileType : existing.file_type;
      const nextDocTitle =
        documentTitle !== undefined ? documentTitle : existing.document_title;
      const nextSectionCount =
        semanticSectionCount !== undefined
          ? semanticSectionCount
          : existing.semantic_section_count;
      const nextMergeHistoryJson = Array.isArray(mergeHistory)
        ? JSON.stringify(mergeHistory)
        : existing.merge_history_json;
      const nextIsDocRoot =
        isDocumentRoot !== undefined
          ? isDocumentRoot
            ? 1
            : 0
          : existing.is_document_root;
      const nextIsUnified =
        isUnifiedContextNode !== undefined
          ? isUnifiedContextNode
            ? 1
            : 0
          : existing.is_unified_context_node;

      db.prepare(`
        UPDATE facts
        SET content = ?,
            source = ?,
            tags_json = ?,
            file_name = ?,
            file_path = ?,
            file_type = ?,
            document_title = ?,
            semantic_section_count = ?,
            merge_history_json = ?,
            is_document_root = ?,
            is_unified_context_node = ?,
            checksum = ?,
            file_size_bytes = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        nextContent,
        nextSource,
        nextTagsJson,
        nextFileName,
        nextFilePath,
        nextFileType,
        nextDocTitle,
        nextSectionCount,
        nextMergeHistoryJson,
        nextIsDocRoot,
        nextIsUnified,
        nextChecksum,
        Buffer.byteLength(nextContent, 'utf8'),
        now,
        numericId
      );

      const updatedRow = db
        .prepare('SELECT * FROM facts WHERE id = ?')
        .get(numericId);

      const auditCat =
        actionType === 'merge'
          ? 'merged'
          : actionType === 'replace'
          ? 'replaced'
          : 'modified';
      recordSystemAuditLog(db, {
        category: auditCat,
        status: 'success',
        durationMs: Date.now() - startedAt,
        brain: existing.brain,
        source: nextSource,
        recordId: numericId,
        fileName: nextFileName,
        summary: `${
          auditCat === 'merged'
            ? 'Merged content into'
            : auditCat === 'replaced'
            ? 'Replaced content of'
            : 'Updated'
        } memory #${numericId} in "${existing.brain}"`,
      });

      res.json({
        ok: true,
        id: numericId,
        updated_at: now,
        fact: serializeFactRow(updatedRow),
      });
    } catch {
      res.status(500).json({ error: 'Failed to update fact on backend' });
    }
  });

  // 7. Forget / Delete Fact API
  app.post('/api/forget', (req: Request, res: Response) => {
    const id = req.body?.id;
    const numericId = Number(id);
    if (id === undefined || !Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({ error: 'Valid numeric id is required' });
    }
    const existing = db
      .prepare('SELECT id, brain, source, file_name FROM facts WHERE id = ?')
      .get(numericId) as any;
    db.prepare('DELETE FROM facts WHERE id = ?').run(numericId);
    if (existing) {
      recordSystemAuditLog(db, {
        category: 'deleted',
        status: 'success',
        brain: existing.brain,
        source: existing.source,
        recordId: numericId,
        fileName: existing.file_name,
        summary: `Deleted memory #${numericId} from "${existing.brain}"`,
      });
    }
    res.json({ ok: true, id: numericId });
  });

  // 8. Delete Entire Brain API
  app.post('/api/delete_brain', (req: Request, res: Response) => {
    const brainCheck = validateBrainName(req.body?.brain);
    if (!brainCheck.valid) {
      return res.status(400).json({ error: brainCheck.error || 'brain required' });
    }
    const countBefore = (
      db
        .prepare('SELECT count(*) as c FROM facts WHERE brain = ?')
        .get(brainCheck.value) as { c: number }
    ).c;
    db.prepare('DELETE FROM facts WHERE brain = ?').run(brainCheck.value);
    recordSystemAuditLog(db, {
      category: 'deleted',
      status: 'warning',
      brain: brainCheck.value,
      summary: `Deleted workspace brain "${brainCheck.value}" (${countBefore} memories removed)`,
    });
    res.json({ ok: true, brain: brainCheck.value, deleted_facts: countBefore });
  });

  // 9. Ingest / Check File API
  app.post('/api/check_file', (req: Request, res: Response) => {
    const { brain, file_path, file_name, content } = req.body || {};
    const pathTarget = String(file_path || file_name || '').trim();
    const brainCheck = validateBrainName(brain);
    if (!brainCheck.valid || !pathTarget) {
      return res.status(400).json({ error: 'brain and file_path required' });
    }

    const existing = db
      .prepare(
        `SELECT * FROM facts
         WHERE brain = ? AND (file_path = ? OR file_name = ?)
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(brainCheck.value, pathTarget, path.basename(pathTarget)) as any;

    if (!existing) {
      return res.json({ exists: false, is_identical: false });
    }

    const isIdentical =
      (existing.content || '').trim() === String(content || '').trim();
    res.json({
      exists: true,
      fact: serializeFactRow(existing),
      is_identical: isIdentical,
    });
  });

  app.post('/api/ingest', (req: Request, res: Response) => {
    const {
      brain,
      content,
      source,
      file_name = 'document.md',
      file_path = '',
    } = req.body || {};
    if (!brain || !content || !source) {
      return res
        .status(400)
        .json({ error: 'brain, content and source required' });
    }

    const brainCheck = validateBrainName(brain);
    if (!brainCheck.valid) {
      return res.status(400).json({ error: brainCheck.error });
    }

    const sourceCheck = validateAISource(source);
    if (!sourceCheck.valid) {
      return res.status(400).json({ error: sourceCheck.error });
    }

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content must be a non-empty string' });
    }
    if (content.length > MAX_FACT_CONTENT_LENGTH) {
      return res.status(400).json({
        error: `content exceeds maximum length of ${MAX_FACT_CONTENT_LENGTH} characters`,
      });
    }

    const cleanContent = content.trim();
    const effectivePath = String(file_path || file_name).trim();
    const resolvedBrain = brainCheck.value;
    const derivedProv = deriveAuthoritativeFactProvenance(
      effectivePath,
      file_name,
      cleanContent,
      sourceCheck.value
    );

    const existing = db
      .prepare(
        `SELECT * FROM facts
         WHERE brain = ? AND (file_path = ? OR file_name = ?)
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(resolvedBrain, effectivePath, path.basename(effectivePath)) as any;

    const now = new Date().toISOString();

    if (existing) {
      let merged = cleanContent;
      if (existing.content.trim() === cleanContent) {
        return res.json({
          fact: serializeFactRow(existing),
          action: 'unchanged',
          message: 'Content is identical',
        });
      }
      if (!cleanContent.startsWith(existing.content)) {
        merged = `${existing.content}\n\n${cleanContent}`;
      }
      db.prepare(
        'UPDATE facts SET content = ?, source = ?, checksum = ?, updated_at = ? WHERE id = ?'
      ).run(merged, derivedProv.source, derivedProv.checksum, now, existing.id);
      const updated = db
        .prepare('SELECT * FROM facts WHERE id = ?')
        .get(existing.id);
      recordSystemAuditLog(db, {
        category: 'merged',
        status: 'success',
        brain: resolvedBrain,
        source: derivedProv.source,
        recordId: existing.id,
        fileName: String(file_name).trim(),
        summary: `Merged content into memory #${existing.id} (${file_name})`,
      });
      return res.json({
        fact: serializeFactRow(updated),
        action: 'merged',
        message: `Merged into node #${existing.id}`,
      });
    }

    const insert = db.prepare(`
      INSERT INTO facts (
        brain, content, source, file_name, file_path, source_folder,
        fixture_id, related_sources_json, topic_key, original_created_at,
        imported_at, checksum, file_size_bytes,
        is_document_root, is_unified_context_node, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `);
    const r = insert.run(
      resolvedBrain,
      cleanContent,
      derivedProv.source,
      String(file_name).trim(),
      effectivePath,
      derivedProv.sourceFolder,
      derivedProv.fixtureId,
      derivedProv.relatedSources.length > 0
        ? JSON.stringify(derivedProv.relatedSources)
        : null,
      derivedProv.topicKey,
      derivedProv.originalCreatedAt,
      now,
      derivedProv.checksum,
      derivedProv.fileSizeBytes,
      now,
      now
    );
    const created = db
      .prepare('SELECT * FROM facts WHERE id = ?')
      .get(r.lastInsertRowid);
    recordSystemAuditLog(db, {
      category: 'imported',
      status: 'success',
      brain: resolvedBrain,
      source: derivedProv.source,
      recordId: Number(r.lastInsertRowid),
      fileName: String(file_name).trim(),
      summary: `Ingested document memory #${r.lastInsertRowid} (${file_name}) into "${resolvedBrain}"`,
    });
    res.json({
      fact: serializeFactRow(created),
      action: 'created',
      message: `Created new node #${r.lastInsertRowid}`,
    });
  });

  // 10. OpenAPI Specification
  app.get('/api/openapi.json', (req: Request, res: Response) => {
    const host = req.get('host') || '127.0.0.1:3000';
    const protocol = req.protocol || 'http';
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'The Brain API',
        description: 'Two-way personal memory storage and retrieval for AI chats.',
        version: '1.0.0',
      },
      servers: [{ url: `${protocol}://${host}` }],
      paths: {
        '/api/recall': {
          get: {
            summary: 'Recall facts from brain memory',
            operationId: 'recallMemories',
            parameters: [
              {
                name: 'brain',
                in: 'query',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'query',
                in: 'query',
                required: false,
                schema: { type: 'string' },
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                schema: { type: 'integer', default: 10 },
              },
            ],
            responses: {
              '200': {
                description: 'List of matching facts',
                content: {
                  'application/json': {
                    schema: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
        '/api/remember': {
          post: {
            summary: 'Store a new fact or decision',
            operationId: 'rememberFact',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['brain', 'content', 'source'],
                    properties: {
                      brain: { type: 'string' },
                      content: { type: 'string' },
                      source: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Fact saved successfully',
                content: {
                  'application/json': { schema: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    });
  });

  // 11. Live AI Web Chat Test Endpoint
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const { brain = 'coding', message = '', source = 'gpt' } = req.body || {};
      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const brainCheck = validateBrainName(brain);
      if (!brainCheck.valid) {
        return res.status(400).json({ error: brainCheck.error });
      }
      const sourceCheck = validateAISource(source);
      if (!sourceCheck.valid) {
        return res.status(400).json({ error: sourceCheck.error });
      }

      const resolvedBrain = brainCheck.value;
      const validSource = sourceCheck.value;

      const terms = message
        .replace(/[^\w\s]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(
          (t: string) =>
            t.length > 2 &&
            ![
              'what',
              'about',
              'this',
              'that',
              'with',
              'from',
              'have',
              'your',
              'please',
            ].includes(t)
        )
        .slice(0, 10);

      let rawFacts: any[] = [];
      if (terms.length > 0) {
        const clauses = terms.map(() => 'LOWER(content) LIKE ?').join(' OR ');
        const sql = `SELECT * FROM facts WHERE brain = ? AND (${clauses}) ORDER BY updated_at DESC LIMIT 5`;
        rawFacts = db
          .prepare(sql)
          .all(resolvedBrain, ...terms.map((t: string) => `%${t}%`));
      }
      if (rawFacts.length === 0) {
        rawFacts = db
          .prepare(
            'SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT 5'
          )
          .all(resolvedBrain);
      }

      const facts = rawFacts.map(serializeFactRow).filter(Boolean);
      const factsText =
        facts.length > 0
          ? facts
              .map((f: any) => `- [#${f.id}] (${f.source}) ${f.content}`)
              .join('\n')
          : 'No prior facts recorded in this brain yet.';

      const systemPrompt = `You are a personalized AI Web Companion simulating two-way sync with "The Brain" memory system for the user's ${validSource.toUpperCase()} web account.
Active Brain: "${resolvedBrain}"

DURABLE MEMORY FACTS CURRENTLY STORED:
${factsText}

INSTRUCTIONS FOR TWO-WAY SYNC:
1. Ground your response in the durable facts above.
2. If the user announces a new rule, decision, milestone, project preference, or asks to remember something, you MUST append a memory block at the end:
### SAVE TO BRAIN:
<Concise 1-2 sentence statement of the durable fact to store>
`;

      let replyText = '';
      let savedFact: any = null;

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI();
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nUser Message: ${message}` }],
              },
            ],
          });
          replyText = response.text || 'Received and processed.';
        } catch {
          try {
            const ai = new GoogleGenAI();
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: `${systemPrompt}\n\nUser Message: ${message}` },
                  ],
                },
              ],
            });
            replyText = response.text || 'Received and processed.';
          } catch {
            replyText = `Connected to "${resolvedBrain}". Grounded in ${facts.length} stored memory nodes.\n\n### SAVE TO BRAIN:\nVerified two-way memory sync for ${validSource.toUpperCase()} web account in ${resolvedBrain}.`;
          }
        }
      } else {
        replyText = `Grounded response (${validSource.toUpperCase()}) using ${
          facts.length
        } memory nodes from "${resolvedBrain}":\n${facts
          .slice(0, 2)
          .map((f: any) => `• [#${f.id}] ${f.content.slice(0, 120)}...`)
          .join(
            '\n'
          )}\n\n### SAVE TO BRAIN:\nSynchronized context query from ${validSource.toUpperCase()} session: "${message.slice(
          0,
          90
        )}"`;
      }

      const saveMatch = replyText.match(
        /### (?:🧠\s*)?SAVE TO BRAIN:\s*\n+([^\n]+(?:\n[^\n]+)?)/i
      );
      if (saveMatch && saveMatch[1]) {
        const factContent = saveMatch[1].trim();
        const now = new Date().toISOString();
        const insert = db.prepare(`
          INSERT INTO facts (brain, content, source, file_name, file_path, file_type, tags_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'chat', '["ai-sync"]', ?, ?)
        `);
        const r = insert.run(
          resolvedBrain,
          factContent,
          validSource,
          null,
          null,
          now,
          now
        );
        const rawSaved = db
          .prepare('SELECT * FROM facts WHERE id = ?')
          .get(r.lastInsertRowid);
        savedFact = serializeFactRow(rawSaved);
      }

      res.json({
        reply: replyText,
        recalledFacts: facts,
        savedFact,
        success: true,
      });
    } catch {
      res.status(500).json({ error: 'Chat processing failed' });
    }
  });

  return app;
}
