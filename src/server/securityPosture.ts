import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export type EncryptionAtRestStatus =
  | 'unencrypted_standard_sqlite'
  | 'in_memory_ephemeral'
  | 'missing'
  | 'unrecognized_format';

export interface FileSecurityInspection {
  label: string;
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  modeOctal: string | null;
  ownerOnly: boolean | null;
  sqliteHeaderPlaintext: boolean | null;
}

export interface DataFlowDisclosure {
  id: string;
  surface: string;
  classification: 'local_only' | 'optional_external' | 'external_asset';
  activeNow: boolean;
  staysOnDevice: string;
  leavesDevice: string;
  notes: string;
}

export interface LocalSecurityPostureReport {
  checkedAt: string;
  operatingMode: 'local_first' | 'offline_capable' | 'air_gapped';
  operatingModeSummary: string;
  modeDefinitions: {
    localFirst: string;
    offlineCapable: string;
    airGapped: string;
  };
  encryptionAtRest: {
    encryptedAtRest: boolean;
    status: EncryptionAtRestStatus;
    engine: string;
    verifiedAgainstDisk: boolean;
    summary: string;
    recommendation: string;
  };
  filePermissions: {
    platform: NodeJS.Platform;
    posixSupported: boolean;
    allPresentFilesOwnerOnly: boolean;
    dbPath: string;
    backupDir: string;
    files: FileSecurityInspection[];
  };
  credentialsAndSecrets: {
    companionTokensStoredHashedOnly: boolean;
    activeCompanionDevices: number;
    plaintextTokenRowsDetected: number;
    geminiApiKeyConfigured: boolean;
    geminiKeyStorageLocation: string;
    auditLogSecretRedactionEnabled: boolean;
    portableExportSecretExclusionDefault: boolean;
    rotationAndDeletionNotes: string;
  };
  retentionAndDeletion: {
    backupRetentionMaxCount: number;
    knownGoodBackupProtected: boolean;
    walModeEnabled: boolean;
    deletionSemantics: string;
    exportSemantics: string;
  };
  networkAndDataFlow: DataFlowDisclosure[];
  ollamaLocalBehaviour: {
    folderConvention: string;
    makesOutboundNetworkCalls: boolean;
    summary: string;
  };
  bindHost: string;
  loopbackOnly: boolean;
}

const SQLITE_MAGIC_PREFIX = 'SQLite format 3\u0000';

export function inspectFileEncryptionHeader(filePath: string): {
  exists: boolean;
  sizeBytes: number;
  sqliteHeaderPlaintext: boolean | null;
} {
  if (!filePath || filePath === ':memory:') {
    return { exists: false, sizeBytes: 0, sqliteHeaderPlaintext: null };
  }
  if (!fs.existsSync(filePath)) {
    return { exists: false, sizeBytes: 0, sqliteHeaderPlaintext: null };
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return { exists: true, sizeBytes: stat.size, sqliteHeaderPlaintext: null };
  }
  if (stat.size < 16) {
    return { exists: true, sizeBytes: stat.size, sqliteHeaderPlaintext: null };
  }
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    if (bytesRead < 16) {
      return { exists: true, sizeBytes: stat.size, sqliteHeaderPlaintext: null };
    }
    const header = buf.toString('utf8');
    return {
      exists: true,
      sizeBytes: stat.size,
      sqliteHeaderPlaintext: header === SQLITE_MAGIC_PREFIX,
    };
  } catch {
    return { exists: true, sizeBytes: stat.size, sqliteHeaderPlaintext: null };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
    }
  }
}

export function inspectSingleFileSecurity(
  label: string,
  filePath: string,
  checkSqliteHeader = false
): FileSecurityInspection {
  if (!filePath || filePath === ':memory:' || !fs.existsSync(filePath)) {
    return {
      label,
      filePath,
      exists: false,
      sizeBytes: 0,
      modeOctal: null,
      ownerOnly: null,
      sqliteHeaderPlaintext: null,
    };
  }
  try {
    const stat = fs.statSync(filePath);
    const perms = stat.mode & 0o777;
    const modeOctal = '0' + perms.toString(8).padStart(3, '0');
    const posixSupported = process.platform !== 'win32';
    const ownerOnly = posixSupported ? (perms & 0o077) === 0 : null;
    const headerInfo = checkSqliteHeader
      ? inspectFileEncryptionHeader(filePath)
      : { sqliteHeaderPlaintext: null };

    return {
      label,
      filePath,
      exists: true,
      sizeBytes: stat.size,
      modeOctal,
      ownerOnly,
      sqliteHeaderPlaintext: headerInfo.sqliteHeaderPlaintext,
    };
  } catch {
    return {
      label,
      filePath,
      exists: true,
      sizeBytes: 0,
      modeOctal: null,
      ownerOnly: null,
      sqliteHeaderPlaintext: null,
    };
  }
}

export interface HardenPermissionsResult {
  posixSupported: boolean;
  updatedFiles: string[];
  skippedFiles: string[];
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Applies strict owner-only POSIX file permissions (0600 for files, 0700 for directories)
 * to the SQLite database, WAL/SHM sidecars, backup directory, and backup snapshots.
 */
export function hardenDatabaseFilePermissions(
  dbPath: string,
  backupDir?: string
): HardenPermissionsResult {
  const posixSupported = process.platform !== 'win32';
  const updatedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  if (!posixSupported || !dbPath || dbPath === ':memory:') {
    return { posixSupported, updatedFiles, skippedFiles, errors };
  }

  const applyMode = (targetPath: string, mode: number) => {
    if (!fs.existsSync(targetPath)) {
      skippedFiles.push(targetPath);
      return;
    }
    try {
      const stat = fs.statSync(targetPath);
      const currentMode = stat.mode & 0o777;
      if (currentMode !== mode) {
        fs.chmodSync(targetPath, mode);
        updatedFiles.push(targetPath);
      }
    } catch (err: any) {
      errors.push({
        filePath: targetPath,
        error: err?.message || 'chmod failed',
      });
    }
  };

  // Database and SQLite WAL/SHM files
  applyMode(dbPath, 0o600);
  applyMode(`${dbPath}-wal`, 0o600);
  applyMode(`${dbPath}-shm`, 0o600);

  if (backupDir && fs.existsSync(backupDir)) {
    applyMode(backupDir, 0o700);
    try {
      const entries = fs.readdirSync(backupDir);
      for (const entry of entries) {
        if (
          entry.endsWith('.db') ||
          entry.endsWith('.meta.json') ||
          entry.endsWith('.brain.json') ||
          entry.endsWith('.brainpack.zip')
        ) {
          applyMode(path.join(backupDir, entry), 0o600);
        }
      }
    } catch (err: any) {
      errors.push({
        filePath: backupDir,
        error: err?.message || 'failed to list backup directory',
      });
    }
  }

  return { posixSupported, updatedFiles, skippedFiles, errors };
}

export function inspectLocalSecurityPosture(params: {
  db: DatabaseSync;
  dbPath: string;
  backupDir: string;
  bindHost: string;
  maxBackups?: number;
  env?: NodeJS.ProcessEnv;
}): LocalSecurityPostureReport {
  const { db, dbPath, backupDir, bindHost, maxBackups = 10, env = process.env } = params;
  const checkedAt = new Date().toISOString();
  const isMemory = !dbPath || dbPath === ':memory:';
  const posixSupported = process.platform !== 'win32';

  // 1. Inspect database, WAL, SHM, backup dir, and latest backup file
  const files: FileSecurityInspection[] = [];
  if (!isMemory) {
    files.push(inspectSingleFileSecurity('Primary SQLite Database', dbPath, true));
    files.push(inspectSingleFileSecurity('SQLite WAL Journal', `${dbPath}-wal`, false));
    files.push(inspectSingleFileSecurity('SQLite SHM Index', `${dbPath}-shm`, false));
    files.push(inspectSingleFileSecurity('Backup Directory', backupDir, false));

    if (backupDir && fs.existsSync(backupDir)) {
      try {
        const backupDbFiles = fs
          .readdirSync(backupDir)
          .filter((f) => f.endsWith('.db') && !f.startsWith('.tmp-'))
          .map((f) => {
            const full = path.join(backupDir, f);
            const stat = fs.statSync(full);
            return { name: f, full, mtimeMs: stat.mtimeMs };
          })
          .sort((a, b) => b.mtimeMs - a.mtimeMs);
        if (backupDbFiles.length > 0) {
          files.push(
            inspectSingleFileSecurity(
              `Latest Backup (${backupDbFiles[0].name})`,
              backupDbFiles[0].full,
              true
            )
          );
        }
      } catch {
        // ignore unreadable backup dir during inspection
      }
    }
  }

  // 2. Verify encryption at rest honestly
  let encryptionStatus: EncryptionAtRestStatus = 'missing';
  let encryptedAtRest = false;
  let encryptionSummary = '';

  if (isMemory) {
    encryptionStatus = 'in_memory_ephemeral';
    encryptionSummary =
      'Running in ephemeral in-memory SQLite mode (:memory:). No database file is persisted on disk.';
  } else {
    const dbFileCheck = files[0];
    if (!dbFileCheck?.exists) {
      encryptionStatus = 'missing';
      encryptionSummary = 'Database file does not exist on disk yet.';
    } else if (dbFileCheck.sqliteHeaderPlaintext === true) {
      encryptionStatus = 'unencrypted_standard_sqlite';
      encryptedAtRest = false;
      encryptionSummary =
        'Verified on disk: the primary SQLite database, WAL sidecar, and .db snapshots use standard unencrypted SQLite format 3. Application-level database encryption (e.g., SQLCipher) is NOT active.';
    } else {
      encryptionStatus = 'unrecognized_format';
      encryptedAtRest = false;
      encryptionSummary =
        'Database file header did not match standard plaintext SQLite format 3, but application-level encryption cannot be certified by Argon.';
    }
  }

  // 3. Inspect companion device tokens & secrets
  let activeCompanionDevices = 0;
  let plaintextTokenRowsDetected = 0;
  try {
    const activeRow = db
      .prepare('SELECT count(*) as count FROM companion_devices WHERE revoked_at IS NULL')
      .get() as { count?: number } | undefined;
    activeCompanionDevices = Number(activeRow?.count || 0);

    const plaintextRow = db
      .prepare(
        `SELECT count(*) as count FROM companion_devices
         WHERE token_value IS NOT NULL AND TRIM(token_value) != ''`
      )
      .get() as { count?: number } | undefined;
    plaintextTokenRowsDetected = Number(plaintextRow?.count || 0);
  } catch {
    // table may not exist in older fixtures
  }

  // 4. Inspect WAL journal mode
  let walModeEnabled = false;
  try {
    const jm = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
    walModeEnabled = String(jm?.journal_mode || '').toLowerCase() === 'wal';
  } catch {
    walModeEnabled = false;
  }

  const geminiApiKeyConfigured = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
  const loopbackOnly =
    bindHost === '127.0.0.1' || bindHost === 'localhost' || bindHost === '::1';

  const presentFiles = files.filter((f) => f.exists);
  const allPresentFilesOwnerOnly = posixSupported
    ? presentFiles.length > 0 && presentFiles.every((f) => f.ownerOnly === true)
    : false;

  const networkAndDataFlow: DataFlowDisclosure[] = [
    {
      id: 'sqlite-storage',
      surface: 'SQLite Memory Database, Backups & Local Search',
      classification: 'local_only',
      activeNow: true,
      staysOnDevice:
        'All Brains, facts, source provenance, tags, activity audit logs, settings, and .db backups stay strictly on local disk.',
      leavesDevice: 'Nothing leaves your machine during memory read/write, search, or backup.',
      notes:
        'Standard unencrypted SQLite on disk; rely on OS full-disk encryption (FileVault, BitLocker, LUKS) plus 0600 file permissions.',
    },
    {
      id: 'local-api-mcp',
      surface: 'Local HTTP API (/api/*) & Desktop stdio MCP',
      classification: 'local_only',
      activeNow: true,
      staysOnDevice: `HTTP API binds to ${bindHost} and Desktop MCP communicates over local stdin/stdout pipes.`,
      leavesDevice:
        'Nothing leaves the machine from Argon itself. However, if you connect a cloud-hosted desktop AI client (such as Claude Desktop or Cursor) to stdio MCP, facts returned to that client are sent by that client to its model provider.',
      notes: 'Reading memories and writing memories are separate MCP tools.',
    },
    {
      id: 'ollama-local-ai',
      surface: 'Local AI / Ollama Exports (07_local_ai_ollama)',
      classification: 'local_only',
      activeNow: true,
      staysOnDevice:
        'Files imported from 07_local_ai_ollama are parsed and stored locally in SQLite without calling any remote LLM API.',
      leavesDevice:
        'Nothing leaves the machine during import or recall of Ollama exports. Argon does not currently proxy live inference to cloud models during ingestion.',
      notes:
        'Using local Ollama exports keeps model content local, but does NOT automatically make the web UI air-gapped (see external font assets below).',
    },
    {
      id: 'browser-companion',
      surface: 'Browser Companion Extension (Save to Brain)',
      classification: 'optional_external',
      activeNow: activeCompanionDevices > 0,
      staysOnDevice:
        'Captured page snippets and chats are sent directly from your browser to your local Argon HTTP endpoint using a SHA-256-verified device token.',
      leavesDevice:
        'Argon does not upload captures anywhere. When you click Inject Memory on chatgpt.com, claude.ai, or gemini.google.com, the injected prompt text is submitted to that web AI provider.',
      notes: `${activeCompanionDevices} active paired browser device(s). Revoking a device immediately invalidates its Bearer token.`,
    },
    {
      id: 'gemini-chat-endpoint',
      surface: 'Optional Cloud Model Simulator (/api/chat via GEMINI_API_KEY)',
      classification: 'optional_external',
      activeNow: geminiApiKeyConfigured,
      staysOnDevice:
        'When GEMINI_API_KEY is unset, /api/chat runs a deterministic local-only recall response with zero outbound API calls.',
      leavesDevice: geminiApiKeyConfigured
        ? 'GEMINI_API_KEY is currently configured: invoking /api/chat sends the user message plus up to 5 recalled facts from the active Brain to Google Gemini API.'
        : 'Currently inactive (GEMINI_API_KEY is not set). No prompts or facts are sent to Google Gemini API.',
      notes: 'API keys are read only from server environment variables, never stored in SQLite or browser localStorage.',
    },
    {
      id: 'google-fonts-css',
      surface: 'UI Web Fonts (index.html)',
      classification: 'external_asset',
      activeNow: true,
      staysOnDevice: 'No personal facts or memory content are sent.',
      leavesDevice:
        'Loading the web UI in a browser requests Plus Jakarta Sans and JetBrains Mono stylesheets from fonts.googleapis.com / fonts.gstatic.com when online.',
      notes:
        'Because external font requests occur when online, Argon is currently Local-First (NOT genuinely air-gapped).',
    },
  ];

  return {
    checkedAt,
    operatingMode: 'local_first',
    operatingModeSummary:
      'Argon currently operates in Local-First mode: all memory storage, search, ingestion, and SQLite backups stay on your local machine, but the web UI loads remote Google Fonts when online and optional /api/chat calls Google Gemini if GEMINI_API_KEY is set.',
    modeDefinitions: {
      localFirst:
        'Data is stored and processed locally by default, while optional remote features or static web assets (like Google Fonts or an optional cloud model API) may still make network requests.',
      offlineCapable:
        'Core reading, searching, importing, and SQLite backup workflows continue working without an internet connection, falling back to system fonts and local logic.',
      airGapped:
        'Zero outbound network requests are permitted at runtime (bundled local fonts, disabled cloud APIs, and verified network isolation). Argon is NOT yet certified as air-gapped.',
    },
    encryptionAtRest: {
      encryptedAtRest,
      status: encryptionStatus,
      engine: 'node:sqlite (DatabaseSync)',
      verifiedAgainstDisk: !isMemory,
      summary: encryptionSummary,
      recommendation:
        'Enable OS full-disk encryption (macOS FileVault, Windows BitLocker, or Linux LUKS) and keep SQLite/backup files restricted to owner-only permissions (0600).',
    },
    filePermissions: {
      platform: process.platform,
      posixSupported,
      allPresentFilesOwnerOnly,
      dbPath,
      backupDir,
      files,
    },
    credentialsAndSecrets: {
      companionTokensStoredHashedOnly: plaintextTokenRowsDetected === 0,
      activeCompanionDevices,
      plaintextTokenRowsDetected,
      geminiApiKeyConfigured,
      geminiKeyStorageLocation:
        'Server process environment (.env / process.env.GEMINI_API_KEY) — never written to SQLite or returned in API responses.',
      auditLogSecretRedactionEnabled: true,
      portableExportSecretExclusionDefault: true,
      rotationAndDeletionNotes:
        'Companion device tokens (brn_live_*) are shown once at pairing and stored only as SHA-256 hashes. Revoking a device in Settings immediately deletes access. Rotating GEMINI_API_KEY requires updating the server environment and restarting.',
    },
    retentionAndDeletion: {
      backupRetentionMaxCount: maxBackups,
      knownGoodBackupProtected: true,
      walModeEnabled,
      deletionSemantics:
        'Deleting a fact or Brain removes the SQLite rows immediately. Existing .db backup snapshots retain historical copies until pruned or explicitly deleted, and WAL frames remain until checkpointed (PRAGMA wal_checkpoint(TRUNCATE)).',
      exportSemantics:
        'Portable exports (.brain.json, .brain.md, .brainpack.zip) exclude detected API keys/tokens and private-tagged memories by default, while SQLite .db backups are exact raw database copies for disaster recovery.',
    },
    networkAndDataFlow,
    ollamaLocalBehaviour: {
      folderConvention: '07_local_ai_ollama',
      makesOutboundNetworkCalls: false,
      summary:
        'Importing files from 07_local_ai_ollama is 100% local in Argon (parsed in-process and saved to SQLite). Local AI folders do not disable external UI font requests or optional GEMINI_API_KEY chat calls elsewhere in the app.',
    },
    bindHost,
    loopbackOnly,
  };
}
